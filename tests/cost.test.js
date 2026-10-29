import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProjection, stateSchema } from '../src/projection.js';
import { resolvePrice, normalizeUsage, costPico, rateSchema } from '../src/pricing.js';

const rates = rateSchema.parse(JSON.parse(readFileSync(new URL('../rates.json', import.meta.url))));
const time = Date.parse('2026-10-29T10:00:00+08:00');
const catalog = [{ id: 'first', startsAt: Date.parse(rates.effectiveFrom), rates }];
const p = createProjection(catalog, 1);
const usage = { inputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 0, outputTokens: 100, totalTokens: 3100, reasoningTokens: 50 };
const source = { kind: 'model', provider: 'deepseek', model: 'deepseek-v4-pro' };
const message = (u = usage, src = source) => ({ turn: 1, step: 1, usage: u,
  message: { source: src }, stream: [] });
const E = (type, data, seq, at = time) => ({ type, data, seq, time: at });
function events(middle = [E('assistant/message', message(), 3)]) {
  return [E('turn/start', { turn: 1 }, 0), E('step/start', { turn: 1, step: 1 }, 1),
    E('request/header', { header: { config: source } }, 2), ...middle,
    E('step/end', { turn: 1, step: 1 }, 90), E('turn/end', { turn: 1, reason: { kind: 'completed' } }, 91)];
}
function fold(list, projection = p, initial = projection.init({}, 0)) {
  return list.reduce((state, event) => projection.apply(state, event), initial);
}

