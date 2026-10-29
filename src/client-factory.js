/** Browser factory: only React is shared with the host. Generated artifact embeds dictionaries. */
export function clientFactory(require, dictionaries) {
  const React = require('react');
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
  `;

  function money(pico, currency) {
    const n = BigInt(pico);
    const rounded = (n + 500_000n) / 1_000_000n;
    const whole = rounded / 1_000_000n;
    const part = (rounded % 1_000_000n).toString().padStart(6, '0');
    return `${currency} ${n > 0n && rounded === 0n ? '<0.000001' : `${whole}.${part}`}`;
  }
  function amounts(totals) {
    return Object.entries(totals).map(([currency, value]) => money(value, currency)).join(' + ');
  }
  function CostTail({ turn, useProjection, t }) {
    const data = useProjection('localTurnCost');
    const current = data?.turns?.[turn.turn];
    if (!current) return h('div', { className: 'dsh-cost-meter', role: 'status' }, t('waiting'));
    const amount = amounts(current.totals);
    const title = current.calls === 0 ? t('zero') : !amount ? t('unavailable')
      : t(current.unknown ? 'partial' : 'summary', { amount });
    // Stable per-turn snapshot prevents older rows changing as later turns finish.
    const total = current.sessionTotals ?? {};
    const note = text => h('p', { className: 'cost-note' }, text);
    return h('details', { className: 'dsh-cost-meter', 'data-cost-turn': current.turn },
      h('summary', null, h('span', { className: 'cost-amount' }, title), ' · ', t('calls', { count: current.calls })),
      h('div', { className: 'cost-body' },
        current.unknown > 0 && note(t('missing', { count: current.unknown })),
        current.inherited && note(t('inherited')),
        ...current.lines.map((row, index) => h('section', { key: index },
          h('div', { className: 'cost-route' }, `${row.provider} / ${row.model} · `, t('calls', { count: row.calls })),
          row.issue && note(t(row.issue)),
          row.usage && h('div', { className: 'cost-table-scroll' }, h('table', null,
            h('thead', null, h('tr', null, h('th'), h('th', null, t('tokens')), h('th', null, t('price')))),
            h('tbody', null, ...['input', 'cacheRead', 'cacheWrite', 'output'].map(key =>
              h('tr', { key }, h('td', null, t(key)), h('td', null, row.usage[key].toLocaleString()),
                h('td', null, row.rates ? `${row.currency} ${row.rates[key]}` : '—')))))),
          !row.issue && h('div', { className: 'cost-amount' }, `${t('subtotal')}: ${money(row.amountPico, row.currency)}`),
          row.version && note(`${t('version')}: ${row.version} · ${t(row.period)}`))),
        Object.keys(total).length > 0 && h('p', { className: 'cost-amount' }, t('session', { amount: amounts(total) })),
        current.sessionUnknown > 0 && note(t('sessionPartial')),
        note(t('scope')), note(t('timeRule')), note(t('history'))));
  }
  return {
    inject: ['slots', 'locale'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register(ns, dictionaries));
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.plugin = '@local/deepseek-cost-meter';
        style.textContent = css;
        document.head.appendChild(style);
        return () => style.remove();
      });
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail', id: 'local-deepseek-cost-meter', locale: ns, order: 30,
      }, CostTail));
    },
  };
}
