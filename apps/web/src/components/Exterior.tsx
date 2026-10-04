import type { Candidato, Mapa } from '../lib/types';
import { fmtPct } from '../lib/format';

export function Exterior({ ext, cands }: { ext: Mapa['exterior'] | undefined; cands: Candidato[] }) {
  const by = new Map(cands.map((c) => [c.nr, c]));
  const l = ext?.lider != null ? by.get(ext.lider) : undefined;
  const rows = ext?.shares ? Object.entries(ext.shares).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  const max = rows[0]?.[1] || 1;
  return (
    <aside className="ext" aria-label="Voto no exterior">
      <h3>Exterior</h3>
      <div className="hint">Voto de brasileiros fora do país. Não aparece no mapa.</div>
      {ext ? (
        <>
          {l && <div className="leader"><i style={{ background: l.cor }} />Lidera: {l.nome.split(' ')[0]} <span className="muted">{l.partido}</span></div>}
          <div className="hint">{fmtPct(ext.pctApurado ?? 0, 0)} apurado</div>
          {rows.map(([nr, s]) => { const c = by.get(Number(nr)); return (
            <div className="ext-row" key={nr}><span>{c ? `${c.nome.split(' ')[0]} ${c.partido}` : nr}</span><b className="num">{fmtPct(s)}</b>
              <div className="b"><i style={{ width: `${(s / max) * 100}%`, background: c?.cor ?? 'var(--ink3)' }} /></div></div>
          ); })}
        </>
      ) : <div className="hint">Sem dados ainda.</div>}
    </aside>
  );
}
