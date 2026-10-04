import type { FeatureCollection } from 'geojson';
const memo = new Map<string, Promise<any>>();
function once<T>(url: string): Promise<T> {
  if (!memo.has(url)) memo.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); }).catch((e) => { memo.delete(url); throw e; }));
  return memo.get(url)!;
}
export const loadUfGeo = () => once<FeatureCollection>('/geo/uf.geojson');
export const loadMuniGeo = () => once<FeatureCollection>('/geo/municipios.geojson');
export const loadLabels = () => once<Record<string, [number, number]>>('/geo/uf-labels.json').catch(() => ({}) as Record<string, [number, number]>);
export const loadBBox = () => once<Record<string, [number, number, number, number]>>('/geo/bbox.json').catch(() => ({}) as Record<string, [number, number, number, number]>);
export const BRASIL_BOUNDS: [[number, number], [number, number]] = [[-74.2, -34.2], [-33.5, 5.6]];
