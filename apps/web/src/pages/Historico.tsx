import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useHistorico, candStyles, leaderGap, shortName, type HData, type HSerie } from '../lib/historico';
import { HistChart, BigHist } from '../components/HistChart';
import { ErrorBox, Panel, Skel } from '../components/ui';
import { fmtHM, fmtPP, fmtPct } from '../lib/format';

const REGIOES: Record<string, string[]> = {
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function MiniBlock({ serie, title, domain }: { serie: HSerie | undefined; title: string; domain: [number, number] }) {
  const styles = useMemo(() => (serie ? candStyles(serie.candidatos) : null), [serie]);
  const cands = useMemo(() => {
    if (!serie) return [];
    const lp = serie.pontos[serie.pontos.length - 1];
    return serie.candidatos.filter((c, i) => i < 2 || (i < 3 && (lp?.cand[c.nr]?.projetado ?? 0) >= 0.1));
  }, [serie]);
  const g = useMemo(() => (serie ? leaderGap(serie, cands) : null), [serie, cands]);
  if (!serie || !styles) return <div className="mb"><div className="mb-h"><h4>{title}</h4></div><div className="hc-empty">Sem série</div></div>;
  const lp = serie.pontos[serie.pontos.length - 1];
  return (
    <div className="mb">
      <div className="mb-h">
        <h4>{title}</h4>
        {g && <span className="chip sm" title="Líder: projetado − apurado, na última foto"><i style={{ background: styles.get(g.c.nr)!.cor }} aria-hidden />{shortName(g.c.nome)} <b className="num">{g.now == null ? '—' : fmtPP(g.now)}</b><span className="sr-only"> de diferença entre projetado e apurado</span></span>}
      </div>
      <HistChart serie={serie} cands={cands} styles={styles} mini domain={domain} />
      <div className="mb-f">{cands.map((c) => <span key={c.nr}><i style={{ background: styles.get(c.nr)!.cor }} aria-hidden />{shortName(c.nome)} <b className="num">{fmtPct(lp?.cand[c.nr]?.projetado)}</b></span>)}</div>
    </div>
  );
}

const UfCard = memo(function UfCard({ uf, nome, pres, gov, domain, onOpen }: { uf: string; nome: string; pres?: HSerie; gov?: HSerie; domain: [number, number]; onOpen: (uf: string) => void }) {
  const ap = pres?.pontos[pres.pontos.length - 1]?.pctEleitoresApurados ?? gov?.pontos[gov.pontos.length - 1]?.pctEleitoresApurados;
  return (
    <article className="ucard" onClick={() => onOpen(uf)} aria-label={`${nome}`}>
      <header>
        <button className="ubtn" onClick={(e) => { e.stopPropagation(); onOpen(uf); }} aria-label={`Ampliar histórico de ${nome}`}><b className="cond">{uf}</b><span>{nome}</span></button>
        <span className="chip sm" title="Eleitorado apurado no estado">apurado <b className="num">{ap == null ? '—' : fmtPct(ap, 0)}</b></span>
      </header>
      <div className="ubody">
        <MiniBlock serie={pres} title="Presidente" domain={domain} />
        <MiniBlock serie={gov} title="Governador" domain={domain} />
      </div>
    </article>
  );
});

function UfDialog({ uf, data, onClose }: { uf: string | null; data: HData; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (uf && !d.open) d.showModal(); else if (!uf && d.open) d.close();
  }, [uf]);
  const pres = uf ? data.series[`presidente/${uf}`] : undefined; const gov = uf ? data.series[`governador/${uf}`] : undefined;
  const nome = pres?.nome ?? gov?.nome ?? uf;
  return (
    <dialog ref={ref} className="hdlg" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={`Histórico de ${nome}`}>
      {uf && (
        <div className="hdlg-in">
          <div className="hdlg-h"><h2 className="cond">{nome} <small>{uf}</small></h2><button className="btn" onClick={onClose} autoFocus>Fechar</button></div>
          {pres && <section><h3>Presidente em {nome}</h3><BigHist serie={pres} title={`Presidente em ${nome}`} h={240} /></section>}
          {gov && <section><h3>Governador em {nome}</h3><BigHist serie={gov} title={`Governador em ${nome}`} h={240} /></section>}
        </div>
      )}
    </dialog>
  );
}

