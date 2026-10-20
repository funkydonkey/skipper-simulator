import { parseArgs } from 'node:util';
import { loadContentDir } from '../src/content/load-node';
import { formatErrors } from '../src/content/parse';
import type { Lang } from '../src/engine/types';
import { writeFileSync } from 'node:fs';
import { formatBatch, runBatch } from '../src/sim/batch';
import { formatWeek } from '../src/sim/report';
import { runWeek } from '../src/sim/run';
import { expert, newbie } from '../src/sim/strategies';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '42' },
    strategy: { type: 'string', default: 'newbie' },
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
if (batchSize !== null) {
  const seeds = Array.from({ length: batchSize }, (_, i) => i + 1);
  const all: Record<string, ReturnType<typeof runBatch>> = {};
  for (const strategy of [newbie, expert]) {
    all[strategy.name] = runBatch(content, strategy, seeds);
    console.log(formatBatch(all[strategy.name]!, strategy.name) + '\n');
  }
  if (values.json) writeFileSync(values.json, JSON.stringify(all, null, 2));
} else {
  const strategy = values.strategy === 'expert' ? expert : newbie;
  console.log(formatWeek(runWeek(content, Number(values.seed), strategy), content, values.lang as Lang));
}
