import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { rateSchema, catalogSchema } from './src/pricing.js';
import { createProjection } from './src/projection.js';

export const name = 'local-deepseek-cost-meter';
export const inject = ['sessionProjections', 'storageDomain'];
export const Config = z.object({ rates: rateSchema.optional() }).strict().default({});

/** Pin rate changes in host storage; replay uses the rate catalog active at the request time. */
export async function apply(ctx, config = {}) {
  const rates = rateSchema.parse(config.rates ?? JSON.parse(await readFile(new URL('./rates.json', import.meta.url), 'utf8')));
  const domain = await ctx.storageDomain.open({
    name: 'local_turn_cost_prices', version: 1, tables: {},
    global: { schema: catalogSchema, initial: [] },
  });
  ctx.effect(() => () => domain.close());
  const id = createHash('sha256').update(JSON.stringify(rates)).digest('hex');
  let catalog = domain.global.get();
  if (catalog.at(-1)?.id !== id) {
    catalog = [...catalog, { id, startsAt: catalog.length ? Date.now() : Date.parse(rates.effectiveFrom), rates }];
    await domain.global.set(catalog);
  }
  // Include both implementation and price history in checkpoint compatibility.
  const stateVersion = createHash('sha256').update('projection-v2:' + JSON.stringify(catalog)).digest().readUInt32BE(0);
  const handle = await ctx.sessionProjections.register(createProjection(catalog, stateVersion));
  ctx.effect(() => () => handle.dispose());
}
