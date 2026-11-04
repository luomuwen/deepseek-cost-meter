export function createBalanceComponent(React, createPortal, walletAmounts) {
  const h = React.createElement;
  return function SidebarBalance({ wide = true, store, t }) {
    const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const [open, setOpen] = React.useState(false);
    const [position, setPosition] = React.useState(null);
    const root = React.useRef(null), panel = React.useRef(null), button = React.useRef(null);
    const id = React.useId();
    React.useEffect(() => {
      const refresh = () => { void store.refresh(); };
      const timer = setInterval(refresh, 60000);
      document.addEventListener('visibilitychange', refresh);
      refresh();
      return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
    }, [store]);
    React.useEffect(() => {
      if (state.status === 'signed-out' || state.status === 'disconnected') setOpen(false);
    }, [state.status]);
    React.useLayoutEffect(() => {
      if (!open) return;
      const place = () => {
        const anchor = root.current?.getBoundingClientRect(), bounds = panel.current?.getBoundingClientRect();
        if (!anchor || !bounds) return;
        setPosition({ left: Math.max(12, Math.min(anchor.left, window.innerWidth - bounds.width - 12)),
          top: Math.max(12, Math.min(anchor.top - bounds.height - 8, window.innerHeight - bounds.height - 12)) });
      };
      place(); panel.current?.focus();
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
      if (panel.current) observer?.observe(panel.current);
      window.addEventListener('resize', place);
      const outside = event => {
        if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
      };
      const escape = event => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus(); }
      };
      document.addEventListener('pointerdown', outside);
      document.addEventListener('focusin', outside);
      document.addEventListener('keydown', escape);
      return () => {
        observer?.disconnect(); window.removeEventListener('resize', place);
        document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside);
        document.removeEventListener('keydown', escape);
      };
    }, [open]);
    const amount = walletAmounts(state.wallets);
    const statusKey = { loading: 'balanceLoading', unavailable: 'balanceUnsupported', 'signed-out': 'balanceSignIn',
      disconnected: 'balanceDisconnected', failed: 'balanceFailed', ready: 'balanceEmpty' }[state.status];
    const label = amount || t(statusKey);
    const stale = state.status === 'failed' && state.wallets.length > 0;
    const canRefresh = ['ready', 'failed', 'loading'].includes(state.status);
    const refresh = () => { void store.refresh(true); };
    const icon = h('svg', { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
      width: 16, height: 16, 'aria-hidden': true },
      h('rect', { x: 2, y: 4, width: 16, height: 13, rx: 3 }),
      h('path', { d: 'M14 9h4v4h-4a2 2 0 0 1 0-4ZM3 5V4a2 2 0 0 1 2-2h10' }));
    return h('div', { className: 'dsh-cost-balance', ref: root, 'data-wide': wide },
      h('button', { className: 'dsh-cost-balance-button', ref: button, type: 'button',
        title: `${t('balanceTitle')} · ${label}${stale ? ` · ${t('balanceStale')}` : ''}`,
        'aria-label': `${t('balanceTitle')} · ${label}`, 'aria-haspopup': 'dialog', 'aria-expanded': open,
        'aria-controls': open ? id : undefined, onClick: () => setOpen(value => !value) },
      icon, wide && h('span', null, t('balanceShort'), ' ', label, stale && ` · ${t('balanceStale')}`)),
      wide && canRefresh && h('button', { className: 'dsh-cost-balance-refresh', type: 'button', disabled: state.busy,
        title: t('balanceRefresh'), 'aria-label': t('balanceRefresh'), onClick: refresh }, state.busy ? '…' : '↻'),
      open && createPortal(h('div', { ref: panel, id, role: 'dialog', tabIndex: -1,
        'aria-label': t('balanceTitle'), className: 'dsh-cost-dialog dsh-cost-balance-dialog',
        style: { ...position, visibility: position ? 'visible' : 'hidden' } },
        h('div', { className: 'dsh-cost-dialog-header' }, h('strong', null, t('balanceTitle')),
          h('button', { type: 'button', 'aria-label': t('balanceClose'), onClick: () => { setOpen(false); button.current?.focus(); } }, '×')),
        h('dl', null, h('dt', null, t('balanceTotal')), h('dd', null, label),
          ...['recharge', 'bonus'].flatMap(kind => {
            const rows = state.wallets.filter(wallet => wallet.kind === kind);
            return rows.length ? [h('dt', { key: `${kind}-label` }, t(kind === 'recharge' ? 'balanceRecharge' : 'balanceBonus')),
              h('dd', { key: kind }, walletAmounts(rows))] : [];
          })),
        state.status !== 'ready' && h('p', { className: 'cost-note', role: 'status' }, t(statusKey)),
        state.updatedAt !== null && h('p', { className: 'cost-note' }, t('balanceUpdated', { time: new Date(state.updatedAt).toLocaleTimeString() })),
        stale && h('p', { className: 'cost-note' }, t('balanceStaleNote')),
        h('p', { className: 'cost-note' }, t('balanceScope')),
        canRefresh && h('button', { type: 'button', className: 'dsh-cost-balance-refresh-action', disabled: state.busy, onClick: refresh },
          t(state.busy ? 'balanceLoading' : 'balanceRefresh'))), document.body));
  };
}
