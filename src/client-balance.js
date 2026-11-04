/** Read only the host's signed-in DeepSeek account. No credentials or wallet data are persisted. */
export function createBalanceStore({ now = Date.now, visible = () => document.visibilityState !== 'hidden', timeoutMs = 15000 } = {}) {
  let snapshot = { status: 'unavailable', wallets: [], updatedAt: null, busy: false };
  let generation = 0, remote, metadata, stream, pending, signedIn = false, disposed = false, lastAttempt = -Infinity;
  const listeners = new Set();
  const cancellations = new Set();
  const cancelReads = () => { for (const cancel of cancellations) cancel(); cancellations.clear(); };
  const publish = value => { snapshot = value; for (const fn of listeners) fn(); };
  const reset = status => publish({ status, wallets: [], updatedAt: null, busy: false });
  const refresh = async (manual = false) => {
    if (disposed || !signedIn || !visible()) return;
    if (pending) return pending;
    if (now() - lastAttempt < (manual ? 5000 : 60000)) return;
    lastAttempt = now();
    const revision = generation;
    publish({ ...snapshot, busy: true });
    const request = (async () => {
      let timer, cancel;
      try {
        const result = await Promise.race([remote.account.getBalance(metadata()),
          new Promise((_, reject) => {
            cancel = () => reject(new Error('balance superseded'));
            cancellations.add(cancel);
            timer = setTimeout(() => reject(new Error('balance timeout')), timeoutMs);
          })]);
        if (disposed || revision !== generation) return;
        if (!result.ok || result.value?.status !== 'ready') {
          if (result.ok && result.value === null) { signedIn = false; reset('signed-out'); return; }
          throw new Error('balance unavailable');
        }
        const wallets = balanceWallets(result.value);
        publish({ status: 'ready', wallets, updatedAt: now(), busy: false });
      } catch {
        if (!disposed && revision === generation) publish({ ...snapshot, status: 'failed', busy: false });
      } finally { clearTimeout(timer); cancellations.delete(cancel); }
    })();
    pending = request;
    try { await request; } finally { if (pending === request) pending = undefined; }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh,
    connect(service, clientMetadata) {
      disposed = false; remote = service; metadata = clientMetadata; reset('loading');
      stream = remote.$stream({ name: 'cost-meter-account', open: signal => remote.account.watch(signal),
        ended: () => new Error('account stream ended') });
      const active = stream;
      (async () => {
        for await (const frame of active) {
          if (disposed || stream !== active) break;
          generation++; cancelReads(); pending = undefined; lastAttempt = -Infinity;
          signedIn = frame.value.status === 'credential-stored';
          reset(signedIn ? 'loading' : 'signed-out');
          frame.accept();
          void refresh();
        }
        if (!disposed && stream === active) { generation++; cancelReads(); signedIn = false; reset('disconnected'); }
      })().catch(() => {
        if (!disposed && stream === active) { generation++; cancelReads(); signedIn = false; reset('disconnected'); }
      });
      return () => {
        disposed = true; generation++; cancelReads(); pending = undefined; signedIn = false; stream = undefined;
        reset('unavailable');
        return active.dispose();
      };
    },
  };
}

/** Decimal strings remain exact, including balances smaller than one cent. */
export function balanceWallets(value) {
  if (!Array.isArray(value.value) || !Array.isArray(value.bonusWallets)) throw new Error('invalid wallets');
  const wallets = [];
  for (const [kind, rows] of [['recharge', value.value], ['bonus', value.bonusWallets]]) {
    const currencies = new Set();
    for (const row of rows) {
      if (!['CNY', 'USD'].includes(row.currency) || typeof row.balance !== 'string'
        || row.balance.length > 80 || !/^-?\d+(?:\.\d{1,18})?$/.test(row.balance)
        || currencies.has(row.currency)) throw new Error('invalid wallet');
      currencies.add(row.currency);
      wallets.push({ kind, currency: row.currency, balance: row.balance });
    }
  }
  return wallets;
}

export function walletAmounts(wallets) {
  const scale = 10n ** 18n, totals = new Map();
  for (const { currency, balance } of wallets) {
    const [whole, fraction = ''] = balance.replace('-', '').split('.');
    const amount = (BigInt(whole) * scale + BigInt(fraction.padEnd(18, '0'))) * (balance.startsWith('-') ? -1n : 1n);
    totals.set(currency, (totals.get(currency) ?? 0n) + amount);
  }
  return [...totals].map(([currency, amount]) => {
    const negative = amount < 0n, absolute = negative ? -amount : amount;
    const cents = (absolute + scale / 200n) / (scale / 100n);
    const text = absolute > 0n && cents === 0n ? (negative ? '>-0.01' : '<0.01')
      : `${negative ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
    return `${currency} ${text}`;
  }).join(' · ');
}
