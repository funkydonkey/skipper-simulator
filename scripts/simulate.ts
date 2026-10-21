import { parseArgs } from 'node:util';
import { loadContentDir } from '../src/content/load-node';
import { formatErrors } from '../src/content/parse';
import type { Lang } from '../src/engine/types';
import { writeFileSync } from 'node:fs';
import { formatBatch, runBatch } from '../src/sim/batch';
import { formatWeek } from '../src/sim/report';
import { runWeek } from '../src/sim/run';
import { expert, makeStrategy, newbie, type Strategy } from '../src/sim/strategies';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '42' },
    strategy: { type: 'string' },
    boat: { type: 'string' },
    batch: { type: 'string' },
    weeks: { type: 'string' },
    json: { type: 'string' },
    lang: { type: 'string', default: 'ru' },
  },
});

const { content, errors } = await loadContentDir('content');
if (!content) {
  console.error(formatErrors(errors));
  process.exit(1);
}

const batchArg = values.weeks ?? values.batch;
const batchSize = batchArg === undefined ? null : Number(batchArg);
if (batchSize !== null && (!/^\d+$/.test(batchArg ?? '') || batchSize < 1)) {
  console.error(`--weeks (or --batch) must be a positive integer, got "${batchArg}"`);
  process.exit(1);
}
const NAMES: Strategy['name'][] = ['newbie', 'expert', 'careful', 'ignore-weakness'];
if (values.strategy !== undefined && !NAMES.includes(values.strategy as Strategy['name'])) {
  console.error(`--strategy must be one of ${NAMES.join(', ')}, got "${values.strategy}"`);
  process.exit(1);
}
if (values.boat !== undefined && !content.boats.some((b) => b.id === values.boat)) {
  console.error(`--boat must be one of ${content.boats.map((b) => b.id).join(', ')}, got "${values.boat}"`);
  process.exit(1);
}
const named = values.strategy as Strategy['name'] | undefined;

if (batchSize !== null) {
  const seeds = Array.from({ length: batchSize }, (_, i) => i + 1);
  const all: Record<string, ReturnType<typeof runBatch>> = {};
  const run = (label: string, strategy: Strategy) => {
    all[label] = runBatch(content, strategy, seeds);
    console.log(formatBatch(all[label]!, label) + '\n');
  };
  if (named) {
    run(values.boat ? `${named}:${values.boat}` : named, makeStrategy(named, values.boat));
  } else {
    for (const strategy of [newbie, expert]) run(strategy.name, strategy);
    for (const boat of values.boat ? [values.boat] : content.boats.map((b) => b.id)) {
      for (const name of ['careful', 'ignore-weakness'] as const) run(`${name}:${boat}`, makeStrategy(name, boat));
    }
  }
  if (values.json) writeFileSync(values.json, JSON.stringify(all, null, 2));
} else {
  const strategy = makeStrategy(named ?? 'newbie', values.boat);
  console.log(formatWeek(runWeek(content, Number(values.seed), strategy), content, values.lang as Lang));
}
