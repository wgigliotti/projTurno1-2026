/** Resolve A x = b (A n×n) por eliminação gaussiana com pivotamento. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    const d = M[i][i] || 1e-12;
    for (let c = i; c <= n; c++) M[i][c] /= d;
    for (let r = 0; r < n; r++) if (r !== i) {
      const f = M[r][i];
      if (f) for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map(r => r[n]);
}

/** Ridge ponderado com prior: min Σ w (y - xβ)² + Σ lam_j (β_j - β0_j)². */
export function ridge(X: number[][], y: number[], w: number[], lam: number[], beta0: number[]): number[] {
  const p = lam.length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const xi = X[i], wi = w[i];
    for (let j = 0; j < p; j++) {
      b[j] += wi * xi[j] * y[i];
      for (let k = 0; k < p; k++) A[j][k] += wi * xi[j] * xi[k];
    }
  }
  for (let j = 0; j < p; j++) { A[j][j] += lam[j]; b[j] += lam[j] * beta0[j]; }
  return solve(A, b);
}

// PRNG determinístico (mulberry32) + normal (Box–Muller)
export function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { u, n: () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u()) };
}
