import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { clientFactory } from '../src/client-factory.js';
import { createProjection } from '../src/projection.js';

const dictionaries = Object.fromEntries(['zh', 'en'].map(lang => [lang,
  JSON.parse(readFileSync(new URL(`../locale/${lang}.json`, import.meta.url)))]));
const rates = { version: 'dock-fixture', source: 'test', effectiveFrom: '2000-01-01T00:00:00Z',
  calendarThrough: '2000-01-01', holidays: [], providerModes: { plan: 'subscription', local: 'usage-only' },
  prices: ['CNY', 'USD'].map(currency => ({ provider: currency, models: ['model'], currency,
    offPeak: { input: '1', cacheRead: '0.1', cacheWrite: null, output: '4' } })) };
function fixture(providers, inherited = 0) {
  const p = createProjection([{ id: 'fixture', startsAt: 0, rates }], 3);
  let state = p.init({}, inherited), seq = 0;
  const event = (type, data) => { state = p.apply(state, { type, data, seq: seq++, time: 1800000000000 }); };
  providers.forEach((provider, index) => {
    const turn = index + 1;
    const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 1100 };
    event('turn/start', { turn });
    event('step/start', { turn, step: 1 });
    event('request/header', { header: { config: { provider, model: 'model' } } });
    event('assistant/message', { turn, step: 1, usage, message: { source: { kind: 'model', provider, model: 'model' } } });
    event('step/end', { turn, step: 1 });
    event('turn/end', { turn, reason: { kind: 'completed' } });
  });
  return state.view;
}
function mount(initial, lang = 'zh') {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div><button id="outside">Outside</button></body></html>', { url: 'http://localhost/' });
  const saved = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let view = initial, running = false, sessionId = 'first';
  const cleanups = [], components = new Map();
  const plugin = clientFactory(name => {
    assert.ok(['react', 'react-dom'].includes(name));
    return name === 'react' ? React : ReactDOM;
  }, dictionaries);
  plugin.apply({
    effect(fn) { cleanups.push(fn()); },
    locale: { register() { return () => {}; } },
    slots: { inject(_name, fn) { cleanups.push(fn()); }, register(options, component) {
      components.set(options.name, component); return () => components.delete(options.name);
    } },
  });
  const Dock = components.get('conversation.composer.dock');
  const root = createRoot(document.getElementById('root'));
  const t = (key, vars = {}) => {
    assert.ok(dictionaries[lang][key], `Missing translation: ${lang}/${key}`);
    return dictionaries[lang][key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));
  };
  const render = () => act(() => root.render(React.createElement(Dock, { sessionId,
    useProjection: () => view, useSession: select => select({ running }), t })));
  render();
  return {
    button: () => document.querySelector('[data-composer-stat="cost-meter"] button'),
    dialog: () => document.querySelector('[role="dialog"]'),
    click(element) { act(() => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); },
    key(key) { act(() => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }))); },
    update(next = view, nextSession = sessionId, nextRunning = running) { view = next; sessionId = nextSession; running = nextRunning; render(); },
    cleanup() {
      act(() => root.unmount());
      for (const cleanup of cleanups.reverse()) cleanup?.();
      assert.equal(document.querySelector('.dsh-cost-dialog'), null);
      assert.equal(document.querySelector('style[data-plugin="deepseek-cost-meter"]'), null);
      assert.equal(components.size, 0);
      dom.window.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('dock reads the same settled session totals and latest turn, with a working portal', () => {
  const ui = mount(fixture(['CNY', 'CNY']));
  try {
    assert.match(ui.button().textContent, /CNY 0.0028/);
    ui.click(ui.button());
    assert.equal(ui.button().getAttribute('aria-expanded'), 'true');
    assert.equal(ui.dialog().parentElement, document.body);
    assert.match(ui.dialog().textContent, /CNY 0.002800/);
    assert.match(ui.dialog().textContent, /CNY 0.001400/);
    assert.match(ui.dialog().textContent, /2 次调用/);
    assert.match(ui.dialog().textContent, /2,200 tokens/);
    ui.key('Escape');
    assert.equal(ui.dialog(), null);
    assert.equal(document.activeElement, ui.button());
    ui.click(ui.button());
    ui.click(document.getElementById('outside'));
    assert.equal(ui.dialog(), null);
  } finally { ui.cleanup(); }
});
test('session switch closes the panel and does not leak costs; running turn remains unsettled', () => {
  const ui = mount(fixture(['CNY']));
  try {
    ui.click(ui.button());
    ui.update(undefined, undefined, true);
    assert.match(ui.dialog().textContent, /本轮进行中，尚未计入/);
    assert.match(ui.dialog().textContent, /CNY 0.001400/);
    ui.update(fixture(['plan']), 'second', false);
    assert.equal(ui.dialog(), null);
    assert.match(ui.button().textContent, /套餐用量/);
    assert.doesNotMatch(ui.button().textContent, /CNY|0\.0000/);
    ui.click(ui.button());
    assert.match(ui.dialog().textContent, /1,100 tokens/);
    assert.doesNotMatch(ui.dialog().textContent, /CNY/);
    ui.click(ui.dialog().querySelector('button'));
    assert.equal(document.activeElement, ui.button());
  } finally { ui.cleanup(); }
});
test('multi-currency, missing prices, plan and local usage remain distinct in both languages', () => {
  for (const lang of ['zh', 'en']) {
    const ui = mount(fixture(['CNY', 'USD', 'plan', 'local', 'unknown']), lang);
    try {
      assert.match(ui.button().textContent, /CNY 0.0014 \+ USD 0.0014/);
      assert.match(ui.button().textContent, lang === 'zh' ? /已知/ : /Known/);
      ui.click(ui.button());
      assert.match(ui.dialog().textContent, lang === 'zh' ? /费用待估算/ : /Cost unavailable/);
      assert.match(ui.dialog().textContent, lang === 'zh' ? /仅统计用量/ : /Usage only/);
      assert.match(ui.dialog().textContent, lang === 'zh' ? /套餐用量/ : /Plan usage/);
      assert.match(ui.dialog().textContent, lang === 'zh' ? /1 次调用缺少/ : /1 call/);
    } finally { ui.cleanup(); }
  }
});
test('inherited turns are excluded; absent data is loading instead of a zero bill', () => {
  const ui = mount(fixture(['CNY', 'USD'], 6));
  try {
    assert.match(ui.button().textContent, /USD/);
    assert.doesNotMatch(ui.button().textContent, /CNY/);
    ui.click(ui.button());
    assert.doesNotMatch(ui.dialog().textContent, /CNY/);
    ui.update(null);
    assert.match(ui.button().textContent, /正在加载/);
    assert.doesNotMatch(ui.dialog().textContent, /CNY|USD|0\.000000/);
    ui.update(fixture([]));
    assert.match(ui.button().textContent, /暂无已完成调用/);
  } finally { ui.cleanup(); }
});
test('panel stays inside viewport and removes its event handlers when closed', () => {
  const ui = mount(fixture(['CNY']));
  const original = HTMLElement.prototype.getBoundingClientRect;
  const active = new Set();
  const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
  document.addEventListener = (type, fn, options) => { active.add(fn); add(type, fn, options); };
  document.removeEventListener = (type, fn, options) => { active.delete(fn); remove(type, fn, options); };
  try {
    HTMLElement.prototype.getBoundingClientRect = function () {
      return this.getAttribute('role') === 'dialog'
        ? { width: 360, height: 400, left: 0, top: 0, bottom: 400 }
        : { width: 100, height: 20, left: 1000, top: 600, bottom: 620 };
    };
    ui.click(ui.button());
    assert.equal(ui.dialog().style.left, `${window.innerWidth - 360 - 12}px`);
    assert.equal(ui.dialog().style.top, '192px');
    assert.equal(active.size, 2); // outside + Escape; one function serves three outside events
    ui.key('Escape');
    assert.equal(active.size, 0);
    ui.click(ui.button());
    assert.equal(active.size, 2);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = original;
    ui.cleanup();
    assert.equal(active.size, 0);
  }
});
