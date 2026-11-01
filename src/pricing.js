import { z } from 'zod';

const decimal = z.string().regex(/^\d+(?:\.\d{1,6})?$/);
const buckets = z.object({ input: decimal.nullable(), cacheRead: decimal.nullable(), cacheWrite: decimal.nullable(), output: decimal.nullable() }).strict();
export const providerModeSchema = z.record(z.string().min(1), z.enum(['metered', 'subscription', 'usage-only']));
export const priceRowSchema = z.object({
  provider: z.string().min(1), models: z.array(z.string().min(1)).min(1),
  currency: z.string().regex(/^[A-Z]{3}$/), offPeak: buckets, peak: buckets.optional(),
  source: z.string().min(1).optional(), effectiveFrom: z.iso.datetime({ offset: true }).optional(),
}).strict();
export const rateSchema = z.object({
  version: z.string().min(1), source: z.string(),
  effectiveFrom: z.iso.datetime({ offset: true }),
  calendarThrough: z.iso.date(), holidays: z.array(z.iso.date()),
  providerModes: providerModeSchema.optional(),
  prices: z.array(priceRowSchema).min(1),
}).strict().superRefine((value, ctx) => {
  const seen = new Set();
  for (const row of value.prices) for (const model of row.models) {
    const key = JSON.stringify([row.provider, model]);
    if (seen.has(key)) ctx.addIssue({ code: 'custom', message: `Duplicate price route: ${key}` });
    seen.add(key);
  }
});

/** Add exact routes without replacing unrelated defaults; a user row wins per model. */
export function mergeRates(base, extra = [], providerModes = {}) {
  const additions = new Set();
  const rows = base.prices.flatMap(row => row.models.map(model => ({ ...row, models: [model] })));
  for (const row of extra) for (const model of row.models) {
    if (!row.effectiveFrom) throw new Error('additionalRates requires an explicit effectiveFrom');
    const key = JSON.stringify([row.provider, model]);
    if (additions.has(key)) throw new Error(`Duplicate additional price route: ${key}`);
    additions.add(key);
    const at = rows.findIndex(old => old.provider === row.provider && old.models[0] === model);
    const added = { ...row, source: row.source ?? 'user configuration', models: [model] };
    if (at >= 0) rows[at] = added;
    else rows.push(added);
  }
  return rateSchema.parse({ ...base, prices: rows, providerModes: { ...base.providerModes, ...providerModes } });
}
export const catalogSchema = z.array(z.object({
  id: z.string(), startsAt: z.number().int().nonnegative(), rates: rateSchema,
}).strict());

/** Select the historical catalog and exact provider/model, using request start time. */
export function resolvePrice(catalog, route, time) {
  const snapshot = catalog.findLast(row => row.startsAt <= time);
  if (!snapshot || time < Date.parse(snapshot.rates.effectiveFrom)) return { issue: 'price-unavailable' };
  const billingMode = snapshot.rates.providerModes?.[route?.provider] ?? 'metered';
  if (billingMode !== 'metered') return { billingMode, issue: billingMode };
  // These are the two official route ids shipped by Harness. Explicit configuration wins.
  const officialProvider = ['deepseek-account', 'deepseek-official'].includes(route?.provider) ? 'deepseek' : route?.provider;
  const row = snapshot.rates.prices.find(row => row.provider === route?.provider && row.models.includes(route?.model))
    ?? snapshot.rates.prices.find(row => row.provider === officialProvider && row.models.includes(route?.model));
  if (!row || (row.effectiveFrom && time < Date.parse(row.effectiveFrom))) return { issue: 'price-unavailable' };
  const local = new Date(time + 8 * 3600_000);
  const date = local.toISOString().slice(0, 10);
  if (row.peak && date > snapshot.rates.calendarThrough) return { issue: 'calendar-expired' };
  const hour = local.getUTCHours();
  const weekday = local.getUTCDay() > 0 && local.getUTCDay() < 6;
  const peak = row.peak && weekday && !snapshot.rates.holidays.includes(date)
    && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18));
  return { currency: row.currency, rates: peak ? row.peak : row.offPeak,
    period: row.peak ? (peak ? 'peak' : 'offPeak') : 'flat', version: snapshot.rates.version, snapshotId: snapshot.id,
    source: row.source ?? snapshot.rates.source };
}

/** Price only evidenced quantities. Unknown nonzero buckets never become free. */
export function calculateKnownCost(usage, prices) {
  let sum = 0n;
  const missing = [];
  let priced = false;
  for (const key of ['input', 'cacheRead', 'cacheWrite', 'output']) {
    if (usage[key] === null) { missing.push(key); continue; }
    if (usage[key] === 0) continue;
    if (prices[key] === null) { missing.push(key); continue; }
    sum += BigInt(costPico({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, [key]: usage[key] },
      { input: '0', cacheRead: '0', cacheWrite: '0', output: '0', [key]: prices[key] }));
    priced = true;
  }
  const exactZero = Object.values(usage).every(value => value === 0);
  return { amountPico: sum.toString(), missing, hasAmount: priced || exactZero };
}

/** Preserve individually reported counters for display even when the full split is absent. */
export function displayUsage(raw) {
  if (!raw) return null;
  const exact = normalizeUsage(raw);
  if (exact) return exact;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const usage = { input: count(raw.inputTokens), cacheRead: count(raw.cacheReadTokens),
    cacheWrite: count(raw.cacheWriteTokens), output: count(raw.outputTokens) };
  return Object.values(usage).some(value => value !== null) ? usage : null;
}

/** Counts × millionths-of-currency per million tokens = trillionths of currency. */
export function costPico(usage, prices) {
  let sum = 0n;
  for (const key of ['input', 'cacheRead', 'cacheWrite', 'output']) {
    const [whole, fraction = ''] = prices[key].split('.');
    const price = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
    sum += BigInt(usage[key]) * price;
  }
  return sum.toString();
}

/** Keep missing buckets unknown unless the exact total proves their combined value is zero. */
export function normalizeUsage(raw) {
  if (!raw) return null;
  const valid = value => Number.isSafeInteger(value) && value >= 0;
  if (!valid(raw.inputTokens) || !valid(raw.outputTokens)) return null;
  for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens']) {
    if (raw[key] !== undefined && !valid(raw[key])) return null;
  }
  if (raw.reasoningTokens > raw.outputTokens) return null;
  const known = raw.inputTokens + raw.outputTokens + (raw.cacheReadTokens ?? 0) + (raw.cacheWriteTokens ?? 0);
  if (!Number.isSafeInteger(known)) return null;
  const missing = raw.cacheReadTokens === undefined || raw.cacheWriteTokens === undefined;
  if (raw.totalTokens !== undefined && raw.totalTokens !== known) return null;
  if (missing && raw.totalTokens === undefined) return null;
  return { input: raw.inputTokens, output: raw.outputTokens,
    cacheRead: raw.cacheReadTokens ?? 0, cacheWrite: raw.cacheWriteTokens ?? 0 };
}