export default function Historico() {
  const { data, erro, carregando } = useHistorico();
  const [reg, setReg] = useState('Todas');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const br = data?.series['presidente/BR'];
  const total = data ? Object.values(data.series).reduce((n, s) => n + s.pontos.length, 0) : 0;
  const domain = useMemo<[number, number]>(() => {
    let a = Infinity, b = -Infinity;
    if (data) for (const s of Object.values(data.series)) { if (!s.pontos.length) continue; a = Math.min(a, new Date(s.pontos[0].t).getTime()); b = Math.max(b, new Date(s.pontos[s.pontos.length - 1].t).getTime()); }
    return isFinite(a) ? [a, b] : [0, 1];
  }, [data]);
  const names = useMemo(() => {
    const m: Record<string, string> = {};
    if (data) for (const s of Object.values(data.series)) if (s.uf !== 'BR') m[s.uf] = s.nome;
    return m;
  }, [data]);
  const groups = useMemo(() => {
    const nq = norm(q.trim());
    return Object.entries(REGIOES).filter(([r]) => reg === 'Todas' || reg === r).map(([r, ufs]) => ({
      r, ufs: ufs.filter((u) => names[u] && (!nq || norm(names[u]).includes(nq) || norm(u).includes(nq))).sort((a, b) => names[a].localeCompare(names[b], 'pt-BR')),
    })).filter((g) => g.ufs.length);
  }, [reg, q, names]);
  const count = groups.reduce((n, g) => n + g.ufs.length, 0);

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Histórico</h1>
          <p>A cada 5 minutos o sistema guarda uma foto: quanto já foi contado de fato (tracejada) e quanto o modelo projeta para o resultado final (cheia). Conforme a contagem avança, as duas linhas se encontram.</p>
        </div>
        {data && total > 0 && <div className="stats"><span>Fotos a cada <b className="num">{data.intervaloMin} min</b></span><span>Última <b className="num">{fmtHM(domain[1])}</b></span></div>}
      </div>

      <div className="grid">
        <Panel title="Presidente — Brasil" bodyClass="panel-b hp">
          {carregando && !data ? <><Skel h={32} /><Skel h={360} style={{ marginTop: 12 }} /></>
            : erro && !data ? <ErrorBox what="o histórico" />
            : br && br.pontos.length > 0 ? <BigHist serie={br} title="Presidente, Brasil" h={320} />
            : <div className="empty hist-empty"><b>Ainda não há fotos.</b><br />As fotos começam às 17h05 e são gravadas a cada 5 min. Esta página se atualiza sozinha.</div>}
        </Panel>

        {data && total > 0 && (
          <Panel title="Estados" bodyClass="panel-b" aside={<span className="hint">{count} de 27 estados · clique para ampliar</span>}>
            <div className="hfilters">
              <div className="seg" role="group" aria-label="Filtrar por região">
                {['Todas', ...Object.keys(REGIOES)].map((r) => <button key={r} aria-pressed={reg === r} onClick={() => setReg(r)}>{r}</button>)}
              </div>
              <label className="search"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" /></svg>
                <span className="sr-only">Buscar estado por nome ou sigla</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar estado ou sigla" type="search" /></label>
            </div>
            {groups.length === 0 && <div className="empty">Nenhum estado encontrado para “{q}”.</div>}
            {groups.map((g) => (
              <section key={g.r} className="hreg" aria-label={`Região ${g.r}`}>
                <h3>{g.r} <small>{g.ufs.length}</small></h3>
                <div className="ugrid">
                  {g.ufs.map((u) => <UfCard key={u} uf={u} nome={names[u]} pres={data.series[`presidente/${u}`]} gov={data.series[`governador/${u}`]} domain={domain} onOpen={setOpen} />)}
                </div>
              </section>
            ))}
          </Panel>
        )}
      </div>
      {data && <UfDialog uf={open} data={data} onClose={() => setOpen(null)} />}
    </>
  );
}
