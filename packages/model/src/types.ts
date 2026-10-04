export type Campo = 'lula' | 'bolsonaro' | 'outros';

export interface Candidato { nr: number; nome: string; partido: string; campo: Campo; }

/** Baseline (eleição anterior) do município. L/R = % dos votos nominais do campo Lula/Bolsonaro (frações). */
export interface MuniRef { L: number; R: number; turn: number; q: number; }

/** Estado observado de um município num instante (agregado das seções já totalizadas). */
export interface MuniObs {
  id: number;          // código TSE
  uf: string;
  nome?: string;
  ibge?: string;
  te: number;          // eleitores aptos (total do município)
  est: number;         // eleitores aptos nas seções já totalizadas
  c: number;           // comparecimento nas seções totalizadas
  nom: number;         // votos nominais apurados
  brancos: number; nulos: number;
  secTotal: number; secApur: number;
  votos: Record<number, number>;   // nr -> votos nominais apurados
  ref: MuniRef;
}

export interface Params {
  f0: number;          // meia-confiança (fração do eleitorado apurado) p/ turnout e q observados
  lamUf: number;       // ridge: força do prior no fit por UF (em "votos equivalentes")
  lamNat: number;      // ridge do fit nacional
  kappaS: number;      // votos nominais p/ confiar no share observado do próprio município
  minVotesFit: number; // mínimo de votos nominais p/ município entrar no fit
  tau0: number;        // desvio (log-share) sistemático por UF no que falta apurar
  tauNat: number;      // desvio nacional comum a todas as UFs
  sigmaMuni: number;   // desvio idiossincrático por município (log-share)
  rho: number;         // desvio relativo do volume de votos remanescentes (por UF)
  draws: number;
  m0: number;          // massa de prior p/ razões de comparecimento/q (eleitores)
}

export const DEFAULT_PARAMS: Params = {
  f0: 0.2, lamUf: 5000, lamNat: 5000, kappaS: 250, minVotesFit: 300,
  tau0: 0.11, tauNat: 0.04, sigmaMuni: 0.12, rho: 0.03, draws: 400, m0: 20000,
};

export interface ProjectInput {
  cands: Candidato[];
  munis: MuniObs[];
  seats: number;                // quantos eleitos (senado 2026 = 2; presidente/gov = 1)
  rule: 'maioria_absoluta' | 'top';
  nationalPrior: boolean;       // true p/ presidente (um fit nacional serve de prior p/ cada UF)
  qFallback: number;            // nominais por comparecimento se nada observado
  params?: Partial<Params>;
  seed?: number;
}

export interface CandProj {
  nr: number; votosApurados: number; pctApurado: number;
  votosProjetados: number; pctProjetado: number; ic90: [number, number];
  probVitoria1Turno: number; probTop2: number; probEleito: number;
}

export interface UnitProj {          // UF ou município
  id: string; nome?: string; uf: string; pctApurado: number;
  shares: Record<number, number>;    // projeção pontual (% dos nominais no fim)
  apurado: Record<number, number>;
  nominaisProj: number;
}

export interface ProjectResult {
  cands: CandProj[];                 // ordenadas por pctProjetado
  ufs: UnitProj[];
  munis: UnitProj[];
  pctEleitoresApurados: number;
  secApur: number; secTotal: number;
  comparecApurado: number; comparecProjetado: number;
  confrontos: { nrs: [number, number]; prob: number }[];
  probSegundoTurno: number;
  brancosApurado: number; nulosApurado: number;
}
