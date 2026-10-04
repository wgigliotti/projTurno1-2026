import { useCallback, useMemo, useState } from 'react';
import { getJSON, useApi, useLive } from '../lib/api';
import type { Mapa, Projecao, Serie } from '../lib/types';
import { CandidateCards, CardsSkeleton, SecondRound } from '../components/Candidates';
import { SeriesChart } from '../components/SeriesChart';
import { ElectionMap } from '../components/ElectionMap';
import { Exterior } from '../components/Exterior';
import { UnitTable } from '../components/UnitTable';
import { ErrorBox, Panel, Skel } from '../components/ui';
import { fmtPct } from '../lib/format';

export default function Presidente() {
  const { tick } = useLive();
  const proj = useApi<Projecao>('/api/projecao/presidente/BR');
  const serie = useApi<Serie>('/api/serie/presidente/BR');
  const mapa = useApi<Mapa>('/api/mapa/presidente/BR?nivel=uf');
  const [sel, setSel] = useState<string | null>(null);
  const fetchMuni = useCallback((uf: string) => getJSON<Mapa>(`/api/mapa/presidente/${uf}?nivel=municipio`).then((m) => m.unidades), []);
  const cands = proj.data?.candidatos ?? [];
  const unidades = useMemo(() => mapa.data?.unidades ?? [], [mapa.data]);

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Presidente da República</h1>
          <p>Projeção do resultado final a partir das seções já apuradas. Vence quem passar de 50% dos votos válidos; senão, os dois primeiros disputam o 2º turno.</p>
        </div>
        {proj.data?.comparecimento && <div className="stats"><span>Comparecimento apurado <b className="num">{fmtPct(proj.data.comparecimento.apurado)}</b></span><span>projetado <b className="num">{fmtPct(proj.data.comparecimento.projetado)}</b></span></div>}
      </div>

      <div className="grid">
        {proj.data ? <CandidateCards cands={cands} cargo="presidente" /> : proj.erro ? <Panel title="Candidatos"><ErrorBox what="a projeção" /></Panel> : <CardsSkeleton />}

        <div className="row-b">
          <Panel title="Projeção ao longo da apuração" bodyClass="">
            {serie.erro && !serie.data ? <div className="panel-b"><ErrorBox what="a série temporal" /></div> : <SeriesChart serie={serie.data} cands={cands} />}
          </Panel>
          <Panel title="Cenário do 2º turno">
            {proj.data ? <SecondRound cands={cands} decisao={proj.data.decisao} /> : <><Skel h={60} /><Skel h={50} style={{ marginTop: 12 }} /><Skel h={50} style={{ marginTop: 12 }} /></>}
          </Panel>
        </div>

        <div className="row-c">
          <Panel title="Mapa do Brasil" aside={<span className="hint">{sel ? `${sel}: municípios` : 'clique num estado'}</span>} bodyClass="">
            {mapa.erro && !mapa.data ? <div className="panel-b"><ErrorBox what="o mapa" /></div> : (
              <div className="map-wrap">
                <ElectionMap scope="BR" cands={cands} unidades={unidades} fetchMuni={fetchMuni} tick={tick} selectedUf={sel} onSelectUf={setSel} />
                <Exterior ext={mapa.data?.exterior} cands={cands} />
              </div>
            )}
          </Panel>
          <Panel title="Estados" bodyClass="">
            {mapa.data ? <UnitTable rows={unidades} cands={cands} label="Líder, margem e percentual apurado por UF" selectedId={sel} onSelect={(u) => setSel(u.id)} maxHeight={600} /> : <div className="panel-b"><Skel h={300} /></div>}
          </Panel>
        </div>
      </div>
    </>
  );
}
