// Run with the installed Desktop Electron in Node mode; uses real Harness services and React.
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const runtime = process.env.DSH_RUNTIME_ROOT || '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh';
  const req = createRequire(path.join(runtime, 'package.json'));
  const { Context } = req('@deepseek-ai/cordis');
  const pluginRoot = process.env.DSH_COST_PLUGIN_ROOT || path.resolve(__dirname, '..');
  const plugin = await import(pathToFileURL(path.join(pluginRoot, 'index.js')));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'turn-cost-test-'));
  const ctx = new Context();
  try {
    await ctx.plugin(req('@deepseek-ai/dsh-session').default);
    await ctx.plugin(req('@deepseek-ai/dsh-session-projection').default);
    await ctx.plugin(req('@deepseek-ai/dsh-storage').default);
    await ctx.plugin(req('@deepseek-ai/dsh-storage-json'), { root });
    await ctx.plugin(req('@deepseek-ai/dsh-storage-domain'), { backend: 'json', routes: {} });
    // A fixed flat-rate fixture keeps integration checks independent of today's tariff/calendar.
    const config = { rates: { version: 'integration-fixture', source: 'test',
      effectiveFrom: '2000-01-01T00:00:00Z', calendarThrough: '2000-01-01', holidays: [],
      prices: [{ provider: 'deepseek', models: ['deepseek-v4-pro'], currency: 'CNY',
        offPeak: { input: '1', cacheRead: '0.02', cacheWrite: '1', output: '4' } }] } };
    const fiber = ctx.plugin(plugin, config);
    await fiber;
    const session = ctx.sessions.create();
    const usage = { inputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 0, outputTokens: 100, totalTokens: 3100 };
    session.append('turn/start', { turn: 1 });
    session.append('step/start', { turn: 1, step: 1 });
    session.append('request/header', { reason: 'initial', header: { config: { provider: 'deepseek', model: 'deepseek-v4-pro' } } });
    session.append('assistant/message', { turn: 1, step: 1, usage,
      message: { id: 'cost-test-response', role: 'assistant', source: { kind: 'model', provider: 'deepseek', model: 'deepseek-v4-pro' }, content: [{ type: 'text', text: 'Cost plugin fixture.' }] },
      stream: [{ type: 'chunk', time: Date.now(), chunk: { type: 'usage', usage } },
        { type: 'chunk', time: Date.now(), chunk: { type: 'finish', reason: { kind: 'stop' } } }] }, { surfaceOp: 'append' });
    session.append('step/end', { turn: 1, step: 1 });
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    const snapshot = ctx.sessionProjections.snapshot(session).values.localTurnCost;
    assert.equal(snapshot.turns[1].calls, 1);
    assert.equal(snapshot.turns[1].unknown, 0);
    assert.equal(snapshot.totals.CNY, '1440000000');

    // Upgrade a persisted catalog, then replay mixed metered/plan/unknown routes.
    await fiber.dispose();
    const upgradeConfig = { ...config,
      providerModes: { 'kimi-coding': 'subscription' },
      additionalRates: [{ provider: 'moonshotai-cn', models: ['kimi-k3'], currency: 'CNY',
        effectiveFrom: '2000-01-01T00:00:00Z', source: 'integration fixture, not a live API request',
        offPeak: { input: '20', cacheRead: '2', cacheWrite: null, output: '100' } }] };
    const upgraded = ctx.plugin(plugin, upgradeConfig);
    await upgraded;
    session.append('turn/start', { turn: 2 });
    for (const [index, provider] of ['moonshotai-cn', 'kimi-coding', 'unknown-provider'].entries()) {
      const step = index + 1;
      const mixedUsage = { ...usage, cacheWriteTokens: 50, totalTokens: 3150 };
      session.append('step/start', { turn: 2, step });
      session.append('request/header', { reason: 'initial', header: { config: { provider, model: 'kimi-k3' } } });
      session.append('assistant/message', { turn: 2, step, usage: mixedUsage,
        message: { id: `mixed-${step}`, role: 'assistant', source: { kind: 'model', provider, model: 'kimi-k3' },
          content: [{ type: 'text', text: 'Synthetic multi-provider fixture.' }] }, stream: [] }, { surfaceOp: 'append' });
      session.append('step/end', { turn: 2, step });
    }
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } });
    const mixed = ctx.sessionProjections.snapshot(session).values.localTurnCost;
    assert.deepEqual(mixed.turns[1], snapshot.turns[1]);
    assert.equal(mixed.turns[2].calls, 3);
    assert.equal(mixed.turns[2].unpriced, 1);
    assert.equal(mixed.turns[2].unknown, 2);
    assert.equal(mixed.turns[2].totals.CNY, '34000000000');
    assert.deepEqual(mixed.turns[2].lines[0].missingPrices, ['cacheWrite']);

    const dictionaries = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang,
      JSON.parse(await fs.readFile(path.join(pluginRoot, 'locale', lang + '.json'), 'utf8'))])));
    const testRequire = createRequire(path.join(path.resolve(__dirname, '..'), 'package.json'));
    const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, 'package.json'), 'utf8'));
    let registration;
    const sandbox = { window: { __ModuleLoader__: { load(value) { registration = value; } } } };
    require('node:vm').runInNewContext(await fs.readFile(path.join(pluginRoot, 'client.js'), 'utf8'), sandbox);
    assert.equal(registration.id, manifest.name);
    const browser = registration.factory(testRequire);
    const cleanups = [];
    let Component, Dock, registered = 0;
    global.document = { createElement: () => ({ dataset: {}, remove() { registered--; } }), head: { appendChild() { registered++; } } };
    sandbox.document = global.document;
    browser.apply({
      effect(fn) { cleanups.push(fn()); },
      locale: { register() { return () => {}; } },
      slots: { inject(name, fn) { assert.ok(['conversation.chat.turnTail', 'conversation.composer.dock'].includes(name)); cleanups.push(fn()); },
        register(options, C) {
          if (options.name === 'conversation.chat.turnTail') { Component = C; return () => { Component = null; }; }
          assert.equal(options.order, 2);
          Dock = C; return () => { Dock = null; };
        } },
    });
    const React = testRequire('react');
    const { renderToStaticMarkup } = testRequire('react-dom/server');
    const t = (key, vars = {}) => dictionaries.zh[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));
    const html = renderToStaticMarkup(React.createElement(Component, { turn: { turn: 1 }, useProjection: () => snapshot, t }));
    assert.match(html, /本轮模型费用约 CNY/);
    assert.match(html, /未缓存输入/);
    assert.match(html, /deepseek-v4-pro/);
    const mixedHtml = renderToStaticMarkup(React.createElement(Component, { turn: { turn: 2 }, useProjection: () => mixed, t }));
    assert.match(mixedHtml, /0.034000/);
    assert.match(mixedHtml, /套餐/);
    assert.match(mixedHtml, /缓存写入/);
    assert.match(mixedHtml, /unknown-provider/);
    const dockHtml = renderToStaticMarkup(React.createElement(Dock, { sessionId: 'synthetic',
      useProjection: () => mixed, useSession: select => select({ running: false }), t }));
    assert.match(dockHtml, /data-composer-stat="cost-meter"/);
    assert.match(dockHtml, /CNY 0.0354/);
    assert.match(dockHtml, /已知费用/);
    for (const cleanup of cleanups.reverse()) if (cleanup) cleanup();
    assert.equal(registered, 0);
    assert.equal(Component, null);
    assert.equal(Dock, null);
    await upgraded.dispose();
    assert.equal(ctx.sessionProjections.snapshot(session).values.localTurnCost, undefined);
    const reloaded = ctx.plugin(plugin, upgradeConfig);
    await reloaded;
    assert.deepEqual(ctx.sessionProjections.snapshot(session).values.localTurnCost, mixed);
    console.log('PASS: real Harness services, catalog upgrade, mixed providers, partial prices, session replay, turn-tail and composer-dock rendering, unload/reload.');
  } finally {
    await ctx.fiber.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
