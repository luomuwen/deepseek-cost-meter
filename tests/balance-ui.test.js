import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { createBalanceComponent } from '../src/client-balance-view.js';
import { balanceWallets, walletAmounts } from '../src/client-balance.js';

test('sidebar balance supports both languages, wallet details, refresh, collapsed mode, stale and signed-out states', () => {
  for (const lang of ['zh', 'en']) {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><button id="outside">Outside</button></body></html>');
    const saved = new Map();
    for (const [key, value] of Object.entries({ document: dom.window.document, window: dom.window, IS_REACT_ACT_ENVIRONMENT: true })) {
      saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const dict = JSON.parse(readFileSync(new URL(`../locale/${lang}.json`, import.meta.url)));
    const t = (key, vars = {}) => { assert.ok(dict[key]); return dict[key].replace(/\{(\w+)\}/g, (_, key) => vars[key]); };
    let state = { status: 'ready', wallets: balanceWallets({ value: [{ currency: 'CNY', balance: '10.123' }],
      bonusWallets: [{ currency: 'CNY', balance: '5' }] }), updatedAt: 100000, busy: false };
    const listeners = new Set(); let refreshes = 0;
    const store = { getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      refresh(manual) { if (manual) refreshes++; } };
    const C = createBalanceComponent(React, ReactDOM.createPortal, walletAmounts);
    const root = createRoot(document.getElementById('root'));
    const render = (wide = true) => act(() => root.render(React.createElement(C, { store, t, wide })));
    const click = element => act(() => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    const update = patch => act(() => { state = { ...state, ...patch }; for (const fn of listeners) fn(); });
    try {
      render();
      const button = document.querySelector('.dsh-cost-balance-button');
      assert.match(button.textContent, /CNY 15.12/);
      click(button);
      let dialog = document.querySelector('[role=dialog]');
      assert.equal(dialog.parentElement, document.body);
      assert.ok(dialog.textContent.includes(t('balanceRecharge')));
      assert.ok(dialog.textContent.includes(t('balanceBonus')));
      assert.match(dialog.textContent, /CNY 10.12/);
      assert.match(dialog.textContent, /CNY 5.00/);
      click(document.querySelector('.dsh-cost-balance-refresh-action')); assert.equal(refreshes, 1);
      update({ status: 'failed' }); assert.ok(dialog.textContent.includes(t('balanceStaleNote')));
      assert.ok(button.textContent.includes(t('balanceStale')));
      act(() => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      assert.equal(document.querySelector('[role=dialog]'), null); assert.equal(document.activeElement, button);
      render(false); assert.equal(button.textContent, ''); assert.match(button.getAttribute('aria-label'), /CNY 15.12/);
      click(button); assert.ok(document.querySelector('[role=dialog]'));
      update({ status: 'signed-out', wallets: [], updatedAt: null });
      assert.equal(document.querySelector('[role=dialog]'), null);
      assert.ok(!button.getAttribute('aria-label').includes('15.12'));
      render(); assert.ok(button.textContent.includes(t('balanceSignIn')));
      click(button);
      act(() => document.getElementById('outside').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })));
      assert.equal(document.querySelector('[role=dialog]'), null);
    } finally {
      act(() => root.unmount()); assert.equal(listeners.size, 0); dom.window.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
    }
  }
});
