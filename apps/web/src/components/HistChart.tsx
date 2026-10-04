import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { apur, candStyles, downloadCsv, leaderGap, shortName, titleName, type CandStyle, type HCand, type HSerie } from '../lib/historico';
import { fmtHM, fmtPct, fmtPP } from '../lib/format';

function niceStep(range: number, n: number) {
  const raw = range / n; const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function timeTicks(t0: number, t1: number, max: number) {
  const steps = [5, 10, 15, 30, 60, 120, 180, 360].map((m) => m * 60000);
  const step = steps.find((s) => (t1 - t0) / s <= max) ?? steps[steps.length - 1];
  const out: number[] = []; for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
  return out;
}
const f1 = (n: number) => n.toFixed(1);

function Mark({ x, y, shape, r, fill, stroke, sw = 2 }: { x: number; y: number; shape: number; r: number; fill: string; stroke: string; sw?: number }) {
  const p = { fill, stroke, strokeWidth: sw };
  if (shape === 1) return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...p} />;
  if (shape === 2) return <path d={`M${x},${y - r * 1.3}L${x + r * 1.3},${y}L${x},${y + r * 1.3}L${x - r * 1.3},${y}Z`} {...p} />;
  if (shape === 3) return <path d={`M${x},${y - r * 1.25}L${x + r * 1.2},${y + r}L${x - r * 1.2},${y + r}Z`} {...p} />;
  return <circle cx={x} cy={y} r={r} {...p} />;
}

interface Props {
  serie: HSerie; cands: HCand[]; styles: Map<number, CandStyle>;
  mini?: boolean; domain?: [number, number]; showBand?: boolean; height?: number;
}

