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
  const pluginRoot = path.resolve(__dirname, '..');
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

    const { clientFactory } = await import(pathToFileURL(path.join(pluginRoot, 'src/client-factory.js')));
    const dictionaries = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang,
      JSON.parse(await fs.readFile(path.join(pluginRoot, 'locale', lang + '.json'), 'utf8'))])));
    const testRequire = createRequire(path.join(pluginRoot, 'package.json'));
    const browser = clientFactory(testRequire, dictionaries);
    const cleanups = [];
    let Component, registered = 0;
    global.document = { createElement: () => ({ dataset: {}, remove() { registered--; } }), head: { appendChild() { registered++; } } };
    browser.apply({
      effect(fn) { cleanups.push(fn()); },
      locale: { register() { return () => {}; } },
      slots: { inject(name, fn) { assert.equal(name, 'conversation.chat.turnTail'); cleanups.push(fn()); },
        register(options, C) { Component = C; return () => { Component = null; }; } },
    });
    const React = testRequire('react');
    const { renderToStaticMarkup } = testRequire('react-dom/server');
    const t = (key, vars = {}) => dictionaries.zh[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));
    const html = renderToStaticMarkup(React.createElement(Component, { turn: { turn: 1 }, useProjection: () => snapshot, t }));
    assert.match(html, /本轮模型费用约 CNY/);
    assert.match(html, /未缓存输入/);
    assert.match(html, /deepseek-v4-pro/);
    for (const cleanup of cleanups.reverse()) if (cleanup) cleanup();
    assert.equal(registered, 0);
    assert.equal(Component, null);
    await fiber.dispose();
    assert.equal(ctx.sessionProjections.snapshot(session).values.localTurnCost, undefined);
    const reloaded = ctx.plugin(plugin, config);
    await reloaded;
    assert.deepEqual(ctx.sessionProjections.snapshot(session).values.localTurnCost, snapshot);
    console.log('PASS: real Harness services, durable rate catalog, session replay, React rendering, unload/reload.');
  } finally {
    await ctx.fiber.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
