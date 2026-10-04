import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './db.js';
import type { Campo } from '@eleicao/model';
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/campos.json'), 'utf8'));
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const L = new Set<string>(cfg.lula.map(norm)), R = new Set<string>(cfg.bolsonaro.map(norm));
export function campoDe(ano: number, cargo: number, nr: number, partido: string): Campo {
  const k = cfg.porCandidato[`${ano}:${cargo}:${nr}`];
  if (k) return k;
  if (cargo === 1) return 'outros';          // presidente: só Lula e Bolsonaro têm campo (config); demais = outros
  const p = norm(partido || '');
  if (L.has(p)) return 'lula';
  if (R.has(p)) return 'bolsonaro';
  return 'outros';
}
export const CORES: Record<Campo, string> = { lula: '#e0453a', bolsonaro: '#2f6fdb', outros: '#9aa3ad' };
