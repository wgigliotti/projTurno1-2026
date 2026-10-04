import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, useLive } from '../lib/api';
import type { Cargo, Mapa, Projecao, Serie } from '../lib/types';
import { CandidateCards, CardsSkeleton, SecondRound, SenateRanking } from '../components/Candidates';
import { SeriesChart } from '../components/SeriesChart';
import { ElectionMap } from '../components/ElectionMap';
import { UnitTable } from '../components/UnitTable';
import { ErrorBox, Panel, Skel } from '../components/ui';
import { fmtInt, fmtPct } from '../lib/format';

export default function CargoPage({ cargo }: { cargo: Exclude<Cargo, 'presidente'> }) {
  const { meta } = useLive();
  const [sp, setSp] = useSearchParams();
  const ufs = meta?.ufs ?? [];
  const raw = (sp.get('uf') ?? 'SP').toUpperCase();
  const uf = ufs.length && !ufs.some((u) => u.uf === raw) ? 'SP' : raw;
  const setUf = (v: string | null) => { if (v) setSp({ uf: v }, { replace: false }); };
  const info = ufs.find((u) => u.uf === uf);
  const [hl, setHl] = useState<string | null>(null);

  const proj = useApi<Projecao>(`/api/projecao/${cargo}/${uf}`);
  const serie = useApi<Serie>(`/api/serie/${cargo}/${uf}`);
  const mapa = useApi<Mapa>(`/api/mapa/${cargo}/${uf}?nivel=municipio`);
  const cands = proj.data?.candidatos ?? [];
  const rows = useMemo(() => mapa.data?.unidades ?? [], [mapa.data]);
  const isSen = cargo === 'senador';
  const nome = info?.nome ?? uf;

  return (
    <>
      <div className="page-h">
        <div>
          <h1>{isSen ? 'Senador' : 'Governador'} · {nome}</h1>
          <p>{isSen ? 'Duas vagas em disputa: ficam os dois mais votados. A linha de corte separa quem a projeção coloca dentro e fora.' : 'Vence quem passar de 50% dos votos válidos; senão, os dois primeiros vão ao 2º turno.'}</p>
        </div>
        {proj.data && <div className="stats"><span>Apurado <b className="num">{fmtPct(proj.data.pctEleitoresApurados)}</b></span><span>Seções <b className="num">{fmtInt(proj.data.secoesApuradas)}</b> de <span className="num">{fmtInt(proj.data.secoesTotal)}</span></span></div>}
      </div>

      <div className="grid">
        <div className="cargo-top">
          <Panel title="Estado" bodyClass="panel-b picker">
            <label className="sr-only" htmlFor="uf-sel">Escolher estado</label>
            <select id="uf-sel" className="sel" value={uf} onChange={(e) => setUf(e.target.value)}>
              {(ufs.length ? ufs : [{ uf, nome: uf, regiao: '' }]).map((u) => <option key={u.uf} value={u.uf}>{u.nome} ({u.uf})</option>)}
            </select>
            <ElectionMap scope="BR" mini cands={[]} unidades={[]} selectedUf={uf} onSelectUf={setUf} />
            <div className="hint">Ou clique no mapa para trocar de estado.</div>
          </Panel>
          {proj.data ? (
            isSen ? <Panel title="Ranking projetado"><SenateRanking cands={cands} /></Panel> : <CandidateCards cands={cands} cargo={cargo} />
          ) : proj.erro ? <Panel title="Candidatos"><ErrorBox what="a projeção" /></Panel> : <CardsSkeleton />}
        </div>

        <div className={isSen ? '' : 'cargo-grid'}>
          <Panel title="Projeção ao longo da apuração" bodyClass="">
            {serie.erro && !serie.data ? <div className="panel-b"><ErrorBox what="a série temporal" /></div> : <SeriesChart serie={serie.data} cands={cands} height={280} />}
          </Panel>
          {!isSen && <Panel title="Cenário do 2º turno">{proj.data ? <SecondRound cands={cands} decisao={proj.data.decisao} /> : <Skel h={140} />}</Panel>}
        </div>

        <div className="row-c">
          <Panel title={`Municípios de ${nome}`} bodyClass="">
            {mapa.erro && !mapa.data ? <div className="panel-b"><ErrorBox what="o mapa" /></div> : <div className="map-wrap" style={{ gridTemplateColumns: '1fr' }}><ElectionMap key={uf} scope={uf} cands={cands} unidades={rows} highlightId={hl} /></div>}
          </Panel>
          <Panel title="Municípios" bodyClass="">
            {mapa.data ? <UnitTable key={uf} rows={rows} cands={cands} label={`Líder, margem e percentual apurado por município de ${nome}`} searchable onHover={setHl} idOf={(u) => u.cdIbge ?? u.id} /> : <div className="panel-b"><Skel h={300} /></div>}
          </Panel>
        </div>
      </div>
    </>
  );
}
