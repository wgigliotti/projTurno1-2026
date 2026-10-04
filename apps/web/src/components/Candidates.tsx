import type { CSSProperties } from 'react';
import type { Candidato, Decisao } from '../lib/types';
import { fmtInt, fmtPct, fmtProb, fmtNum } from '../lib/format';
import { AnimatedNumber, Skel } from './ui';

export const CAMPO: Record<string, string> = { lula: 'Campo Lula', bolsonaro: 'Campo Bolsonaro', outros: 'Outros' };
const cs = (c: string) => ({ '--c': c }) as CSSProperties;
const pctNum = (n: number) => fmtNum(n * 100, 1);

export function Bar({ c, scale, showApurado = true }: { c: Candidato; scale: number; showApurado?: boolean }) {
  const w = (x: number) => `${Math.min(100, (x / scale) * 100)}%`;
  return (
    <div className="bar" style={cs(c.cor)} role="img"
      aria-label={`${c.nome}: projetado ${fmtPct(c.pctProjetado)}, intervalo de 90% de ${fmtPct(c.ic90[0])} a ${fmtPct(c.ic90[1])}, apurado ${fmtPct(c.pctApurado)}`}>
      <div className="proj" style={{ width: w(c.pctProjetado) }} />
      <div className="ic" style={{ left: w(c.ic90[0]), width: `calc(${w(c.ic90[1])} - ${w(c.ic90[0])})` }} />
      {showApurado && <div className="apm" style={{ left: w(c.pctApurado) }} />}
    </div>
  );
}

export function BarLegend() {
  return (
    <div className="bar-leg" style={cs('var(--ink2)')}>
      <span><i className="k proj" />projetado no fim</span>
      <span><i className="k ic" />faixa de 90%</span>
      <span><i className="k ap" />apurado até agora</span>
    </div>
  );
}

function CandCard({ c, i, scale, top, cargo }: { c: Candidato; i: number; scale: number; top: boolean; cargo: string }) {
  return (
    <article className={`cand ${top ? 'top' : 'small'}`} style={cs(c.cor)} aria-label={`${i + 1}º colocado: ${c.nome}`}>
      <div className="cand-h">
        <div>
          <h3 className="cand-name">{c.nome}</h3>
          <div className="cand-sub">
            <span className="tag"><i className="sw" />{c.partido} {c.nr}</span>
            <span className="tag">{CAMPO[c.campo] ?? c.campo}</span>
          </div>
        </div>
        <span className="rank">{i + 1}º</span>
      </div>
      <div className="cand-main">
        <div>
          <div className="big"><AnimatedNumber value={c.pctProjetado * 100} format={(n) => fmtNum(n, 1)} /><small>%</small></div>
          <div className="big-lab">projetado ({fmtPct(c.ic90[0])} a {fmtPct(c.ic90[1])})</div>
        </div>
        <div className="ap">
          <div className="v"><AnimatedNumber value={c.pctApurado} format={(n) => fmtPct(n)} /></div>
          <div className="l">apurado · <AnimatedNumber value={c.votosApurados} format={fmtInt} /> votos</div>
        </div>
      </div>
      <Bar c={c} scale={scale} />
      {top && <BarLegend />}
      {cargo !== 'senador' && (
        <div className="probs">
          <div className="prob"><div className="pv"><AnimatedNumber value={c.probVitoria1Turno ?? 0} format={fmtProb} /></div><div className="pl">vence no 1º turno</div><div className="pm"><i style={{ width: `${(c.probVitoria1Turno ?? 0) * 100}%` }} /></div></div>
          <div className="prob"><div className="pv"><AnimatedNumber value={c.probSegundoTurno ?? 0} format={fmtProb} /></div><div className="pl">vai ao 2º turno</div><div className="pm"><i style={{ width: `${(c.probSegundoTurno ?? 0) * 100}%` }} /></div></div>
        </div>
      )}
    </article>
  );
}

export function CandidateCards({ cands, cargo }: { cands: Candidato[]; cargo: string }) {
  const scale = Math.max(0.1, ...cands.map((c) => c.ic90[1])) * 1.06;
  const k = Math.max(0, cands.length - 2); const span = k === 1 ? 6 : k === 3 ? 2 : k % 2 === 0 ? 3 : 2;
  return (
    <div className={`cards n${cands.length}`} style={{ '--span': span } as CSSProperties}>
      {cands.map((c, i) => <CandCard key={c.nr} c={c} i={i} scale={scale} top={i < 2} cargo={cargo} />)}
    </div>
  );
}

