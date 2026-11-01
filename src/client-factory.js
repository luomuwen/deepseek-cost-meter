/** Browser factory: React and ReactDOM are shared with the host. */
export function clientFactory(require, dictionaries) {
  const React = require('react');
  const { createPortal } = require('react-dom');
  const h = React.createElement;
  const ns = 'local-turn-cost';
  const css = `
    .dsh-cost-meter { margin: 6px 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
    .dsh-cost-meter summary { cursor: pointer; width: fit-content; max-width: 100%; padding: 4px 8px; border-radius: 6px; }
    .dsh-cost-meter summary:hover { background: var(--dsw-alias-interactive-bg-hover); }
    .dsh-cost-meter summary:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .dsh-cost-meter .cost-body { border: 1px solid var(--dsw-alias-border-primary); border-radius: 8px; padding: 12px; margin-top: 6px; }
    .dsh-cost-meter .cost-route { margin: 10px 0 4px; overflow-wrap: anywhere; font-weight: 600; }
    .dsh-cost-meter .cost-note { margin: 6px 0; color: var(--dsw-alias-label-tertiary); overflow-wrap: anywhere; }
    .dsh-cost-meter .cost-table-scroll { overflow-x: auto; }
    .dsh-cost-meter table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
    .dsh-cost-meter th, .dsh-cost-meter td { padding: 4px 8px; text-align: right; white-space: nowrap; }
    .dsh-cost-meter th:first-child, .dsh-cost-meter td:first-child { text-align: left; padding-left: 0; }
    .dsh-cost-meter .cost-amount { font-variant-numeric: tabular-nums; }
    .dsh-cost-dock { display: inline-flex; min-width: 0; max-width: 100%; font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); }
    .dsh-cost-dock-button { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 1px 8px; border: 0; border-radius: var(--dsw-radius-sm, 6px); background: transparent; color: var(--dsw-alias-label-tertiary, #666); font: inherit; line-height: 20px; cursor: pointer; }
    .dsh-cost-dock-button:hover, .dsh-cost-dock-button[aria-expanded=true] { background: var(--dsw-alias-interactive-bg-hover, #eee); color: var(--dsw-alias-label-secondary, #555); }
    .dsh-cost-dock-button svg { flex: none; width: 14px; height: 14px; }
    .dsh-cost-dock-button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .dsh-cost-dock-button:focus-visible, .dsh-cost-dialog button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .dsh-cost-dialog { position: fixed; z-index: 1100; box-sizing: border-box; width: 360px; max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px); overflow: auto; padding: 16px; border: 1px solid var(--dsw-alias-border-primary, #ddd); border-radius: var(--dsw-radius-lg, 16px); background: var(--dsw-specific-menu, #fff); backdrop-filter: var(--dsw-menu-backdrop-filter); box-shadow: var(--dsw-elevation-prominent, 0 8px 32px #0002); color: var(--dsw-alias-label-secondary, #555); font-size: 12px; line-height: 1.6; }
    .dsh-cost-dialog:focus { outline: none; }
    .dsh-cost-dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--dsw-alias-border-primary, #ddd); color: var(--dsw-alias-label-primary, #222); }
    .dsh-cost-dialog-header button { border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; cursor: pointer; padding: 2px 6px; }
    .dsh-cost-dialog dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 16px; margin: 12px 0; }
    .dsh-cost-dialog dt, .dsh-cost-dialog dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .dsh-cost-dialog dd { text-align: right; font-variant-numeric: tabular-nums; }
    .dsh-cost-dialog small { display: block; color: var(--dsw-alias-label-tertiary, #777); font-weight: normal; }
    .dsh-cost-dialog .cost-note { color: var(--dsw-alias-label-tertiary, #777); margin: 8px 0 0; }
    .dsh-cost-dialog .cost-breakdown { border-top: 1px solid var(--dsw-alias-border-primary, #ddd); padding-top: 12px; }
    @media (max-width: 480px) { .dsh-cost-dock { max-width: 180px; } }
  `;

  function money(pico, currency, digits = 6) {
    const n = BigInt(pico);
    const scale = 10n ** BigInt(digits);
    const unit = 1_000_000_000_000n / scale;
    const rounded = (n + unit / 2n) / unit;
    const whole = rounded / scale;
    const part = (rounded % scale).toString().padStart(digits, '0');
    return `${currency} ${n > 0n && rounded === 0n ? `<0.${'0'.repeat(digits - 1)}1` : `${whole}.${part}`}`;
  }
  function amounts(totals, digits = 6) {
    return Object.entries(totals).map(([currency, value]) => money(value, currency, digits)).join(' + ');
  }
  /** Aggregate only newly settled turns; inherited history is already excluded from totals. */
  function summarizeSession(data) {
    const groups = new Map();
    let latest = null;
    for (const turn of Object.values(data?.turns ?? {})) {
      if (turn.inherited || turn.endSeq === undefined) continue;
      if (!latest || turn.endSeq > latest.endSeq) latest = turn;
      for (const row of turn.lines) {
        const key = JSON.stringify([row.provider, row.model, row.billingMode, row.currency]);
        const group = groups.get(key) ?? { key, provider: row.provider, model: row.model,
          billingMode: row.billingMode, currency: row.currency, amount: 0n, hasAmount: false,
          incomplete: false, calls: 0, tokens: 0n, hasTokens: false };
        group.calls += row.calls;
        group.hasAmount ||= row.hasAmount;
        if (row.hasAmount) group.amount += BigInt(row.amountPico);
        group.incomplete ||= row.billingMode === 'metered' && Boolean(row.issue);
        for (const value of Object.values(row.usage ?? {})) if (value !== null) {
          group.tokens += BigInt(value);
          group.hasTokens = true;
        }
        groups.set(key, group);
      }
    }
    return { latest, groups: [...groups.values()] };
  }
  function CostDock(props) {
    // A different session must never retain an open dialog from the previous one.
    return h(SessionCostDock, { ...props, key: props.sessionId });
  }
  function SessionCostDock({ useProjection, useSession, t }) {
    const data = useProjection('localTurnCost');
    const running = useSession(state => state.running);
    const summary = React.useMemo(() => summarizeSession(data), [data]);
    const [open, setOpen] = React.useState(false);
    const [position, setPosition] = React.useState(null);
    const root = React.useRef(null);
    const panel = React.useRef(null);
    const button = React.useRef(null);
    const panelId = React.useId();
    const close = (restoreFocus = false) => {
      setOpen(false);
      if (restoreFocus) button.current?.focus({ preventScroll: true });
    };
    React.useEffect(() => {
      if (!open) return;
      const place = () => {
        if (!root.current || !panel.current) return;
        const anchor = root.current.getBoundingClientRect();
        const box = panel.current.getBoundingClientRect();
        const left = Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12));
        const above = anchor.top - box.height - 8;
        const top = above >= 12 ? above : Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - box.height - 12));
        setPosition({ left, top });
      };
      const outside = event => {
        if (root.current?.contains(event.target) || panel.current?.contains(event.target)) return;
        setOpen(false);
      };
      const escape = event => {
        if (event.key !== 'Escape') return;
        setOpen(false);
        button.current?.focus({ preventScroll: true });
      };
      place();
      panel.current?.focus({ preventScroll: true });
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('click', outside, true);
      document.addEventListener('focusin', outside);
      document.addEventListener('keydown', escape);
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
      if (panel.current) observer?.observe(panel.current);
      if (root.current) observer?.observe(root.current);
      return () => {
        observer?.disconnect();
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('click', outside, true);
        document.removeEventListener('focusin', outside);
        document.removeEventListener('keydown', escape);
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      };
    }, [open]);
    const allPlans = summary.groups.length > 0 && summary.groups.every(row => row.billingMode === 'subscription');
    const hasMetered = summary.groups.some(row => row.billingMode === 'metered');
    const amountLabel = (totals, partial, fallback, digits = 6) => {
      const value = amounts(totals ?? {}, digits);
      return value ? t(partial ? 'dockKnown' : 'dockEstimate', { amount: value }) : t(fallback);
    };
    const fallback = !data ? 'waiting' : allPlans ? 'dockPlan' : hasMetered ? 'dockUnavailable' : summary.groups.length ? 'dockUsageOnly' : 'dockEmpty';
    const title = amountLabel(data?.totals, data?.unknown || data?.unpriced, fallback, 4);
    const latest = summary.latest;
    const latestPlans = latest?.lines.length > 0 && latest.lines.every(row => row.billingMode === 'subscription');
    const latestLabel = latest ? amountLabel(latest.totals, latest.unknown || latest.unpriced,
      latest.calls === 0 ? 'zero' : latestPlans ? 'dockPlan' : latest.lines.some(row => row.billingMode === 'metered') ? 'dockUnavailable' : 'dockUsageOnly') : t('dockEmpty');
    const note = text => h('p', { className: 'cost-note' }, text);
    return h('span', { ref: root, className: 'dsh-cost-dock', 'data-composer-stat': 'cost-meter' },
      h('button', { ref: button, type: 'button', className: 'dsh-cost-dock-button',
        title: `${t('dockTitle')} · ${title}`, 'aria-label': `${t('dockTitle')} · ${title}`,
        'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? panelId : undefined,
        onClick: () => { setPosition(null); setOpen(value => !value); } },
      h('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 6.25 }), h('path', { d: 'M5 5l3 3 3-3M5 8h6M5 10h6M8 8v4' })),
      h('span', null, title)),
      open && createPortal(h('div', { ref: panel, id: panelId, role: 'dialog', tabIndex: -1,
        className: 'dsh-cost-dialog', 'aria-label': t('dockTitle'),
        style: position ?? { left: 0, top: 0, visibility: 'hidden' } },
        h('div', { className: 'dsh-cost-dialog-header' }, h('strong', null, t('dockTitle')),
          h('button', { type: 'button', 'aria-label': t('dockClose'), onClick: () => close(true) }, '×')),
        h('dl', null,
          h('dt', null, t('dockTotal')), h('dd', null, amountLabel(data?.totals, data?.unknown || data?.unpriced, fallback)),
          h('dt', null, t('dockLatest')), h('dd', null, latestLabel)),
        summary.groups.length > 0 && h('dl', { className: 'cost-breakdown' }, ...summary.groups.map(row =>
          h(React.Fragment, { key: row.key },
            h('dt', null, row.model, h('small', null, row.provider),
              h('small', null, t('calls', { count: row.calls }))),
            h('dd', null, row.hasAmount ? t(row.incomplete ? 'dockKnown' : 'dockEstimate', { amount: money(row.amount, row.currency) })
              : t(row.billingMode === 'subscription' ? 'dockPlan' : row.billingMode === 'usage-only' ? 'dockUsageOnly' : 'dockUnavailable'),
              row.hasTokens && h('small', null, t('recordedTokens', { count: row.tokens.toLocaleString() })))))),
        data?.unknown > 0 && note(t('missing', { count: data.unknown })),
        data?.unpriced > 0 && note(t('unpriced', { count: data.unpriced })),
        note(t(running ? 'dockRunning' : 'dockSettled')),
        note(t('dockScope'))), document.body));
  }
  function CostTail({ turn, useProjection, t }) {
    const data = useProjection('localTurnCost');
    const current = data?.turns?.[turn.turn];
    if (!current) return h('div', { className: 'dsh-cost-meter', role: 'status' }, t('waiting'));
    const amount = amounts(current.totals);
    const allSubscription = current.lines.length > 0 && current.lines.every(row => row.billingMode === 'subscription');
    const tokenValues = current.lines.flatMap(row => row.usage ? Object.values(row.usage).filter(value => value !== null) : []);
    const tokens = tokenValues.reduce((sum, value) => sum + BigInt(value), 0n).toLocaleString();
    const title = current.calls === 0 ? t('zero') : !amount ? t(allSubscription ? 'subscriptionSummary' : 'unavailable')
      : t(current.unknown || current.unpriced ? 'partial' : 'summary', { amount });
    // Stable per-turn snapshot prevents older rows changing as later turns finish.
    const total = current.sessionTotals ?? {};
    const note = text => h('p', { className: 'cost-note' }, text);
    return h('details', { className: 'dsh-cost-meter', 'data-cost-turn': current.turn },
      h('summary', null, h('span', { className: 'cost-amount' }, title), ' · ', t('calls', { count: current.calls }),
        tokenValues.length > 0 && ` · ${t('recordedTokens', { count: tokens })}`),
      h('div', { className: 'cost-body' },
        current.unknown > 0 && note(t('missing', { count: current.unknown })),
        current.unpriced > 0 && note(t('unpriced', { count: current.unpriced })),
        current.inherited && note(t('inherited')),
        ...current.lines.map((row, index) => h('section', { key: index },
          h('div', { className: 'cost-route' }, `${row.provider} / ${row.model} · `, t('calls', { count: row.calls })),
          row.issue && note(t(row.issue)),
          row.billingMode !== 'metered' && row.issue !== row.billingMode && note(t(row.billingMode)),
          row.missingPrices?.length > 0 && note(t('missingPrices', { buckets: row.missingPrices.map(key => t(key)).join(' / ') })),
          row.usage && h('div', { className: 'cost-table-scroll' }, h('table', null,
            h('thead', null, h('tr', null, h('th'), h('th', null, t('tokens')), h('th', null, t('price')))),
            h('tbody', null, ...['input', 'cacheRead', 'cacheWrite', 'output'].map(key =>
              h('tr', { key }, h('td', null, t(key)), h('td', null, row.usage[key] === null ? t('unknown') : row.usage[key].toLocaleString()),
                h('td', null, row.rates && row.rates[key] !== null ? `${row.currency} ${row.rates[key]}` : '—')))))),
          row.hasAmount && h('div', { className: 'cost-amount' }, `${t(row.issue ? 'knownSubtotal' : 'subtotal')}: ${money(row.amountPico, row.currency)}`),
          row.version && note(`${t('version')}: ${row.version} · ${t(row.period)}`),
          row.source && note(`${t('source')}: ${row.source}`))),
        Object.keys(total).length > 0 && h('p', { className: 'cost-amount' }, t('session', { amount: amounts(total) })),
        current.sessionUnknown > 0 && note(t('sessionPartial')),
        current.sessionUnpriced > 0 && note(t('unpriced', { count: current.sessionUnpriced })),
        note(t('scope')), note(t('timeRule')), note(t('history'))));
  }
  return {
    inject: ['slots', 'locale'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register(ns, dictionaries));
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.plugin = 'deepseek-cost-meter';
        style.textContent = css;
        document.head.appendChild(style);
        return () => style.remove();
      });
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail', id: 'local-deepseek-cost-meter', locale: ns, order: 30,
      }, CostTail));
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock', id: 'local-deepseek-cost-meter', locale: ns, order: 2,
      }, CostDock));
    },
  };
}