/** Linhas cheias = projetado; tracejadas (mesma cor) = apurado. Tudo em SVG próprio. */
function HistChartBase({ serie, cands, styles, mini = false, domain, showBand = true, height }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [wm, setWm] = useState(760);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (mini) return; const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWm(Math.max(280, Math.round(el.clientWidth)))); ro.observe(el); setWm(Math.max(280, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, [mini]);
  const w = mini ? 280 : wm;
  const pts = serie.pontos;
  const ts = useMemo(() => pts.map((p) => new Date(p.t).getTime()), [pts]);
  const narrow = w < 520;
  const m = mini ? { l: 30, r: 8, t: 6 } : { l: 44, r: narrow ? 70 : 110, t: 12 };
  const plotH = mini ? 84 : height ?? (narrow ? 220 : 300);
  const stripH = mini ? 0 : 48; const stripGap = mini ? 0 : 20;
  const stripTop = m.t + plotH + stripGap;
  const axisY = stripTop + stripH + (mini ? 13 : 16);
  const H = axisY + 5;
  const key = cands.map((c) => c.nr).join(',');

  const geo = useMemo(() => {
    if (pts.length === 0) return null;
    let t0 = domain ? domain[0] : ts[0], t1 = domain ? domain[1] : ts[ts.length - 1]; if (t1 <= t0) t1 = t0 + 300000;
    let lo = 1, hi = 0;
    for (const p of pts) for (const c of cands) {
      const v = p.cand[c.nr]; if (!v) continue;
      const a = apur(p, c.nr);
      lo = Math.min(lo, v.projetado, a ?? 1); hi = Math.max(hi, v.projetado, a ?? 0);
      if (!mini && showBand) { lo = Math.min(lo, v.lo); hi = Math.max(hi, v.hi); }
    }
    if (!(hi > lo)) { lo = Math.max(0, lo - 0.05); hi = Math.min(1, hi + 0.05); }
    const step = niceStep(hi - lo, mini ? 2 : 4);
    const y0 = Math.max(0, Math.floor((lo - 1e-9) / step) * step), y1 = Math.min(1, Math.ceil((hi + 1e-9) / step) * step);
    const ticks: number[] = []; for (let v = y0; v <= y1 + 1e-9; v += step) ticks.push(v);
    return { t0, t1, y0, y1, ticks };
  }, [pts, ts, key, mini, showBand, domain?.[0], domain?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!geo || pts.length === 0) return <div ref={wrap} className="hc-empty">Sem fotos ainda</div>;
  const X = (t: number) => m.l + ((t - geo.t0) / (geo.t1 - geo.t0)) * (w - m.l - m.r);
  const Y = (v: number) => m.t + (1 - (v - geo.y0) / (geo.y1 - geo.y0)) * plotH;
  const SY = (v: number) => stripTop + (1 - v) * stripH;
  const last = pts.length - 1;

  const projPath = (nr: number) => pts.map((p, i) => (p.cand[nr] ? `${i ? 'L' : 'M'}${f1(X(ts[i]))},${f1(Y(p.cand[nr].projetado))}` : '')).join('');
  const apurPath = (nr: number) => { let d = '', on = false; pts.forEach((p, i) => { const a = apur(p, nr); if (a == null) { on = false; return; } d += `${on ? 'L' : 'M'}${f1(X(ts[i]))},${f1(Y(a))}`; on = true; }); return d; };
  const bandPath = (nr: number) => {
    const ok = pts.every((p) => p.cand[nr]); if (!ok) return '';
    return pts.map((p, i) => `${i ? 'L' : 'M'}${f1(X(ts[i]))},${f1(Y(p.cand[nr].hi))}`).join('') + pts.map((_, i) => { const j = last - i; return `L${f1(X(ts[j]))},${f1(Y(pts[j].cand[nr].lo))}`; }).join('') + 'Z';
  };

  const onMove = (e: PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect(); const x = (e.clientX - r.left) * (w / r.width);
    let best = 0, bd = 1e12; ts.forEach((t, i) => { const d = Math.abs(X(t) - x); if (d < bd) { bd = d; best = i; } }); setHover(best);
  };
  const onKey = (e: KeyboardEvent) => {
    const cur = hover ?? last;
    if (e.key === 'ArrowLeft') { setHover(Math.max(0, cur - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setHover(Math.min(last, cur + 1)); e.preventDefault(); }
    else if (e.key === 'Home') { setHover(0); e.preventDefault(); }
    else if (e.key === 'End') { setHover(last); e.preventDefault(); }
    else if (e.key === 'Escape') setHover(null);
  };

  const hp = hover != null ? pts[hover] : null;
  const hx = hover != null ? X(ts[hover]) : 0;
  const frac = hover != null ? hx / w : 0;
  const lp = pts[last];
  const ends = !mini ? cands.filter((c) => lp.cand[c.nr]).map((c) => ({ c, y: Y(lp.cand[c.nr].projetado) })).sort((a, b) => a.y - b.y) : [];
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const tk = timeTicks(geo.t0, geo.t1, mini ? 3 : narrow ? 3 : 9);
  const aria = `${serie.cargo === 'presidente' ? 'Presidente' : 'Governador'}, ${serie.nome}. Última foto às ${fmtHM(lp.t)}, ${fmtPct(lp.pctEleitoresApurados, 0)} do eleitorado apurado. ` +
    cands.map((c) => `${titleName(c.nome)}: projetado ${fmtPct(lp.cand[c.nr]?.projetado)}, apurado ${fmtPct(apur(lp, c.nr))}`).join('; ') + '. Use as setas para percorrer as fotos.';
  const fs = mini ? 10 : 11.5;

  return (
    <div className={`hc ${mini ? 'mini' : ''}`} ref={wrap} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={mini ? undefined : H} role="img" aria-label={aria} tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)} style={{ fontSize: fs }}>
        <g className="hc-grid">
          {geo.ticks.map((v) => (<g key={v}><line x1={m.l} x2={w - m.r} y1={Y(v)} y2={Y(v)} /><text x={m.l - 6} y={Y(v) + 3.5} textAnchor="end">{fmtPct(v, 0)}</text></g>))}
        </g>
        {tk.map((t) => <line key={t} className="hc-tick" x1={X(t)} x2={X(t)} y1={m.t + plotH} y2={m.t + plotH + 3} />)}
        {!mini && showBand && cands.map((c) => { const d = bandPath(c.nr); return d ? <path key={c.nr} d={d} fill={styles.get(c.nr)!.cor} opacity={0.13} /> : null; })}
        {cands.map((c) => {
          const s = styles.get(c.nr)!;
          return (
            <g key={c.nr}>
              <path d={apurPath(c.nr)} fill="none" stroke={s.cor} strokeWidth={mini ? 1.5 : 2} strokeDasharray={mini ? '3.5 3' : '6 4'} strokeLinejoin="round" />
              <path d={projPath(c.nr)} fill="none" stroke={s.cor} strokeWidth={mini ? 1.9 : 2.6} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {cands.map((c) => {
          const s = styles.get(c.nr)!; const v = lp.cand[c.nr]; if (!v) return null; const a = apur(lp, c.nr); const r = mini ? 3 : 4.5;
          return (
            <g key={c.nr}>
              {a != null && <Mark x={X(ts[last])} y={Y(a)} shape={s.shape} r={r - 0.5} fill="var(--panel)" stroke={s.cor} sw={1.8} />}
              <Mark x={X(ts[last])} y={Y(v.projetado)} shape={s.shape} r={r} fill={s.cor} stroke="var(--panel)" sw={1.5} />
            </g>
          );
        })}
        {ends.map(({ c, y }) => (
          <text key={c.nr} className="hc-lbl" x={w - m.r + 9} y={y + 4}>{shortName(c.nome).slice(0, narrow ? 7 : 11)} <tspan className="num">{fmtPct(lp.cand[c.nr].projetado, 1)}</tspan></text>
        ))}
        {!mini && (
          <g>
            <line x1={m.l} x2={w - m.r} y1={SY(0)} y2={SY(0)} stroke="var(--line2)" />
            <line x1={m.l} x2={w - m.r} y1={SY(1)} y2={SY(1)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={m.l - 6} y={SY(1) + 3.5} textAnchor="end" className="hc-ax">100%</text>
            <text x={m.l - 6} y={SY(0) + 3.5} textAnchor="end" className="hc-ax">0%</text>
            <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${f1(X(ts[i]))},${f1(SY(p.pctEleitoresApurados))}`).join('') + `L${f1(X(ts[last]))},${SY(0)}L${f1(X(ts[0]))},${SY(0)}Z`} fill="var(--accent)" opacity={0.2} />
            <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${f1(X(ts[i]))},${f1(SY(p.pctEleitoresApurados))}`).join('')} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
            <text className="hc-lbl acc" x={w - m.r + 9} y={SY(lp.pctEleitoresApurados) + 4}>{narrow ? '' : 'urnas '}<tspan className="num">{fmtPct(lp.pctEleitoresApurados, 0)}</tspan></text>
            <text className="hc-ax" x={m.l + 4} y={stripTop + 11}>% do eleitorado apurado</text>
          </g>
        )}
        {tk.map((t, i) => <text key={t} className="hc-ax" x={X(t)} y={axisY} textAnchor={i === 0 && X(t) < m.l + 14 ? 'start' : X(t) > w - m.r - 14 ? 'end' : 'middle'}>{fmtHM(t)}</text>)}
        {hp && <line className="hc-cursor" x1={hx} x2={hx} y1={m.t} y2={stripTop + stripH} />}
        {hp && cands.map((c) => { const v = hp.cand[c.nr]; if (!v) return null; const s = styles.get(c.nr)!; const a = apur(hp, c.nr); const r = mini ? 2.8 : 4;
          return (<g key={c.nr}>
            {a != null && <Mark x={hx} y={Y(a)} shape={s.shape} r={r} fill="var(--panel)" stroke={s.cor} sw={1.8} />}
            <Mark x={hx} y={Y(v.projetado)} shape={s.shape} r={r} fill={s.cor} stroke="var(--panel)" sw={1.5} />
          </g>); })}
      </svg>
      {hp && (
        <div className="hc-tip" style={(frac > 0.5 ? { right: `calc(${(1 - frac) * 100}% + 10px)` } : { left: `calc(${frac * 100}% + 10px)` }) as CSSProperties} role="presentation">
          <div className="th"><b>{fmtHM(hp.t)}</b> · {fmtPct(hp.pctEleitoresApurados, 1)} do eleitorado apurado</div>
          <table>
            <thead><tr><th /><th>Apurado</th><th>Projetado</th><th>Dif.</th></tr></thead>
            <tbody>
              {cands.map((c) => { const v = hp.cand[c.nr]; if (!v) return null; const a = apur(hp, c.nr); const s = styles.get(c.nr)!;
                return (<tr key={c.nr}>
                  <td><i style={{ background: s.cor }} />{shortName(c.nome)}</td>
                  <td className="num">{fmtPct(a)}</td><td className="num"><b>{fmtPct(v.projetado)}</b></td>
                  <td className="num dim">{a == null ? '—' : fmtPP(v.projetado - a)}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
export const HistChart = memo(HistChartBase);

/** Gráfico grande completo: legenda clicável, resumo, tabela e CSV. */
export function BigHist({ serie, title, h = 300 }: { serie: HSerie; title: string; h?: number }) {
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [table, setTable] = useState(false);
  const styles = useMemo(() => candStyles(serie.candidatos), [serie.candidatos]);
  const shown = useMemo(() => serie.candidatos.filter((c) => !hidden.has(c.nr)), [serie.candidatos, hidden]);
  const toggle = (nr: number) => setHidden((s) => { const n = new Set(s); n.has(nr) ? n.delete(nr) : n.add(nr); return n; });
  const g = useMemo(() => leaderGap(serie, shown.length ? shown : serie.candidatos), [serie, shown]);
  const lp = serie.pontos[serie.pontos.length - 1];
  const closing = g && g.now != null && g.before != null && Math.max(Math.abs(g.now), Math.abs(g.before)) >= 0.0005 ? Math.abs(g.now) < Math.abs(g.before) : null;
  return (
    <div className="hbig">
      <div className="hbig-bar">
        <div className="legend-row hl" role="group" aria-label={`Candidatos: ${title}`}>
          {serie.candidatos.map((c) => (
            <button key={c.nr} className="lg" style={{ '--c': styles.get(c.nr)!.cor } as CSSProperties} aria-pressed={!hidden.has(c.nr)} onClick={() => toggle(c.nr)} title="Mostrar ou ocultar">
              <span className="ln2"><i /><i className="d" /></span>{titleName(c.nome)} <span className="muted">{c.partido}</span>
            </button>
          ))}
          <span className="hc-key"><span><i className="solid" />projetado</span><span><i className="dash" />apurado</span><span><i className="band" />IC 90%</span></span>
        </div>
        <div className="hbtns">
          <button className="btn" aria-pressed={table} onClick={() => setTable((v) => !v)}>{table ? 'Ocultar tabela' : 'Ver tabela'}</button>
          <button className="btn" onClick={() => downloadCsv(serie)}>Baixar CSV</button>
        </div>
      </div>
      <div className="hbig-body">
        <div className="hbig-chart">
          <HistChart serie={serie} cands={shown} styles={styles} height={h} />
          {shown.length === 0 && <div className="hc-empty">Todos os candidatos estão ocultos. Use a legenda para mostrar de novo.</div>}
        </div>
        <aside className="hsum" aria-label={`Resumo: ${title}`}>
          <div className="chip"><span>Última foto</span><b className="num">{lp ? fmtHM(lp.t) : '—'}</b></div>
          <div className="chip"><span>Eleitorado apurado</span><b className="num">{lp ? fmtPct(lp.pctEleitoresApurados, 1) : '—'}</b></div>
          {g && (
            <div className="chip gap">
              <span>Projetado − apurado, líder: <b style={{ color: 'var(--ink)' }}>{shortName(g.c.nome)}</b></span>
              <div className="gaprow"><div><b className="num big">{g.now == null ? '—' : fmtPP(g.now)}</b><small>agora</small></div>
                <div><b className="num mid">{g.before == null ? '—' : fmtPP(g.before)}</b><small>{g.beforeT ? `às ${fmtHM(g.beforeT)} (−1 h)` : 'há 1 h: sem foto'}</small></div></div>
              {closing != null && <span className={`trend ${closing ? 'ok' : 'warn'}`}>{closing ? '▼ Diferença fechando' : '▲ Diferença abrindo'}</span>}
            </div>
          )}
        </aside>
      </div>
      {table && (
        <div className="tbl-wrap hbl" tabIndex={0} role="region" aria-label={`Tabela de dados: ${title}`}>
          <table className="t">
            <caption className="sr-only">{title}: percentual apurado e projetado por foto</caption>
            <thead>
              <tr><th rowSpan={2}><span className="th2">Hora</span></th><th rowSpan={2} className="r"><span className="th2">Eleitorado apurado</span></th>{serie.candidatos.map((c) => <th key={c.nr} colSpan={2} className="r grp"><span className="th2">{titleName(c.nome)}</span></th>)}</tr>
              <tr>{serie.candidatos.flatMap((c) => [<th key={c.nr + 'a'} className="r sub"><span className="th2">apurado</span></th>, <th key={c.nr + 'p'} className="r sub"><span className="th2">projetado</span></th>])}</tr>
            </thead>
            <tbody>
              {[...serie.pontos].reverse().map((p) => (
                <tr key={p.t}><td className="num">{fmtHM(p.t)}</td><td className="r num">{fmtPct(p.pctEleitoresApurados, 1)}</td>
                  {serie.candidatos.flatMap((c) => [<td key={c.nr + 'a'} className="r num">{fmtPct(apur(p, c.nr))}</td>, <td key={c.nr + 'p'} className="r num">{fmtPct(p.cand[c.nr]?.projetado)}</td>])}
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
