import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Candidato, Serie } from '../lib/types';
import { fmtHM, fmtPct } from '../lib/format';
import { Skel } from './ui';

function niceStep(range: number, n: number) {
  const raw = range / n; const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

export function SeriesChart({ serie, cands, height = 300 }: { serie: Serie | null; cands: Candidato[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth - 12))); ro.observe(el); setW(Math.max(280, el.clientWidth - 12));
    return () => ro.disconnect();
  }, []);

  const pts = serie?.pontos ?? [];
  const visible = cands.filter((c) => !hidden.has(c.nr));
  const m = { l: 44, r: w < 520 ? 52 : 96, t: 12, b: 24 };
  const hMain = height, hStrip = 62, gap = 22;
  const H = hMain + gap + hStrip + 22;
  const geo = useMemo(() => {
    if (pts.length === 0) return null;
    const ts = pts.map((p) => new Date(p.t).getTime());
    let t0 = ts[0], t1 = ts[ts.length - 1]; if (t1 === t0) t1 = t0 + 60000;
    let lo = 1, hi = 0;
    for (const p of pts) for (const c of visible) { const v = p.cand[c.nr]; if (v) { lo = Math.min(lo, v.lo); hi = Math.max(hi, v.hi); } }
    if (!(hi > lo)) { lo = 0; hi = 1; }
    const step = niceStep(hi - lo, 4);
    const y0 = Math.max(0, Math.floor(lo / step) * step), y1 = Math.min(1, Math.ceil(hi / step) * step);
    const ticks: number[] = []; for (let v = y0; v <= y1 + 1e-9; v += step) ticks.push(v);
    return { ts, t0, t1, y0, y1, ticks };
  }, [pts, visible.map((c) => c.nr).join(',')]); // eslint-disable-line

  if (!serie) return <div ref={ref}><Skel h={H} /></div>;
  if (!geo || pts.length === 0) return <div ref={ref} className="empty">A série aparece assim que o primeiro boletim for processado.</div>;
  const X = (t: number) => m.l + ((t - geo.t0) / (geo.t1 - geo.t0)) * (w - m.l - m.r);
  const Y = (v: number) => m.t + (1 - (v - geo.y0) / (geo.y1 - geo.y0)) * (hMain - m.t - m.b);
  const sy = (v: number) => hMain + gap + (1 - v) * hStrip;
  const path = (f: (i: number) => [number, number]) => pts.map((_, i) => { const [x, y] = f(i); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('');
  const xt = geo.ts;

  // rótulos diretos nos finais das linhas, sem sobreposição
  const ends = visible.map((c) => ({ c, y: Y(pts[pts.length - 1].cand[c.nr]?.p ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  const onMove = (e: React.PointerEvent) => {
    const r = chartRef.current!.getBoundingClientRect(); const x = e.clientX - r.left;
    let best = 0, bd = 1e9; xt.forEach((t, i) => { const d = Math.abs(X(t) - x); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const hp = hover != null ? pts[hover] : null;
  const hx = hover != null ? X(xt[hover]) : 0;
  const tipLeft = hx > w * 0.55;
  const toggle = (nr: number) => setHidden((s) => { const n = new Set(s); n.has(nr) ? n.delete(nr) : n.add(nr); return n; });
  const cstyle = (c: string) => ({ '--c': c }) as CSSProperties;
  const timeTicks = 5; const tickIdx = Array.from({ length: timeTicks }, (_, i) => geo.t0 + ((geo.t1 - geo.t0) * i) / (timeTicks - 1));

  return (
    <div ref={ref}>
      <div className="legend-row" role="group" aria-label="Candidatos no gráfico">
        {cands.map((c) => (
          <button key={c.nr} className="lg" style={cstyle(c.cor)} aria-pressed={!hidden.has(c.nr)} onClick={() => toggle(c.nr)}>
            <span className="ln" />{c.nome.split(' ')[0]} <span className="muted">{c.partido}</span>
          </button>
        ))}
        <span className="hint" style={{ alignSelf: 'center' }}>Linha: projeção · faixa: intervalo de 90%</span>
      </div>
      <div className="chart" ref={chartRef} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ padding: '0 6px' }}>
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Série temporal da projeção por candidato, com faixa de confiança de 90 por cento, e percentual apurado">
          <g className="grid axis">
            {geo.ticks.map((v) => (<g key={v}><line x1={m.l} x2={w - m.r} y1={Y(v)} y2={Y(v)} /><text x={m.l - 8} y={Y(v) + 4} textAnchor="end">{fmtPct(v, 0)}</text></g>))}
          </g>
          {visible.map((c) => {
            const get = (i: number) => pts[i].cand[c.nr];
            const ok = pts.every((_, i) => get(i));
            if (!ok) return null;
            const band = pts.map((_, i) => `${i ? 'L' : 'M'}${X(xt[i]).toFixed(1)},${Y(get(i).hi).toFixed(1)}`).join('') +
              pts.map((_, i) => { const j = pts.length - 1 - i; return `L${X(xt[j]).toFixed(1)},${Y(get(j).lo).toFixed(1)}`; }).join('') + 'Z';
            return (
              <g key={c.nr}>
                <path d={band} fill={c.cor} opacity={0.16} />
                <path d={path((i) => [X(xt[i]), Y(get(i).p)])} fill="none" stroke={c.cor} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={X(xt[pts.length - 1])} cy={Y(get(pts.length - 1).p)} r={4} fill={c.cor} stroke="var(--panel)" strokeWidth={2} />
              </g>
            );
          })}
          {ends.map(({ c, y }) => (
            <text key={c.nr} className="lbl" x={w - m.r + 10} y={y + 4} fill={c.cor} style={{ fill: 'var(--ink)' }}>
              {c.nome.split(' ')[0].slice(0, 9)} {fmtPct(pts[pts.length - 1].cand[c.nr]?.p, 1)}
            </text>
          ))}
          {/* tira do % apurado */}
          <g>
            <text x={m.l - 8} y={hMain + gap + 8} textAnchor="end">100%</text>
            <text x={m.l - 8} y={hMain + gap + hStrip + 3} textAnchor="end">0%</text>
            <line x1={m.l} x2={w - m.r} y1={sy(0)} y2={sy(0)} stroke="var(--line2)" />
            <line x1={m.l} x2={w - m.r} y1={sy(1)} y2={sy(1)} stroke="var(--line)" strokeDasharray="3 4" />
            <path d={path((i) => [X(xt[i]), sy(pts[i].pctApurado)]) + `L${X(xt[pts.length - 1])},${sy(0)}L${X(xt[0])},${sy(0)}Z`} fill="var(--accent)" opacity={0.18} />
            <path d={path((i) => [X(xt[i]), sy(pts[i].pctApurado)])} fill="none" stroke="var(--accent)" strokeWidth={2} />
            <text x={w - m.r + 10} y={sy(pts[pts.length - 1].pctApurado) + 4} className="lbl" style={{ fill: 'var(--accent)' }}>apurado {fmtPct(pts[pts.length - 1].pctApurado, 0)}</text>
          </g>
          {tickIdx.map((t, i) => (<text key={i} x={X(t)} y={H - 2} textAnchor={i === 0 ? 'start' : i === timeTicks - 1 ? 'end' : 'middle'}>{fmtHM(t)}</text>))}
          {hover != null && <line x1={hx} x2={hx} y1={m.t} y2={hMain + gap + hStrip} stroke="var(--ink2)" strokeDasharray="2 3" />}
          {hover != null && hp && visible.map((c) => hp.cand[c.nr] && <circle key={c.nr} cx={hx} cy={Y(hp.cand[c.nr].p)} r={4.5} fill={c.cor} stroke="var(--panel)" strokeWidth={2} />)}
        </svg>
        {hp && (
          <div className="ctip" style={{ left: tipLeft ? undefined : hx + 12, right: tipLeft ? w - hx + 12 : undefined }}>
            <div className="th"><b style={{ color: 'var(--ink)' }}>{fmtHM(hp.t)}</b> · {fmtPct(hp.pctApurado, 1)} apurado</div>
            {visible.map((c) => hp.cand[c.nr] && (
              <div className="tr" key={c.nr}><i style={{ background: c.cor }} /><span>{c.nome.split(' ')[0]}</span><b className="num">{fmtPct(hp.cand[c.nr].p)} <span className="muted" style={{ fontWeight: 400 }}>({fmtPct(hp.cand[c.nr].lo, 0)}–{fmtPct(hp.cand[c.nr].hi, 0)})</span></b></div>
            ))}
          </div>
        )}
      </div>
      <details className="tview">
        <summary>Ver como tabela</summary>
        <div className="tbl-wrap" style={{ maxHeight: 220 }}>
          <table className="t"><thead><tr><th><span style={{ padding: 10, display: 'block' }}>Hora</span></th><th className="r"><span style={{ padding: 10, display: 'block' }}>Apurado</span></th>{cands.map((c) => <th className="r" key={c.nr}><span style={{ padding: 10, display: 'block' }}>{c.nome.split(' ')[0]}</span></th>)}</tr></thead>
            <tbody>{pts.slice(-10).reverse().map((p) => <tr key={p.t}><td>{fmtHM(p.t)}</td><td className="r num">{fmtPct(p.pctApurado)}</td>{cands.map((c) => <td className="r num" key={c.nr}>{p.cand[c.nr] ? fmtPct(p.cand[c.nr].p) : '—'}</td>)}</tr>)}</tbody></table>
        </div>
      </details>
    </div>
  );
}