test('official peak CNY price uses disjoint inputs and counts reasoning once', () => {
  const state = fold(events());
  assert.equal(state.view.turns[1].totals.CNY, '12300000000'); // 0.009 + 0.0006 + 0.0027 = 0.0123
  assert.equal(state.view.turns[1].unknown, 0);
  assert.equal(state.view.turns[1].calls, 1);
  assert.deepEqual(stateSchema.parse(state), state);
});
test('final usage replaces cumulative samples, never sums them', () => {
  const data = { ...message(), usage: undefined, stream: [
    { type: 'chunk', chunk: { type: 'usage', usage: { ...usage, inputTokens: 1 } } },
    { type: 'chunk', chunk: { type: 'usage', usage } },
  ] };
  assert.equal(fold(events([E('assistant/message', data, 3)])).view.totals.CNY, '12300000000');
});
test('failed attempt plus retry both count, using historical request header', () => {
  const state = fold(events([
    E('assistant/attempt', { turn: 1, step: 1, stream: [{ type: 'chunk', chunk: { type: 'usage', usage } }] }, 3),
    E('llm/retry', { turn: 1, step: 1 }, 4),
    E('llm/retry-started', { turn: 1, step: 1 }, 5),
    E('assistant/message', message(), 6),
  ]));
  assert.equal(state.view.turns[1].calls, 2);
  assert.equal(state.view.totals.CNY, '24600000000');
});
test('missing usage on cancellation is unknown, not zero cost', () => {
  const state = fold(events([E('assistant/attempt', { turn: 1, step: 1, stream: [] }, 3)]));
  assert.deepEqual(state.view.totals, {});
  assert.equal(state.view.turns[1].unknown, 1);
});
test('unsettled stream on turn end is marked incomplete', () => {
  assert.equal(fold(events([])).view.turns[1].unknown, 1);
});
test('mixed models and multiple steps are priced independently', () => {
  const list = events();
  list.splice(-1, 0, E('step/start', { turn: 1, step: 2 }, 92),
    E('assistant/message', { ...message(usage, { ...source, model: 'deepseek-flash' }), step: 2 }, 93),
    E('step/end', { turn: 1, step: 2 }, 94));
  const result = fold(list).view.turns[1];
  assert.equal(result.calls, 2);
  assert.equal(result.lines.length, 2);
  assert.equal(result.totals.CNY, '15180000000');
});
test('unknown provider never inherits official DeepSeek pricing', () => {
  const result = fold(events([E('assistant/message', message(usage, { ...source, provider: 'proxy' }), 3)])).view.turns[1];
  assert.equal(result.unknown, 1);
  assert.equal(result.lines[0].issue, 'price-unavailable');
});
test('official API and signed-in Desktop routes use public pricing unless explicitly configured', () => {
  for (const provider of ['deepseek-official', 'deepseek-account']) {
    const result = fold(events([E('assistant/message', message(usage, { ...source, provider }), 3)])).view.turns[1];
    assert.equal(result.totals.CNY, '12300000000');
    assert.equal(result.unknown, 0);
  }
  const explicit = [{ ...catalog[0], rates: { ...rates, prices: [...rates.prices,
    { ...rates.prices[1], provider: 'deepseek-account', currency: 'USD' }] } }];
  assert.equal(resolvePrice(explicit, { ...source, provider: 'deepseek-account' }, time).currency, 'USD');
});
test('no-call turn is exactly zero calls', () => {
  const result = fold([E('turn/start', { turn: 1 }, 0), E('turn/end', { turn: 1 }, 1)]).view.turns[1];
  assert.equal(result.calls, 0);
  assert.equal(result.unknown, 0);
});
test('fork history is displayed but excluded from new spending', () => {
  const state = fold(events(), p, p.init({}, 100));
  assert.equal(state.view.turns[1].inherited, true);
  assert.deepEqual(state.view.totals, {});
  assert.equal(state.view.turns[1].totals.CNY, '12300000000');
});
test('checkpoint suffix recovery equals full replay and irrelevant events preserve identity', () => {
  const list = events();
  const half = stateSchema.parse(JSON.parse(JSON.stringify(fold(list.slice(0, 4)))));
  assert.deepEqual(fold(list.slice(4), p, half), fold(list));
  assert.equal(p.apply(half, E('tool/result', { turn: 1 }, 77)), half);
  assert.equal(half.view.turns[1], undefined);
});
test('price versions do not retroactively change old turns', () => {
  const newer = { ...rates, version: 'new', prices: rates.prices.map(row => ({ ...row,
    peak: { input: '100', output: '100', cacheRead: '100', cacheWrite: '100' } })) };
  const newP = createProjection([...catalog, { id: 'second', startsAt: time + 1, rates: newer }], 2);
  assert.equal(fold(events(), newP).view.totals.CNY, '12300000000');
  assert.equal(resolvePrice([...catalog, { id: 'second', startsAt: time + 1, rates: newer }], source, time + 2).version, 'new');
});
test('peak boundaries, weekends, holidays and expired calendars', () => {
  const period = at => resolvePrice(catalog, source, Date.parse(at)).period;
  assert.equal(period('2026-10-29T08:59:59+08:00'), 'offPeak');
  assert.equal(period('2026-10-29T09:00:00+08:00'), 'peak');
  assert.equal(period('2026-10-29T12:00:00+08:00'), 'offPeak');
  assert.equal(period('2026-10-29T14:00:00+08:00'), 'peak');
  assert.equal(period('2026-10-29T18:00:00+08:00'), 'offPeak');
  assert.equal(period('2026-10-31T10:00:00+08:00'), 'offPeak');
  const holidayCatalog = [{ ...catalog[0], rates: { ...rates, holidays: ['2026-10-29'] } }];
  assert.equal(resolvePrice(holidayCatalog, source, time).period, 'offPeak');
  assert.equal(resolvePrice(catalog, source, Date.parse('2027-01-04T10:00:00+08:00')).issue, 'calendar-expired');
});
test('incomplete, negative and inconsistent counters are never fabricated', () => {
  assert.equal(normalizeUsage({ inputTokens: 1, outputTokens: 2 }), null);
  assert.equal(normalizeUsage({ ...usage, totalTokens: 999 }), null);
  assert.equal(normalizeUsage({ ...usage, inputTokens: -1 }), null);
  assert.equal(normalizeUsage({ ...usage, reasoningTokens: 101 }), null);
  assert.deepEqual(normalizeUsage({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }), { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 });
});
test('fractional money stays exact and duplicate route configuration fails', () => {
  assert.equal(costPico({ input: 3, output: 0, cacheRead: 0, cacheWrite: 0 },
    { input: '0.000001', output: '0', cacheRead: '0', cacheWrite: '0' }), '3');
  assert.throws(() => rateSchema.parse({ ...rates, prices: [...rates.prices, rates.prices[0]] }));
});

export { events, fold };
