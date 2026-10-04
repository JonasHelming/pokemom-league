import assert from 'node:assert/strict';
import { buildChartDatasets, buildDeckLineages, buildDeckLineageIndex } from '../src/charts.js';

const history = [
  {
    date: '2026-01-01',
    playerRatings: { A: 1010, B: 990 },
    deckRatings: { x: 1005, y: 995 },
    deckMatchCounts: { x: 1, y: 1 },
  },
  {
    date: '2026-01-02',
    playerRatings: { A: 1020, B: 980 },
    deckRatings: { x: 1010, y: 990 },
    deckMatchCounts: { x: 2, y: 2 },
  },
];

const playerData = buildChartDatasets(history, ['A', 'B'], { A: 'Alice', B: 'Bob' }, 'player');
assert.deepEqual(playerData.labels, ['2026-01-01', '2026-01-02']);
assert.equal(playerData.datasets.length, 2);
assert.equal(playerData.datasets[0].label, 'Alice');
assert.deepEqual(playerData.datasets[0].data, [1010, 1020]);

// A deck with no predecessor is a lineage of one -- unchanged behavior from
// before rebuild support existed.
const plainDecks = [{ id: 'x', name: 'Fire' }, { id: 'y', name: 'Water' }];
const deckData = buildChartDatasets(history, ['x', 'y'], { x: 'Fire', y: 'Water' }, 'deck', () => null, plainDecks);
assert.equal(deckData.datasets.length, 2);
const waterDataset = deckData.datasets.find((d) => d.label === 'Water');
assert.deepEqual(waterDataset.data, [995, 990]);

// --- Rebuild lineage merging ---
//
// y (retired) -> y-1 (active, predecessor: y) should merge into ONE dataset
// labeled after the active version's name, showing y's own history, a
// single null gap exactly at y-1's first real match (the upgrade event),
// then y-1's own history -- one continuous line with a visible break, not
// two disconnected lines and not a misleading straight interpolation.
const lineageDecks = [
  { id: 'x', name: 'Fire' },
  { id: 'y', name: 'Water', retired: true },
  { id: 'y-1', name: 'Water', predecessor: 'y' },
];
const lineageHistory = [
  { date: '2026-01-01', deckRatings: { x: 1000, y: 1050, 'y-1': 1000 }, deckMatchCounts: { x: 1, y: 1, 'y-1': 0 } },
  { date: '2026-01-02', deckRatings: { x: 1000, y: 1060, 'y-1': 1000 }, deckMatchCounts: { x: 2, y: 2, 'y-1': 0 } },
  { date: '2026-01-03', deckRatings: { x: 1000, y: 1060, 'y-1': 1040 }, deckMatchCounts: { x: 3, y: 2, 'y-1': 1 } },
  { date: '2026-01-04', deckRatings: { x: 1000, y: 1060, 'y-1': 1030 }, deckMatchCounts: { x: 4, y: 2, 'y-1': 2 } },
];

const lineages = buildDeckLineages(lineageDecks);
assert.equal(lineages.length, 2, 'x (lineage of one) and y-1 (lineage of y -> y-1) -- y itself is never its own lineage head');
const waterLineage = lineages.find((l) => l.id === 'y-1');
assert.deepEqual(waterLineage.chain, ['y', 'y-1']);

const lineageChart = buildChartDatasets(
  lineageHistory,
  ['x', 'y-1'],
  { x: 'Fire', 'y-1': 'Water' },
  'deck',
  () => null,
  lineageDecks,
);
const merged = lineageChart.datasets.find((d) => d.label === 'Water');
assert.deepEqual(merged.data, [1050, 1060, null, 1030], 'gap must land exactly at y-1\'s first real match');
assert.equal(merged.spanGaps, false, 'spanGaps must stay false so Chart.js actually renders the gap rather than interpolating across it');

// --- Lineage colors survive a rebuild ---
//
// Type colors are keyed by the ORIGINAL deck id ('y'), because that's the id
// that names the Pokemon type -- a rebuild mints a new id ('y-1') that no
// color table can know about ahead of time. Looking the color up under the
// new id yields nothing, and a dataset with no borderColor falls back to
// Chart.js's near-transparent default, i.e. an invisible line on a dark
// background. The lookup must therefore resolve to the lineage ROOT.
const colorByRootId = { x: '#ff0000', y: '#0000ff' };
const coloredChart = buildChartDatasets(
  lineageHistory,
  ['x', 'y-1'],
  { x: 'Fire', 'y-1': 'Water' },
  'deck',
  (id) => colorByRootId[id] ?? null,
  lineageDecks,
);
const coloredWater = coloredChart.datasets.find((d) => d.label === 'Water');
assert.equal(coloredWater.borderColor, '#0000ff', 'a rebuilt deck must keep its lineage root color instead of rendering as an invisible default line');

// --- Lineage index ---
//
// Maps EVERY version id, retired ancestors included, to both ends of its
// lineage: `root` (the id the type color is filed under) and `head` (the
// active version that history should be folded into).
const index = buildDeckLineageIndex(lineageDecks);
assert.deepEqual(index.get('y'), { root: 'y', head: 'y-1' }, 'a retired version must point forward at the version that replaced it');
assert.deepEqual(index.get('y-1'), { root: 'y', head: 'y-1' }, 'an active rebuild must point back at the root its color is filed under');
assert.deepEqual(index.get('x'), { root: 'x', head: 'x' }, 'a never-rebuilt deck is its own root and head');

console.log('OK: charts.test.js');
