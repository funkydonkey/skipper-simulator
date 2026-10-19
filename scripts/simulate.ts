import { parseArgs } from 'node:util';
import { loadContentDir } from '../src/content/load-node';
import { formatErrors } from '../src/content/parse';
import { PILLARS, type Lang } from '../src/engine/types';
import { formatWeek } from '../src/sim/report';
import { pillarsAffected, runWeek, weekScore } from '../src/sim/run';
import { expert, newbie } from '../src/sim/strategies';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '42' },
    strategy: { type: 'string', default: 'newbie' },
    batch: { type: 'string' },
    lang: { type: 'string', default: 'ru' },
  },
});

const { content, errors } = await loadContentDir('content');
if (!content) {
  console.error(formatErrors(errors));
  process.exit(1);
}

const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);

if (values.batch) {
  const n = Number(values.batch);
  for (const strategy of [newbie, expert]) {
    const runs = Array.from({ length: n }, (_, i) => runWeek(content, i + 1, strategy));
    const pillarFreq = PILLARS.map((p) => `${p}:${runs.filter((r) => pillarsAffected(r.state).has(p)).length}/${n}`).join(' ');
    console.log(`${strategy.name.padEnd(7)} score ${mean(runs.map((r) => weekScore(r.debrief)))}/8 | mood ${mean(runs.map((r) => r.state.resources.mood))} | deposit loss ${mean(runs.map((r) => r.debrief.depositLossEur))} € | injuries ${mean(runs.map((r) => r.state.injuries))} | links ${mean(runs.map((r) => r.debrief.links.length))}`);
    console.log(`        pillars ${pillarFreq}`);
  }
} else {
  const strategy = values.strategy === 'expert' ? expert : newbie;
  console.log(formatWeek(runWeek(content, Number(values.seed), strategy), content, values.lang as Lang));
}
