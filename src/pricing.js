import { z } from 'zod';

const decimal = z.string().regex(/^\d+(?:\.\d{1,6})?$/);
const buckets = z.object({ input: decimal, cacheRead: decimal, cacheWrite: decimal, output: decimal }).strict();
export const rateSchema = z.object({
  version: z.string().min(1), source: z.string(),
  effectiveFrom: z.iso.datetime({ offset: true }),
  calendarThrough: z.iso.date(), holidays: z.array(z.iso.date()),
  prices: z.array(z.object({
    provider: z.string().min(1), models: z.array(z.string().min(1)).min(1),
    currency: z.string().regex(/^[A-Z]{3}$/), offPeak: buckets, peak: buckets.optional(),
  }).strict()).min(1),
}).strict().superRefine((value, ctx) => {
  const seen = new Set();
  for (const row of value.prices) for (const model of row.models) {
    const key = JSON.stringify([row.provider, model]);
    if (seen.has(key)) ctx.addIssue({ code: 'custom', message: `Duplicate price route: ${key}` });
    seen.add(key);
  }
});
export const catalogSchema = z.array(z.object({
  id: z.string(), startsAt: z.number().int().nonnegative(), rates: rateSchema,
}).strict());

/** Select the historical catalog and exact provider/model, using request start time. */
export function resolvePrice(catalog, route, time) {
  const snapshot = catalog.findLast(row => row.startsAt <= time);
  if (!snapshot || time < Date.parse(snapshot.rates.effectiveFrom)) return { issue: 'price-unavailable' };
  // These are the two official route ids shipped by Harness. Explicit configuration wins.
  const officialProvider = ['deepseek-account', 'deepseek-official'].includes(route?.provider) ? 'deepseek' : route?.provider;
  const row = snapshot.rates.prices.find(row => row.provider === route?.provider && row.models.includes(route?.model))
    ?? snapshot.rates.prices.find(row => row.provider === officialProvider && row.models.includes(route?.model));
  if (!row) return { issue: 'price-unavailable' };
  const local = new Date(time + 8 * 3600_000);
  const date = local.toISOString().slice(0, 10);
  if (row.peak && date > snapshot.rates.calendarThrough) return { issue: 'calendar-expired' };
  const hour = local.getUTCHours();
  const weekday = local.getUTCDay() > 0 && local.getUTCDay() < 6;
  const peak = row.peak && weekday && !snapshot.rates.holidays.includes(date)
    && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18));
  return { currency: row.currency, rates: peak ? row.peak : row.offPeak,
    period: peak ? 'peak' : 'offPeak', version: snapshot.rates.version, snapshotId: snapshot.id };
}

/** Counts × millionths-of-currency per million tokens = trillionths of currency. */
export function costPico(usage, prices) {
  let sum = 0n;
  for (const key of ['input', 'cacheRead', 'cacheWrite', 'output']) {
    const [whole, fraction = ''] = prices[key].split('.');
    const price = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
    sum += BigInt(usage[key]) * price;
  }
  return sum.toString();
}

/** Keep missing buckets unknown unless the exact total proves their combined value is zero. */
export function normalizeUsage(raw) {
  if (!raw) return null;
  const valid = value => Number.isSafeInteger(value) && value >= 0;
  if (!valid(raw.inputTokens) || !valid(raw.outputTokens)) return null;
  for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens']) {
    if (raw[key] !== undefined && !valid(raw[key])) return null;
  }
  if (raw.reasoningTokens > raw.outputTokens) return null;
  const known = raw.inputTokens + raw.outputTokens + (raw.cacheReadTokens ?? 0) + (raw.cacheWriteTokens ?? 0);
  if (!Number.isSafeInteger(known)) return null;
  const missing = raw.cacheReadTokens === undefined || raw.cacheWriteTokens === undefined;
  if (raw.totalTokens !== undefined && raw.totalTokens !== known) return null;
  if (missing && raw.totalTokens === undefined) return null;
  return { input: raw.inputTokens, output: raw.outputTokens,
    cacheRead: raw.cacheReadTokens ?? 0, cacheWrite: raw.cacheWriteTokens ?? 0 };
}
