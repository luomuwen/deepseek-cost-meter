import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBalanceStore, balanceWallets, walletAmounts } from '../src/client-balance.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const ready = (balance = '12.3456') => ({ ok: true, value: { status: 'ready',
  value: [{ currency: 'CNY', balance }], bonusWallets: [{ currency: 'CNY', balance: '1' }] } });
function fixture(query = async () => ready(), timeoutMs = 15000) {
  let clock = 100000, shown = true, wake, ended = false, calls = 0, accepted = 0;
  const queue = [], requests = [];
  const stream = {
    async *[Symbol.asyncIterator]() {
      while (!ended) {
        if (!queue.length) await new Promise(resolve => { wake = resolve; });
        while (queue.length) yield queue.shift();
      }
    },
    dispose() { ended = true; wake?.(); },
  };
  const remote = { account: { getBalance: metadata => { calls++; requests.push(metadata); return query(); } },
    $stream: () => stream };
  const store = createBalanceStore({ now: () => clock, visible: () => shown, timeoutMs });
  const close = store.connect(remote, () => ({ version: 'test', locale: 'zh', timezoneOffsetSeconds: 28800 }));
  return { store, close, calls: () => calls, requests,
    async account(status = 'credential-stored') {
      queue.push({ value: { status }, accept() { accepted++; } }); wake?.(); await tick();
    },
    advance(ms = 60000) { clock += ms; }, hide(value = true) { shown = !value; },
    stop() { stream.dispose(); }, accepted: () => accepted };
}

test('official wallets are summed exactly by currency, including zero, negative and sub-cent balances', () => {
  const wallets = balanceWallets({ value: [{ currency: 'CNY', balance: '0.1' }, { currency: 'USD', balance: '0' }],
    bonusWallets: [{ currency: 'CNY', balance: '0.2' }] });
  assert.equal(walletAmounts(wallets), 'CNY 0.30 · USD 0.00');
  assert.equal(walletAmounts([{ currency: 'CNY', balance: '0.000001' }]), 'CNY <0.01');
  assert.equal(walletAmounts([{ currency: 'USD', balance: '-12.345' }]), 'USD -12.35');
  assert.throws(() => balanceWallets({ value: [{ currency: 'CNY', balance: 'NaN' }], bonusWallets: [] }));
  assert.throws(() => balanceWallets({ value: [{ currency: 'CNY', balance: '2' }, { currency: 'CNY', balance: '3' }], bonusWallets: [] }));
});
test('signed-out accounts never query; signed-in reads use the host and manual refresh is throttled', async () => {
  const f = fixture();
  try {
    await f.account('signed-out'); assert.equal(f.calls(), 0);
    assert.equal(f.store.getSnapshot().status, 'signed-out');
    await f.account(); assert.equal(f.calls(), 1);
    assert.equal(walletAmounts(f.store.getSnapshot().wallets), 'CNY 13.35');
    assert.deepEqual(f.requests[0], { version: 'test', locale: 'zh', timezoneOffsetSeconds: 28800 });
    await f.store.refresh(true); assert.equal(f.calls(), 1);
    f.advance(5000); await f.store.refresh(true); assert.equal(f.calls(), 2);
    assert.equal(f.accepted(), 2);
  } finally { f.close(); }
});
test('visibility gates automatic queries; becoming visible can refresh a stale result', async () => {
  const f = fixture();
  try {
    f.hide(); await f.account(); assert.equal(f.calls(), 0);
    f.hide(false); await f.store.refresh(); assert.equal(f.calls(), 1);
    f.advance(); f.hide(); await f.store.refresh(); assert.equal(f.calls(), 1);
    f.hide(false); await f.store.refresh(); assert.equal(f.calls(), 2);
  } finally { f.close(); }
});
test('failed queries retain same-account balances as stale, without exposing remote errors', async () => {
  let fail = false;
  const f = fixture(async () => { if (fail) throw new Error('SECRET must not enter the UI'); return ready(); });
  try {
    await f.account(); fail = true; f.advance(); await f.store.refresh();
    assert.equal(f.store.getSnapshot().status, 'failed');
    assert.equal(f.store.getSnapshot().wallets.length, 2);
    assert.equal(f.store.getSnapshot().busy, false);
    assert.ok(!JSON.stringify(f.store.getSnapshot()).includes('SECRET'));
    await f.account('signed-out'); assert.equal(f.store.getSnapshot().wallets.length, 0);
  } finally { f.close(); }
});
test('concurrent refreshes share the same in-flight request', async () => {
  const resolvers = [];
  const f = fixture(() => new Promise(resolve => resolvers.push(resolve)));
  try {
    await f.account();
    const refresh = f.store.refresh(true);
    assert.equal(f.calls(), 1);
    resolvers[0](ready()); await refresh;
    assert.equal(f.store.getSnapshot().status, 'ready');
  } finally { f.close(); }
});
test('a new account and disposal both reject old in-flight responses', async () => {
  const resolvers = [];
  const f = fixture(() => new Promise(resolve => resolvers.push(resolve)));
  try {
    await f.account();
    await f.account('signed-out'); await f.account();
    assert.equal(f.calls(), 2);
    resolvers[0](ready('999')); await tick();
    assert.equal(f.store.getSnapshot().wallets.length, 0);
    resolvers[1](ready('2')); await tick();
    assert.equal(walletAmounts(f.store.getSnapshot().wallets), 'CNY 3.00');
    f.advance(); void f.store.refresh(); f.close();
    resolvers[2](ready('888')); await tick();
    assert.equal(f.store.getSnapshot().wallets.length, 0);
  } finally { f.close(); }
});
test('null grant and ended account streams clear balances instead of displaying zero', async () => {
  const f = fixture(async () => ({ ok: true, value: null }));
  await f.account();
  assert.equal(f.store.getSnapshot().status, 'signed-out');
  f.stop(); await tick();
  assert.equal(f.store.getSnapshot().status, 'disconnected');
  assert.equal(f.store.getSnapshot().wallets.length, 0);
  f.close();
});
test('a hung balance query times out and a late result cannot overwrite a retry', async () => {
  const resolvers = [];
  const f = fixture(() => new Promise(resolve => resolvers.push(resolve)), 10);
  try {
    await f.account(); await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.store.getSnapshot().status, 'failed');
    assert.equal(f.store.getSnapshot().busy, false);
    f.advance(); const retry = f.store.refresh();
    resolvers[1](ready('3')); await retry;
    resolvers[0](ready('999')); await tick();
    assert.equal(walletAmounts(f.store.getSnapshot().wallets), 'CNY 4.00');
  } finally { f.close(); }
});