export function CardsSkeleton() {
  return <div className="cards">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`cand ${i < 2 ? 'top' : 'small'}`}><Skel w="60%" h={26} /><Skel w="40%" h={60} style={{ marginTop: 16 }} /><Skel h={22} style={{ marginTop: 16 }} /><Skel h={40} style={{ marginTop: 16 }} /></div>)}</div>;
}

/* ---- 2º turno ---- */
export function SecondRound({ cands, decisao }: { cands: Candidato[]; decisao?: Decisao | null }) {
  const by = new Map(cands.map((c) => [c.nr, c]));
  if (!decisao) return <div className="empty">Sem dados de decisão.</div>;
  return (
    <div>
      <div className="gauge-row">
        <div className="big cond"><AnimatedNumber value={decisao.probSegundoTurno} format={fmtProb} /></div>
        <div>
          <b>chance de haver 2º turno</b>
          <div className="hint">{fmtProb(decisao.probDecididoNo1Turno)} de chance de definição já hoje, com mais de 50% dos votos válidos.</div>
        </div>
      </div>
      {decisao.confrontosProvaveis.length === 0 && <div className="empty">Sem confrontos prováveis no momento.</div>}
      {decisao.confrontosProvaveis.slice(0, 4).map((d) => {
        const [a, b] = d.nrs.map((n) => by.get(n));
        if (!a || !b) return null;
        return (
          <div className="duel" key={d.nrs.join('-')}>
            <div className="duel-row">
              <div className="vs">
                <span className="sw" style={cs(a.cor)} />{a.nome.split(' ')[0]} <em>{a.partido}</em>
                <em>×</em>
                <span className="sw" style={cs(b.cor)} />{b.nome.split(' ')[0]} <em>{b.partido}</em>
              </div>
              <div className="pv"><AnimatedNumber value={d.prob} format={fmtProb} /></div>
            </div>
            <div className="split" aria-hidden><i style={{ width: `${d.prob * 100}%`, background: 'var(--ink)' }} /><i style={{ width: `${(1 - d.prob) * 100}%`, background: 'transparent' }} /></div>
          </div>
        );
      })}
      <div className="hint" style={{ marginTop: 10 }}>Probabilidades somam a chance de 2º turno ({pctNum(decisao.probSegundoTurno)}%).</div>
    </div>
  );
}

/* ---- Senador: ranking top-2 ---- */
export function SenateRanking({ cands }: { cands: Candidato[] }) {
  const scale = Math.max(0.1, ...cands.map((c) => c.ic90[1])) * 1.06;
  return (
    <div className="rank-list" role="list">
      {cands.map((c, i) => (
        <div key={c.nr}>
          {i === 2 && <div className="cut" role="separator" aria-label="Linha de corte entre eleitos e não eleitos"><span>linha de corte · 2 vagas</span></div>}
          <div className={`rk ${i < 2 ? 'in' : 'out'}`} role="listitem" style={cs(c.cor)}>
            <div className="pos">{i + 1}</div>
            <div>
              <div className="nm">{c.nome}</div>
              <div className="meta"><span className="tag"><i className="sw" />{c.partido} {c.nr}</span> {i < 2 ? 'dentro das 2 vagas' : 'fora das 2 vagas'}</div>
            </div>
            <div>
              <Bar c={c} scale={scale} />
              <div className="hint" style={{ marginTop: 6 }} ><span className="num">{fmtPct(c.pctProjetado)}</span> projetado ({fmtPct(c.ic90[0])} a {fmtPct(c.ic90[1])}) · <span className="num">{fmtPct(c.pctApurado)}</span> apurado · <span className="num">{fmtInt(c.votosApurados)}</span> votos</div>
            </div>
            <div className="pe"><b><AnimatedNumber value={c.probEleito ?? 0} format={fmtProb} /></b><span>chance de eleição</span></div>
          </div>
        </div>
      ))}
      <div style={{ padding: '10px 6px 0' }}><BarLegend /></div>
    </div>
  );
}
