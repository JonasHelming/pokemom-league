import assert from 'node:assert/strict';
import { buildChartDatasets } from '../src/charts.js';

const history = [
  { date: '2026-01-01', playerRatings: { A: 1010, B: 990 }, deckRatings: { x: 1005, y: 995 } },
  { date: '2026-01-02', playerRatings: { A: 1020, B: 980 }, deckRatings: { x: 1010, y: 990 } },
];

const playerData = buildChartDatasets(history, ['A', 'B'], { A: 'Alice', B: 'Bob' }, 'player');
assert.deepEqual(playerData.labels, ['2026-01-01', '2026-01-02']);
assert.equal(playerData.datasets.length, 2);
assert.equal(playerData.datasets[0].label, 'Alice');
assert.deepEqual(playerData.datasets[0].data, [1010, 1020]);

const deckData = buildChartDatasets(history, ['x', 'y'], { x: 'Fire', y: 'Water' }, 'deck');
assert.equal(deckData.datasets[1].label, 'Water');
assert.deepEqual(deckData.datasets[1].data, [995, 990]);

console.log('OK: charts.test.js');
