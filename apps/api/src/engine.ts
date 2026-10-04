import { project, Candidato, MuniObs, ProjectResult } from '@eleicao/model';
import { CORES } from './campos.js';
import { UFS } from './ufs.js';

export type Cargo = 'presidente' | 'governador' | 'senador';
export const CARGOS: Cargo[] = ['presidente', 'governador', 'senador'];
export const CARGO_CODE: Record<Cargo, number> = { presidente: 1, governador: 3, senador: 5 };

export interface Snapshot { cands: Candidato[]; munis: MuniObs[]; }
export interface Source {
  fonte: 'live' | 'replay';
  seats(cargo: Cargo): number;
  qFallback(cargo: Cargo): number;
  now(): number;                                   // ms (hora local "naive" como UTC)
  lastTSE(): string | null;
  get(cargo: Cargo, uf: string): Promise<Snapshot | null>;      // estado atual
  serieTimes?(cargo: Cargo, uf: string): Promise<number[]>;     // replay: instantes p/ série
  getAt?(cargo: Cargo, uf: string, t: number): Promise<Snapshot | null>;
  recordedSerie?(cargo: Cargo, uf: string): SeriePoint[];       // live: pontos gravados
}
export interface SeriePoint { t: string; pctApurado: number; cand: Record<number, { p: number; lo: number; hi: number; apurado: number }>; }

export const iso = (t: number) => new Date(t).toISOString().slice(0, 19) + '-03:00';

export function run(src: Source, cargo: Cargo, snap: Snapshot, uf: string, draws = 400): ProjectResult {
  const munis = cargo === 'presidente' && uf !== 'BR' ? snap.munis.filter(m => m.uf === uf) : snap.munis;
  return project({
    cands: snap.cands, munis, seats: src.seats(cargo), rule: cargo === 'senador' ? 'top' : 'maioria_absoluta',
    nationalPrior: cargo === 'presidente' && uf === 'BR', qFallback: src.qFallback(cargo), params: { draws },
  });
}

export function apiProjecao(cargo: Cargo, uf: string, snap: Snapshot, r: ProjectResult, now: number) {
  const byNr = new Map(snap.cands.map(c => [c.nr, c]));
  const candidatos = r.cands.map(p => {
    const c = byNr.get(p.nr)!;
    return {
      nr: p.nr, nome: c.nome, partido: c.partido, campo: c.campo, cor: CORES[c.campo],
      votosApurados: p.votosApurados, pctApurado: p.pctApurado,
      pctProjetado: p.pctProjetado, ic90: p.ic90, votosProjetados: Math.round(p.votosProjetados),
      probVitoria1Turno: cargo === 'senador' ? null : p.probVitoria1Turno,
      probSegundoTurno: cargo === 'senador' ? null : p.probTop2,
      probEleito: cargo === 'senador' ? p.probEleito : null,
    };
  });
  return {
    cargo, uf, atualizadoEm: iso(now), pctEleitoresApurados: r.pctEleitoresApurados,
    secoesApuradas: r.secApur, secoesTotal: r.secTotal,
    comparecimento: { apurado: r.comparecApurado, projetado: r.comparecProjetado },
    candidatos,
    decisao: cargo === 'senador' ? { tipo: 'top2' } : {
      tipo: 'maioria_absoluta', probSegundoTurno: r.probSegundoTurno, probDecididoNo1Turno: 1 - r.probSegundoTurno,
      confrontosProvaveis: r.confrontos,
    },
    branco_nulo: { brancosApurado: r.brancosApurado, nulosApurado: r.nulosApurado },
  };
}

export function apiMapa(snap: Snapshot, r: ProjectResult, nivel: 'uf' | 'municipio', uf: string) {
  const byNr = new Map(snap.cands.map(c => [c.nr, c]));
  const unit = (u: { id: string; nome?: string; pctApurado: number; shares: Record<number, number>; apurado: Record<number, number> }) => {
    const sh = Object.entries(u.shares).sort((a, b) => b[1] - a[1]);
    const ap = Object.entries(u.apurado).sort((a, b) => b[1] - a[1]);
    return {
      id: u.id, cdIbge: nivel === 'municipio' ? u.id : null, nome: u.nome ?? UFS.find(x => x.uf === u.id)?.nome ?? u.id,
      pctApurado: u.pctApurado, lider: ap[0] && ap[0][1] > 0 ? +ap[0][0] : null, liderProjetado: sh[0] ? +sh[0][0] : null,
      margem: sh.length > 1 ? sh[0][1] - sh[1][1] : 0, shares: u.shares, tipo: u.pctApurado >= 0.99 ? 'apurado' : 'projetado',
      cor: sh[0] ? CORES[byNr.get(+sh[0][0])!.campo] : null,
    };
  };
  if (nivel === 'uf') {
    const all = r.ufs.map(unit);
    const ext = all.find(u => u.id === 'ZZ');
    return { nivel, unidades: all.filter(u => u.id !== 'ZZ'), exterior: ext ? { ...ext, nome: 'Exterior' } : null };
  }
  const ms = r.munis.filter(m => m.uf === uf && m.uf !== 'ZZ').map(unit);
  return { nivel, unidades: ms, exterior: null };
}

export function seriePoint(t: number, r: ProjectResult): SeriePoint {
  const cand: SeriePoint['cand'] = {};
  for (const c of r.cands) cand[c.nr] = { p: c.pctProjetado, lo: c.ic90[0], hi: c.ic90[1], apurado: c.pctApurado };
  return { t: iso(t), pctApurado: r.pctEleitoresApurados, cand };
}
