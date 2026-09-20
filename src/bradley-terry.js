import { invert, matVec, dot, quadForm } from './linalg.js';

const RIDGE = 1e-6;
const MAX_ITERATIONS = 100;
const CONVERGENCE_THRESHOLD = 1e-9;

function buildIndex(ids, offset) {
  const anchor = ids[0];
  const index = new Map();
  ids.forEach((id, i) => {
    index.set(id, i === 0 ? null : offset + i - 1);
  });
  return { index, anchor };
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export function buildDesignRow(playerA, deckA, playerB, deckB, playerIndex, deckIndex, numFree) {
  const x = new Array(numFree).fill(0);
  const add = (index, sign) => {
    if (index !== null && index !== undefined) x[index] += sign;
  };
  add(playerIndex.get(playerA), 1);
  add(playerIndex.get(playerB), -1);
  add(deckIndex.get(deckA), 1);
  add(deckIndex.get(deckB), -1);
  return x;
}

function computeNegHessian(rows, theta, numFree) {
  const negHessian = Array.from({ length: numFree }, () => new Array(numFree).fill(0));
  for (const { x } of rows) {
    const p = sigmoid(dot(theta, x));
    const w = p * (1 - p);
    for (let i = 0; i < numFree; i++) {
      for (let j = 0; j < numFree; j++) {
        negHessian[i][j] += w * x[i] * x[j];
      }
    }
  }
  for (let i = 0; i < numFree; i++) negHessian[i][i] += RIDGE;
  return negHessian;
}

export function fitBradleyTerry(matches, playerIds, deckIds) {
  const { index: playerIndex, anchor: playerAnchor } = buildIndex(playerIds, 0);
  const { index: deckIndex, anchor: deckAnchor } = buildIndex(deckIds, playerIds.length - 1);
  const numFree = (playerIds.length - 1) + (deckIds.length - 1);

  const rows = matches.map((m) => ({
    x: buildDesignRow(m.player1, m.deck1, m.player2, m.deck2, playerIndex, deckIndex, numFree),
    y: m.winner === m.player1 ? 1 : 0,
  }));

  let theta = new Array(numFree).fill(0);
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations = iter + 1;
    const grad = new Array(numFree).fill(0);
    for (const { x, y } of rows) {
      const p = sigmoid(dot(theta, x));
      for (let i = 0; i < numFree; i++) grad[i] += (y - p) * x[i];
    }
    for (let i = 0; i < numFree; i++) grad[i] -= RIDGE * theta[i];

    const negHessian = computeNegHessian(rows, theta, numFree);
    const cov = invert(negHessian);
    const delta = matVec(cov, grad);
    theta = theta.map((v, i) => v + delta[i]);

    if (delta.every((d) => Math.abs(d) < CONVERGENCE_THRESHOLD)) {
      converged = true;
      break;
    }
  }

  const cov = invert(computeNegHessian(rows, theta, numFree));

  return { playerIndex, deckIndex, playerAnchor, deckAnchor, theta, cov, numFree, converged, iterations };
}

export function predictWinProbability(fit, playerA, deckA, playerB, deckB) {
  const x = buildDesignRow(playerA, deckA, playerB, deckB, fit.playerIndex, fit.deckIndex, fit.numFree);
  return sigmoid(dot(fit.theta, x));
}

function paramVectorFor(fit, family, id) {
  const v = new Array(fit.numFree).fill(0);
  const map = family === 'player' ? fit.playerIndex : fit.deckIndex;
  if (!map.has(id)) throw new Error(`Unknown ${family} id: ${id}`);
  const index = map.get(id);
  if (index !== null && index !== undefined) v[index] = 1;
  return v;
}

export function meanCenteredRatings(fit, family, ids) {
  const vectors = ids.map((id) => paramVectorFor(fit, family, id));
  const m = ids.length;
  const meanVector = new Array(fit.numFree).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < fit.numFree; i++) meanVector[i] += v[i] / m;
  }

  const result = {};
  ids.forEach((id, idx) => {
    const diff = vectors[idx].map((v, i) => v - meanVector[i]);
    result[id] = {
      value: dot(diff, fit.theta),
      se: Math.sqrt(Math.max(quadForm(fit.cov, diff), 0)),
    };
  });
  return result;
}

export function toEloScale(value) {
  return 1000 + value * (400 / Math.LN10);
}
