import { useMemo, useState, type CSSProperties } from 'react';
import type { Candidato, Unidade } from '../lib/types';
import { fmtPP, fmtPct } from '../lib/format';

type Key = 'nome' | 'lider' | 'margem' | 'pct';
export function UnitTable({ rows, cands, label, searchable = false, selectedId, onSelect, onHover, idOf = (u) => u.id, limit = 80, maxHeight = 560 }: {
  rows: Unidade[]; cands: Candidato[]; label: string; searchable?: boolean; selectedId?: string | null;
  onSelect?: (u: Unidade) => void; onHover?: (id: string | null) => void; idOf?: (u: Unidade) => string; limit?: number; maxHeight?: number;
}) {
  const [key, setKey] = useState<Key>('margem');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(limit);
  const by = useMemo(() => new Map(cands.map((c) => [c.nr, c])), [cands]);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = useMemo(() => {
    const nq = norm(q.trim());
    const f = nq ? rows.filter((r) => norm(r.nome).includes(nq)) : rows;
    const val = (u: Unidade) => (key === 'nome' ? u.nome : key === 'lider' ? (by.get(u.lider ?? -1)?.nome ?? '') : key === 'margem' ? (u.margem ?? 0) : u.pctApurado);
    return [...f].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : (x as number) - (y as number)) * dir; });
  }, [rows, q, key, dir, by]);
  const head = (k: Key, text: string, r = false) => (
    <th className={r ? 'r' : ''} aria-sort={key === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => { if (k === key) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(k === 'nome' || k === 'lider' ? 1 : -1); } }}>
        {text}<span aria-hidden>{key === k ? (dir === 1 ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
  return (
    <div>
      {searchable && (
        <div style={{ padding: '10px 16px 0' }}>
          <label className="search"><span className="sr-only">Buscar município</span>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.8" /></svg>
            <input type="search" placeholder="Buscar município" value={q} onChange={(e) => { setQ(e.target.value); setShown(limit); }} />
          </label>
        </div>
      )}
      <div className="tbl-wrap" style={{ maxHeight }}>
        <table className="t">
          <caption className="sr-only">{label}</caption>
          <thead><tr>{head('nome', 'Local')}{head('lider', 'Líder')}{head('margem', 'Margem', true)}{head('pct', 'Apurado', true)}</tr></thead>
          <tbody>
            {list.slice(0, shown).map((u) => {
              const l = by.get(u.lider ?? -1); const id = idOf(u);
              return (
                <tr key={id} className={`row ${selectedId === id ? 'sel' : ''}`} onClick={() => onSelect?.(u)} onMouseEnter={() => onHover?.(id)} onMouseLeave={() => onHover?.(null)}
                  tabIndex={onSelect ? 0 : undefined} onKeyDown={(e) => { if (e.key === 'Enter' && onSelect) onSelect(u); }}>
                  <td>{u.nome}{u.id.length === 2 && <span className="muted"> {u.id}</span>}</td>
                  <td>{l ? <span className="ld" style={{ '--c': l.cor } as CSSProperties}><i />{l.nome.split(' ')[0]} <span className="muted">{l.partido}</span></span> : <span className="muted">—</span>}</td>
                  <td className="r num">{u.margem != null ? fmtPP(u.margem) : '—'}</td>
                  <td className="r num"><span className="mini-bar"><i style={{ width: `${u.pctApurado * 100}%` }} /></span>{fmtPct(u.pctApurado, 0)}</td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={4} className="empty">Nenhum resultado para “{q}”.</td></tr>}
          </tbody>
        </table>
        {list.length > shown && <button className="more" onClick={() => setShown((s) => s + 200)}>Mostrar mais ({list.length - shown} restantes)</button>}
      </div>
    </div>
  );
}
