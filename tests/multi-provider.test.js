import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import ReactDOM from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { Config } from '../index.js';
import { createProjection, stateSchema } from '../src/projection.js';
import { rateSchema, resolvePrice, mergeRates, calculateKnownCost, displayUsage } from '../src/pricing.js';
import { clientFactory } from '../src/client-factory.js';
const rates = rateSchema.parse(JSON.parse(readFileSync(new URL('../rates.json', import.meta.url))));
const time = Date.parse('2026-11-01T06:00:00Z');
const catalog = [{ id: 'new', startsAt: Date.parse(rates.effectiveFrom), rates }];
const full = { inputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 0, outputTokens: 100, totalTokens: 3100 };
function replay(calls, { catalog: history = catalog, inherited = 0 } = {}) {
  const p = createProjection(history, 3);
  let seq = 0;
  let state = p.init({}, inherited);
  const event = (type, data) => { state = p.apply(state, { type, data, seq: seq++, time }); };
  event('turn/start', { turn: 1 });
  calls.forEach(({ provider, model = 'unknown-model', usage = full }, i) => {
    const step = i + 1;
    event('step/start', { turn: 1, step });
    event('request/header', { header: { config: { provider, model } } });
    event('assistant/message', { turn: 1, step, usage, message: { source: { kind: 'model', provider, model } } });
    event('step/end', { turn: 1, step });
  });
  event('turn/end', { turn: 1 });
  assert.deepEqual(stateSchema.parse(state), state);
  return state.view;
}
function render(view, lang = 'zh') {
  const dict = JSON.parse(readFileSync(new URL('../locale/' + lang + '.json', import.meta.url)));
  const browser = clientFactory(name => { assert.ok(['react', 'react-dom'].includes(name)); return name === 'react' ? React : ReactDOM; }, { [lang]: dict });
  let Component;
  browser.apply({ effect() {}, slots: { inject(_name, fn) { fn(); }, register(options, C) { if (options.name === 'conversation.chat.turnTail') Component = C; } } });
  return renderToStaticMarkup(React.createElement(Component, { turn: { turn: 1 }, useProjection: () => view,
    t: (key, vars = {}) => { assert.ok(dict[key], `Missing locale: ${key}`); return dict[key].replace(/\{(\w+)\}/g, (_, key) => String(vars[key])); } }));
}

