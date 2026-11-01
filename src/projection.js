import { z } from 'zod';
import { resolvePrice, normalizeUsage, displayUsage, calculateKnownCost } from './pricing.js';

const count = z.number().int().nonnegative();
const amount = z.string().regex(/^\d+$/);
const route = z.object({ provider: z.string(), model: z.string() }).strict();
const usage = z.object({ input: count.nullable(), cacheRead: count.nullable(), cacheWrite: count.nullable(), output: count.nullable() }).strict();
const line = z.object({
  provider: z.string(), model: z.string(), calls: count, currency: z.string().nullable(),
  amountPico: amount, usage: usage.nullable(), issue: z.string().nullable(),
  period: z.string().nullable(), version: z.string().nullable(),
  rates: z.record(z.string(), z.string().nullable()).nullable(),
  billingMode: z.enum(['metered', 'subscription', 'usage-only']), hasAmount: z.boolean(),
  missingPrices: z.array(z.string()), source: z.string().nullable(),
}).strict();
const turn = z.object({ turn: count, startSeq: count, endSeq: count.optional(),
  inherited: z.boolean(), calls: count, unknown: count, lines: z.array(line),
  totals: z.record(z.string(), amount), endReason: z.string().optional(),
  sessionTotals: z.record(z.string(), amount).optional(), sessionUnknown: count.optional(),
  unpriced: count, sessionUnpriced: count.optional(),
}).strict();
export const viewSchema = z.object({
  turns: z.record(z.string(), turn), totals: z.record(z.string(), amount), unknown: count, unpriced: count,
}).strict();
const attempt = z.object({ step: count, time: count, settled: line.nullable() }).strict();
export const stateSchema = z.object({ route: route.nullable(), inheritedEventCount: count,
  current: turn.nullable(), attempt: attempt.nullable(), view: viewSchema,
}).strict();

const emptyTotals = () => ({});
function addTotals(a, b) {
  const result = { ...a };
  for (const [currency, value] of Object.entries(b)) result[currency] = (BigInt(result[currency] ?? '0') + BigInt(value)).toString();
  return result;
}

function lastUsage(event) {
  if (event.data.usage !== undefined) return event.data.usage;
  for (let i = (event.data.stream?.length ?? 0) - 1; i >= 0; i--) {
    const row = event.data.stream[i];
    if (row.type === 'chunk' && row.chunk.type === 'usage') return row.chunk.usage;
  }
}

function settle(state, event, catalog) {
  const source = event?.data.message?.source;
  const route = source?.kind === 'model' ? source : state.route;
  const price = resolvePrice(catalog, route, state.attempt.time);
  const raw = event ? lastUsage(event) : null;
  const usage = displayUsage(raw);
  const exact = normalizeUsage(raw);
  const billingMode = price.billingMode ?? 'metered';
  // Inconsistent usage can be displayed for diagnosis, but must never be billed.
  const cost = exact && price.rates ? calculateKnownCost(exact, price.rates) : null;
  const issue = !exact ? 'usage-unavailable' : price.issue ?? (cost?.missing.length ? 'price-incomplete' : null);
  return { provider: route?.provider ?? '?', model: route?.model ?? '?', calls: 1,
    currency: price.currency ?? null, amountPico: cost?.amountPico ?? '0',
    usage, issue, period: price.period ?? null, version: price.version ?? null, rates: price.rates ?? null,
    billingMode, hasAmount: cost?.hasAmount ?? false, missingPrices: cost?.missing ?? [], source: price.source ?? null };
}

function commitAttempt(state, catalog) {
  if (!state.attempt || !state.current) return state;
  const value = state.attempt.settled ?? settle(state, null, catalog);
  const current = state.current;
  const lines = [...current.lines];
  const keyOf = row => JSON.stringify([row.provider, row.model, row.currency, row.issue, row.version, row.period,
    row.rates, row.billingMode, row.hasAmount, row.missingPrices, row.source]);
  const index = lines.findIndex(row => keyOf(row) === keyOf(value));
  if (index < 0) lines.push(value);
  else {
    const previous = lines[index];
    const merged = previous.usage && value.usage
      ? Object.fromEntries(Object.keys(previous.usage).map(key => [key,
        previous.usage[key] === null || value.usage[key] === null ? null : previous.usage[key] + value.usage[key]])) : null;
    if (merged && Object.values(merged).some(n => n !== null && !Number.isSafeInteger(n))) throw new Error('Token count exceeds safe integer range');
    lines[index] = { ...previous, calls: previous.calls + 1, usage: merged,
      amountPico: (BigInt(previous.amountPico) + BigInt(value.amountPico)).toString() };
  }
  return { ...state, attempt: null, current: { ...current, lines, calls: current.calls + 1,
    unknown: current.unknown + (value.issue && value.billingMode === 'metered' ? 1 : 0),
    unpriced: current.unpriced + (value.billingMode !== 'metered' ? 1 : 0),
    totals: value.hasAmount ? addTotals(current.totals, { [value.currency]: value.amountPico }) : current.totals } };
}

/** Incrementally fold durable settlements; emit a whole view only at turn/end. */
export function createProjection(catalog, stateVersion) {
  return {
    key: 'localTurnCost', stateVersion, stateSchema,
    init: (_header, inheritedEventCount = 0) => ({ route: null, inheritedEventCount,
      current: null, attempt: null, view: { turns: {}, totals: {}, unknown: 0, unpriced: 0 } }),
    apply(state, event) {
      const data = event.data;
      if (event.type === 'request/header') {
        const config = data.header.config;
        return { ...state, route: { provider: config.provider, model: config.model } };
      }
      if (event.type === 'turn/start') return { ...state, attempt: null, current: {
        turn: data.turn, startSeq: event.seq, inherited: event.seq < state.inheritedEventCount,
        calls: 0, unknown: 0, unpriced: 0, lines: [], totals: emptyTotals(),
      } };
      if (!state.current || data.turn !== state.current.turn) return state;
      if (event.type === 'step/start' || event.type === 'llm/retry-started') {
        const next = commitAttempt(state, catalog);
        return { ...next, attempt: { step: data.step, time: event.time, settled: null } };
      }
      if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
        // Incomplete/repaired logs remain visibly incomplete rather than losing an observed call.
        const next = state.attempt ? state : { ...state, attempt: { step: data.step, time: event.time, settled: null } };
        return { ...next, attempt: { ...next.attempt, settled: settle(next, event, catalog) } };
      }
      if (event.type === 'step/end') return commitAttempt(state, catalog);
      if (event.type !== 'turn/end') return state;
      const next = commitAttempt(state, catalog);
      const current = { ...next.current, endSeq: event.seq, endReason: data.reason?.kind ?? 'unknown',
        sessionTotals: next.current.inherited ? state.view.totals : addTotals(state.view.totals, next.current.totals),
        sessionUnknown: state.view.unknown + (next.current.inherited ? 0 : next.current.unknown),
        sessionUnpriced: state.view.unpriced + (next.current.inherited ? 0 : next.current.unpriced) };
      return { ...next, current: null, view: {
        turns: { ...state.view.turns, [current.turn]: current },
        totals: current.inherited ? state.view.totals : addTotals(state.view.totals, current.totals),
        unknown: state.view.unknown + (current.inherited ? 0 : current.unknown),
        unpriced: state.view.unpriced + (current.inherited ? 0 : current.unpriced),
      } };
    },
    wire: { viewSchema, view: state => state.view, summary: false },
  };
}
