export function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', ''); const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
export function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
/** margem (fração) → intensidade 0.28–1: margem pequena = cor lavada, grande = cor cheia */
export const intensity = (margem: number | undefined) => 0.28 + 0.72 * Math.min(1, Math.max(0, (margem ?? 0) / 0.28));
export const readCss = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};
