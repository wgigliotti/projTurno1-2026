export type Cargo = 'presidente' | 'governador' | 'senador';
export interface UfInfo { uf: string; nome: string; regiao: string }
export interface Meta {
  fonte: 'live' | 'replay'; relogio: string; ultimaAtualizacaoTSE: string; pctEleitoresApurados: number;
  secoesApuradas: number; secoesTotal: number; ufs: UfInfo[]; modelo: { versao: string; aviso: string };
}
export interface Candidato {
  nr: number; nome: string; partido: string; campo: 'lula' | 'bolsonaro' | 'outros'; cor: string;
  votosApurados: number; pctApurado: number; pctProjetado: number; ic90: [number, number]; votosProjetados: number;
  probVitoria1Turno: number | null; probSegundoTurno: number | null; probEleito: number | null;
}
export interface Decisao {
  tipo: string; probSegundoTurno: number; probDecididoNo1Turno: number;
  confrontosProvaveis: { nrs: number[]; prob: number }[];
}
export interface Projecao {
  cargo: Cargo; uf: string; atualizadoEm: string; pctEleitoresApurados: number; secoesApuradas: number; secoesTotal: number;
  comparecimento?: { apurado: number; projetado: number };
  candidatos: Candidato[]; decisao?: Decisao | null; branco_nulo?: { brancosApurado: number; nulosApurado: number };
}
export interface SeriePonto { t: string; pctApurado: number; cand: Record<string, { p: number; lo: number; hi: number; apurado: number }> }
export interface Serie { pontos: SeriePonto[] }
export interface Unidade {
  id: string; cdIbge?: string | null; nome: string; pctApurado: number; lider: number | null; liderProjetado?: number | null;
  margem?: number; shares: Record<string, number>; tipo?: 'apurado' | 'projetado';
}
export interface Mapa { nivel: 'uf' | 'municipio'; unidades: Unidade[]; exterior?: Partial<Unidade> & { id: string; nome: string } }
