import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON, useLive } from './api';
import { fmtHM } from './format';

export interface HCand { nr: number; nome: string; partido: string; campo: 'lula' | 'bolsonaro' | 'outros' }
export interface HVal { apurado: number; projetado: number; lo: number; hi: number }
export interface HPonto { t: string; pctEleitoresApurados: number; cand: Record<string, HVal> }
export interface HSerie { cargo: string; uf: string; nome: string; candidatos: HCand[]; pontos: HPonto[] }
export interface HData { fonte: 'live' | 'replay'; inicio: string; intervaloMin: number; atualizadoEm: string; series: Record<string, HSerie> }

/** Mantém a identidade dos objetos que não mudaram, para o React não redesenhar 54 gráficos à toa. */
function share(prev: HData | null, next: HData): HData {
  if (!prev) return next;
  const series: Record<string, HSerie> = {};
  for (const [k, s] of Object.entries(next.series)) {
    const o = prev.series[k];
    const sig = (x: HSerie) => `${x.candidatos.map((c) => c.nr).join(',')}|${x.pontos.length}|${JSON.stringify(x.pontos[x.pontos.length - 1] ?? null)}`;
    series[k] = o && sig(o) === sig(s) ? o : s;
  }
  return { ...next, series };
}

/** GET /api/historico/tudo: refaz a cada 60 s e quando chega um evento `update` do SSE. */
export function useHistorico() {
  const { tick } = useLive();
  const [st, setSt] = useState<{ data: HData | null; erro: boolean; carregando: boolean }>({ data: null, erro: false, carregando: true });
  const ac = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    ac.current?.abort(); const c = new AbortController(); ac.current = c;
    getJSON<HData>('/api/historico/tudo', c.signal)
      .then((d) => setSt((p) => ({ data: share(p.data, d), erro: false, carregando: false })))
      .catch((e) => { if (e.name !== 'AbortError') setSt((p) => ({ ...p, erro: true, carregando: false })); });
  }, []);
  useEffect(() => { load(); const i = setInterval(load, 60_000); return () => { clearInterval(i); ac.current?.abort(); }; }, [load]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h = setTimeout(load, 1500); return () => clearTimeout(h);
  }, [tick, load]);
  return st;
}

/** % real apurada do candidato nesse ponto; null enquanto nada foi contado (0% não é informação). */
export const apur = (p: HPonto, nr: number): number | null => {
  const v = p.cand[nr]; return v && p.pctEleitoresApurados > 0 ? v.apurado : null;
};

export function shortName(nome: string) {
  const w = nome.trim().split(/\s+/); const s = w.length > 1 ? w[w.length - 1] : w[0];
  return s.charAt(0) + s.slice(1).toLowerCase();
}
export const titleName = (nome: string) => nome.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());

const OUTROS = ['var(--hc-outros)', 'var(--hc-o2)', 'var(--hc-o3)', 'var(--hc-o4)'];
export interface CandStyle { cor: string; shape: number }
/** Cor por campo político (mesmas do resto do app); repetidos no mesmo campo ganham variação de tom + forma de marcador. */
export function candStyles(cands: HCand[]): Map<number, CandStyle> {
  const n: Record<string, number> = {}; const out = new Map<number, CandStyle>();
  cands.forEach((c, i) => {
    const k = n[c.campo] = (n[c.campo] ?? -1) + 1;
    let cor: string;
    if (c.campo === 'outros') cor = OUTROS[Math.min(k, OUTROS.length - 1)];
    else { const b = `var(--hc-${c.campo})`; cor = k === 0 ? b : `color-mix(in srgb, ${b} ${k === 1 ? 62 : 45}%, var(--ink))`; }
    out.set(c.nr, { cor, shape: i % 4 });
  });
  return out;
}

export interface Gap { c: HCand; now: number | null; before: number | null; beforeT: string | null }
/** Líder (maior projeção na última foto) e a diferença projetado − apurado agora e há ~1 h. */
export function leaderGap(s: HSerie, cands: HCand[] = s.candidatos): Gap | null {
  const pts = s.pontos; const last = pts[pts.length - 1];
  if (!last || cands.length === 0) return null;
  let c = cands[0]; for (const x of cands) if ((last.cand[x.nr]?.projetado ?? -1) > (last.cand[c.nr]?.projetado ?? -1)) c = x;
  const g = (p: HPonto) => { const a = apur(p, c.nr); return a == null ? null : p.cand[c.nr].projetado - a; };
  const lt = new Date(last.t).getTime();
  let b: HPonto | undefined; for (let i = pts.length - 2; i >= 0; i--) if (new Date(pts[i].t).getTime() <= lt - 3600_000 + 1000) { b = pts[i]; break; }
  return { c, now: g(last), before: b ? g(b) : null, beforeT: b ? b.t : null };
}

export function toCsv(s: HSerie) {
  const f = (v: number | null | undefined) => (v == null ? '' : (v * 100).toFixed(2));
  const head = ['hora', 'pct_eleitorado_apurado', ...s.candidatos.flatMap((c) => [`${c.nome} apurado`, `${c.nome} projetado`, `${c.nome} ic90_min`, `${c.nome} ic90_max`])];
  const rows = s.pontos.map((p) => [p.t, f(p.pctEleitoresApurados), ...s.candidatos.flatMap((c) => [f(apur(p, c.nr)), f(p.cand[c.nr]?.projetado), f(p.cand[c.nr]?.lo), f(p.cand[c.nr]?.hi)])]);
  return '﻿' + [head, ...rows].map((r) => r.map((x) => `"${x}"`).join(',')).join('\n');
}
export function downloadCsv(s: HSerie) {
  const url = URL.createObjectURL(new Blob([toCsv(s)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `historico-${s.cargo}-${s.uf}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export { fmtHM };