test('Kimi CN K2.6 uses official CNY price, not the SDK USD directory', () => {
  const view = replay([{ provider: 'moonshotai-cn', model: 'kimi-k2.6' }]);
  assert.equal(view.totals.CNY, '11400000000'); // .0065 + .0022 + .0027
  assert.equal(view.unknown, 0);
  assert.equal(view.turns[1].lines[0].period, 'flat');
  assert.match(render(view), /CNY 0.011400/);
});
test('unknown K3 write TTL produces a known subtotal and explicit missing write price', () => {
  const view = replay([{ provider: 'moonshotai-cn', model: 'kimi-k3',
    usage: { ...full, cacheWriteTokens: 1500, totalTokens: 4600 } }]);
  assert.equal(view.totals.CNY, '34000000000');
  assert.equal(view.unknown, 1);
  assert.deepEqual(view.turns[1].lines[0].missingPrices, ['cacheWrite']);
  assert.match(render(view), /已知模型费用/);
  assert.match(render(view), /未计价项目：缓存写入/);
  assert.doesNotMatch(render(view), /CNY null/);
});
test('unknown rate on zero usage is harmless, unknown rate on positive usage is not zero cost', () => {
  const prices = { input: '1', cacheRead: null, cacheWrite: null, output: '2' };
  assert.deepEqual(calculateKnownCost({ input: 0, cacheRead: 1, cacheWrite: 0, output: 0 }, prices),
    { amountPico: '0', missing: ['cacheRead'], hasAmount: false });
  assert.deepEqual(calculateKnownCost({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, prices),
    { amountPico: '0', missing: [], hasAmount: true });
});
test('international Kimi and similarly named gateways never inherit CN rates', () => {
  for (const provider of ['moonshotai', 'my-moonshotai-cn']) {
    const view = replay([{ provider, model: 'kimi-k3' }]);
    assert.deepEqual(view.totals, {});
    assert.equal(view.unknown, 1);
    assert.equal(view.turns[1].lines[0].usage.input, 1000);
  }
});
test('new provider prices cannot backdate unverified historical records', () => {
  assert.equal(resolvePrice(catalog, { provider: 'moonshotai-cn', model: 'kimi-k3' }, Date.parse('2026-10-31T12:00:00Z')).issue, 'price-unavailable');
  const before = [{ ...catalog[0], rates: { ...rates, prices: rates.prices.filter(r => r.provider === 'deepseek'), providerModes: {} } }];
  const history = [...before, { ...catalog[0], id: 'future', startsAt: time + 1 }];
  assert.deepEqual(replay([{ provider: 'moonshotai-cn', model: 'kimi-k3' }], { catalog: history }).totals, {});
});
test('plan providers show usable token detail without a fake zero bill', () => {
  for (const provider of ['kimi-coding', 'qwen-token-plan-cn', 'qwen-token-plan', 'qwen-token-plan-individual', 'zai', 'zai-coding-cn']) {
    const view = replay([{ provider }]);
    assert.deepEqual(view.totals, {});
    assert.equal(view.unknown, 0);
    assert.equal(view.unpriced, 1);
    const html = render(view);
    assert.match(html, /本轮套餐用量/);
    assert.match(html, /3,100/);
    assert.doesNotMatch(html, /CNY 0\.000000/);
    render(view, 'en');
  }
});
test('mixed plan and metered calls keep sums and coverage separate', () => {
  const view = replay([{ provider: 'moonshotai-cn', model: 'kimi-k2.6' }, { provider: 'qwen-token-plan-cn' }]);
  assert.equal(view.totals.CNY, '11400000000');
  assert.equal(view.turns[1].sessionUnpriced, 1);
  assert.match(render(view), /本轮已知模型费用/);
  const fork = replay([{ provider: 'qwen-token-plan-cn' }], { inherited: 100 });
  assert.equal(fork.unpriced, 0);
  assert.equal(fork.turns[1].unpriced, 1);
});
test('missing and contradictory usage remain visible but unbilled', () => {
  const partial = { inputTokens: 100, outputTokens: 20 };
  assert.deepEqual(displayUsage(partial), { input: 100, output: 20, cacheRead: null, cacheWrite: null });
  for (const usage of [partial, { ...full, totalTokens: 999 }, { ...full, outputTokens: -1 }]) {
    const view = replay([{ provider: 'moonshotai-cn', model: 'kimi-k3', usage }]);
    assert.equal(view.unknown, 1);
    assert.deepEqual(view.totals, {});
    render(view);
  }
});
test('unknown usage remains unknown when multiple samples are aggregated', () => {
  const view = replay([{ provider: 'custom', usage: { inputTokens: 10, outputTokens: 2 } },
    { provider: 'custom', usage: { inputTokens: 20, outputTokens: 3 } }]);
  assert.deepEqual(view.turns[1].lines[0].usage, { input: 30, output: 5, cacheRead: null, cacheWrite: null });
});
test('additional prices preserve defaults and override only exact provider/model pairs', () => {
  const row = { provider: 'my-qwen', models: ['qwen3.8-27b'], currency: 'CNY', effectiveFrom: '2026-11-01T05:43:39Z',
    offPeak: { input: '3', cacheRead: '0.6', cacheWrite: null, output: '12' } };
  const merged = mergeRates(rates, [row]);
  const c = [{ ...catalog[0], rates: merged }];
  assert.equal(resolvePrice(c, { provider: 'deepseek-official', model: 'deepseek-flash' }, time).currency, 'CNY');
  assert.equal(replay([{ provider: 'my-qwen', model: 'qwen3.8-27b' }], { catalog: c }).totals.CNY, '5400000000');
  assert.equal(resolvePrice(c, { provider: 'my-qwen', model: 'qwen3.8-27b' }, time).source, 'user configuration');
  assert.throws(() => mergeRates(rates, [row, row]), /Duplicate/);
  assert.throws(() => mergeRates(rates, [{ ...row, effectiveFrom: undefined }]), /effectiveFrom/);
});
test('explicit provider modes can override policy without assuming plan API cost', () => {
  const r = mergeRates(rates, [], { 'moonshotai-cn': 'usage-only', 'qwen-token-plan-cn': 'metered' });
  const c = [{ ...catalog[0], rates: r }];
  assert.equal(replay([{ provider: 'moonshotai-cn', model: 'kimi-k3' }], { catalog: c }).unpriced, 1);
  assert.equal(replay([{ provider: 'qwen-token-plan-cn' }], { catalog: c }).unknown, 1);
  assert.throws(() => Config.parse({ providerModes: { any: 'free' } }));
});
test('MiniMax flat-price model is available without enabling a model provider', () => {
  const view = replay([{ provider: 'minimax-cn', model: 'MiniMax-M3.1-Flash' }]);
  assert.equal(view.totals.CNY, '1600000000');
  assert.equal(view.unknown, 0);
});
