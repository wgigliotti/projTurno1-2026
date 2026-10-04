// O worker do MapLibre importa ./maplibre-gl-shared.mjs; o bundler só emite o worker, então
// copiamos os dois arquivos lado a lado p/ public/maplibre (gerado, fora do git).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const dist = path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')) + '/dist';
const out = new URL('../public/maplibre/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) fs.copyFileSync(path.join(dist, f), path.join(out, f));
console.log('maplibre worker copiado para', out);
