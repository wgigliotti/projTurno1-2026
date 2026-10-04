const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const pf = (d: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pfs = [pf(0), pf(1), pf(2)];
export const fmtInt = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : nf0.format(Math.round(n)));
export const fmtNum = (n: number, d = 1) => pf(d).format(n);
/** fração 0–1 → "45,2%" */
export const fmtPct = (f: number | null | undefined, d = 1) => (f == null || !isFinite(f) ? '—' : pfs[d].format(f * 100) + '%');
/** pontos percentuais: "+3,2 p.p." */
export const fmtPP = (f: number, d = 1) => (f >= 0 ? '+' : '−') + pf(d).format(Math.abs(f) * 100) + ' p.p.';
/** probabilidade: evita "0%" e "100%" enganosos */
export function fmtProb(p: number | null | undefined) {
  if (p == null || !isFinite(p)) return '—';
  if (p > 0 && p < 0.005) return '<1%';
  if (p < 1 && p > 0.995) return '>99%';
  return fmtPct(p, p < 0.1 || p > 0.9 ? 1 : 0).replace(',0%', '%');
}
export const fmtCompact = (n: number) => (n >= 1e6 ? pf(1).format(n / 1e6) + ' mi' : n >= 1e3 ? pf(0).format(n / 1e3) + ' mil' : nf0.format(n));
const tf = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
const tfm = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
export const fmtClock = (iso: string | number | Date) => tf.format(new Date(iso));
export const fmtHM = (iso: string | number | Date) => tfm.format(new Date(iso));
