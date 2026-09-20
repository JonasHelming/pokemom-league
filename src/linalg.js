export function invert(matrix) {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => {
    const identityRow = new Array(n).fill(0);
    identityRow[i] = 1;
    return [...row, ...identityRow];
  });

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) {
        pivotRow = row;
      }
    }
    if (Math.abs(augmented[pivotRow][col]) < 1e-12) {
      throw new Error('Matrix is singular and cannot be inverted');
    }
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];

    const pivotValue = augmented[col][col];
    for (let j = 0; j < 2 * n; j++) {
      augmented[col][j] /= pivotValue;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = 0; j < 2 * n; j++) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  return augmented.map((row) => row.slice(n));
}

export function matVec(matrix, vec) {
  return matrix.map((row) => row.reduce((sum, value, j) => sum + value * vec[j], 0));
}

export function dot(a, b) {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

export function quadForm(matrix, vec) {
  return dot(vec, matVec(matrix, vec));
}

export function shermanMorrisonGain(cov, x, w) {
  const covX = matVec(cov, x);
  const numerator = w * dot(covX, covX);
  const denominator = 1 + w * dot(x, covX);
  return numerator / denominator;
}
