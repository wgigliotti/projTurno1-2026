import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
type MLMap = maplibregl.Map;
maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);   // worker + shared copiados por scripts/copy-maplibre.mjs
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Candidato, Unidade } from '../lib/types';
import { BRASIL_BOUNDS, loadBBox, loadLabels, loadMuniGeo, loadUfGeo } from '../lib/geo';
import { intensity, mix, readCss } from '../lib/colors';
import { fmtPct } from '../lib/format';

interface Props {
  scope: string; // 'BR' | sigla da UF
  cands: Candidato[];
  unidades: Unidade[]; // BR: nível UF; UF: municípios
  fetchMuni?: (uf: string) => Promise<Unidade[]>;
  tick?: number;
  selectedUf?: string | null;
  onSelectUf?: (uf: string | null) => void;
  mini?: boolean;
  highlightId?: string | null;
}
const MUNI_ZOOM = 4.6;
const hexOk = (c?: string) => (c && /^#[0-9a-f]{3,6}$/i.test(c) ? c : '#8a99ad');

export function ElectionMap({ scope, cands, unidades, fetchMuni, tick = 0, selectedUf = null, onSelectUf, mini = false, highlightId = null }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [geoErr, setGeoErr] = useState(false);
  const [themeV, setThemeV] = useState(0);
  const [level, setLevel] = useState<'uf' | 'municipio'>('uf');
  const [zoom, setZoom] = useState(3);
  const [want, setWant] = useState<string[]>([]);
  const [muni, setMuni] = useState<Record<string, Unidade[]>>({});
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; id: string; muni: boolean } | null>(null);
  const bboxRef = useRef<Record<string, [number, number, number, number]>>({});
  const markers = useRef<Record<string, { m: maplibregl.Marker; el: HTMLDivElement }>>({});
  const painted = useRef<{ uf: Set<string>; mun: Set<string> }>({ uf: new Set(), mun: new Set() });
  const ufIds = useRef<string[]>([]);
  const hov = useRef<{ src: string; id: string } | null>(null);
  const isBR = scope === 'BR';
  const candBy = useMemo(() => new Map(cands.map((c) => [c.nr, c])), [cands]);
  const live = useRef({ onSelectUf, isBR, mini, level, scope });
  live.current = { onSelectUf, isBR, mini, level, scope };

  // lookup para tooltip
  const lookup = useMemo(() => {
    const m = new Map<string, Unidade>();
    for (const u of unidades) m.set(u.id, u);
    for (const list of Object.values(muni)) for (const u of list) m.set(u.cdIbge ?? u.id, u);
    return m;
  }, [unidades, muni]);
  const muniRef = useRef(muni); muniRef.current = muni;
  const lookupRef = useRef(lookup); lookupRef.current = lookup;

  // tema → repintar
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeV((v) => v + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  // ---------- criação do mapa ----------
  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': readCss('--bg-map', '#0b111a') } }] },
      bounds: BRASIL_BOUNDS, fitBoundsOptions: { padding: mini ? 4 : 24 },
      attributionControl: false, dragRotate: false, pitchWithRotate: false, touchZoomRotate: true,
      interactive: !mini, minZoom: 2, maxZoom: 11, renderWorldCopies: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    if (!mini) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    let dead = false;
    map.on('zoom', () => setZoom(map.getZoom()));
    map.on('load', async () => {
      try {
        const [ufGeo, labels, bbox] = await Promise.all([loadUfGeo(), loadLabels(), loadBBox()]);
        if (dead) return;
        bboxRef.current = bbox;
        ufIds.current = ufGeo.features.map((f) => String(f.properties?.[('sigla' in (f.properties ?? {}) ? 'sigla' : 'uf')]));
        const sample = ufGeo.features[0]?.properties ?? {};
        const ufKey = 'sigla' in sample ? 'sigla' : 'uf';
        map.addSource('uf', { type: 'geojson', data: ufGeo, promoteId: ufKey });
        const fillColor: any = ['to-color', ['coalesce', ['feature-state', 'c'], 'rgba(0,0,0,0)']];
        map.addLayer({ id: 'uf-fill', type: 'fill', source: 'uf', paint: { 'fill-color': fillColor, 'fill-antialias': true }, ...(live.current.isBR ? {} : { layout: { visibility: 'none' } }) });
        // municípios entram depois (pesado); camada criada sob demanda
        map.addLayer({ id: 'uf-line', type: 'line', source: 'uf', paint: { 'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], readCss('--ink', '#fff'), readCss('--line2', '#334') ], 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2, ['boolean', ['feature-state', 'hover'], false], 1.8, 0.8] } });
        if (!live.current.isBR) map.setFilter('uf-line', ['==', ['get', ufKey], live.current.scope]);

        if (!live.current.mini) {
          for (const [uf, ll] of Object.entries(labels)) {
            const el = document.createElement('div'); el.className = 'uf-lab'; el.textContent = uf;
            const m = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map); markers.current[uf] = { m, el };
          }
        }
        (map as any)._ufKey = ufKey;
        const ev = (layer: string, src: string, idProp: string, isMuni: boolean) => {
          map.on('mousemove', layer, (e: any) => {
            const f = e.features?.[0]; if (!f) return;
            const id = String(f.properties?.[idProp]);
            if (hov.current && (hov.current.id !== id || hov.current.src !== src)) map.setFeatureState({ source: hov.current.src, id: hov.current.id }, { hover: false });
            hov.current = { src, id }; map.setFeatureState({ source: src, id }, { hover: true });
            map.getCanvas().style.cursor = live.current.isBR && !isMuni ? 'pointer' : live.current.mini ? 'pointer' : 'default';
            setTip({ x: e.point.x, y: e.point.y, id, muni: isMuni });
          });
          map.on('mouseleave', layer, () => {
            if (hov.current) map.setFeatureState({ source: hov.current.src, id: hov.current.id }, { hover: false });
            hov.current = null; map.getCanvas().style.cursor = ''; setTip(null);
          });
        };
        ev('uf-fill', 'uf', ufKey, false);
        map.on('click', 'uf-fill', (e: any) => {
          const f = e.features?.[0]; if (!f) return;
          live.current.onSelectUf?.(String(f.properties?.[ufKey]));
        });
        map.on('click', 'mun-fill', (e: any) => {
          // clique em município: zoom na UF correspondente se ainda não está selecionada
          const uf = String(e.features?.[0]?.properties?.uf ?? ''); if (uf && live.current.isBR) live.current.onSelectUf?.(uf);
        });
        (map as any)._ev = ev;
        setReady(true);
      } catch { setGeoErr(true); }
    });
    return () => { dead = true; markers.current = {}; map.remove(); mapRef.current = null; setReady(false); };
  }, []); // eslint-disable-line

  // ---------- camada de municípios (sob demanda) ----------
  const [muniReady, setMuniReady] = useState(false);
  const needMuni = ready && !mini && (!isBR || level === 'municipio' || !!selectedUf);
  useEffect(() => {
    const map = mapRef.current; if (!needMuni || !map || muniReady) return;
    let dead = false; setLoading(true);
    loadMuniGeo().then((g) => {
      if (dead || !mapRef.current) return;
      map.addSource('mun', { type: 'geojson', data: g, promoteId: 'cd_ibge' });
      const fillColor: any = ['to-color', ['coalesce', ['feature-state', 'c'], 'rgba(0,0,0,0)']];
      map.addLayer({ id: 'mun-fill', type: 'fill', source: 'mun', filter: ['==', ['get', 'uf'], '__none__'], paint: { 'fill-color': fillColor } }, 'uf-line');
      map.addLayer({ id: 'mun-line', type: 'line', source: 'mun', filter: ['==', ['get', 'uf'], '__none__'], paint: { 'line-color': readCss('--bg-map', '#000'), 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.1, 7, 0.5] } }, 'uf-line');
      (map as any)._ev('mun-fill', 'mun', 'cd_ibge', true);
      setMuniReady(true); setLoading(false);
    }).catch(() => { setLoading(false); setGeoErr(true); });
    return () => { dead = true; };
  }, [needMuni, muniReady]);

  // ---------- BR: quais UFs carregar ----------
  const computeWant = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const sel = selectedUf; const out = new Set<string>(); if (sel) out.add(sel);
    if (level === 'municipio' && map.getZoom() >= MUNI_ZOOM) {
      const b = map.getBounds();
      for (const [uf, [w, s, e, n]] of Object.entries(bboxRef.current)) if (!(e < b.getWest() || w > b.getEast() || n < b.getSouth() || s > b.getNorth())) out.add(uf);
      if (out.size > 8) { const c = map.getCenter(); const arr = [...out].sort((a, b) => dist(a, c) - dist(b, c)); out.clear(); arr.slice(0, 8).forEach((x) => out.add(x)); }
    }
    const arr = [...out].sort(); setWant((p) => (p.join() === arr.join() ? p : arr));
    function dist(uf: string, c: { lng: number; lat: number }) { const b = bboxRef.current[uf]; return Math.hypot((b[0] + b[2]) / 2 - c.lng, (b[1] + b[3]) / 2 - c.lat); }
  }, [level, selectedUf]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !isBR || mini) return;
    computeWant(); map.on('moveend', computeWant); return () => { map.off('moveend', computeWant); };
  }, [ready, isBR, mini, computeWant]);
  useEffect(() => { if (selectedUf) setLevel('municipio'); }, [selectedUf]);

  useEffect(() => {
    if (!isBR || !fetchMuni || want.length === 0) return;
    let dead = false; if (want.some((u) => !muniRef.current[u])) setLoading(true);
    Promise.all(want.map((uf) => fetchMuni(uf).then((l) => [uf, l] as const).catch(() => null)))
      .then((rs) => { if (dead) return; setMuni((p) => { const n = { ...p }; for (const r of rs) if (r) n[r[0]] = r[1]; return n; }); })
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [want, tick, isBR, fetchMuni]);

  // ---------- pintura ----------
  const colorOf = useCallback((u: Unidade | undefined) => {
    const bg = readCss('--bg-map', '#0b111a');
    if (!u || u.lider == null || !(u.pctApurado > 0)) return mix(bg, readCss('--ink3', '#74859b').startsWith('#') ? readCss('--ink3', '#74859b') : '#74859b', 0.14);
    const cor = hexOk(candBy.get(u.lider)?.cor);
    return mix(bg.startsWith('#') ? bg : '#0b111a', cor, intensity(u.margem));
  }, [candBy, themeV]); // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    const bg = readCss('--bg-map', '#0b111a');
    map.setPaintProperty('bg', 'background-color', bg);
    map.setPaintProperty('uf-line', 'line-color', ['case', ['boolean', ['feature-state', 'sel'], false], readCss('--ink', '#fff'), readCss('--line2', '#334')]);
    if (map.getLayer('mun-line')) map.setPaintProperty('mun-line', 'line-color', bg);
    const set = (src: string, id: string, st: Record<string, unknown>) => map.setFeatureState({ source: src, id }, st);
    if (mini) {
      const bgc = readCss('--bg-map', '#0b111a'); const base = mix(bgc, readCss('--ink2', '#a7b5c8'), 0.24); const acc = readCss('--accent', '#f2b53c');
      for (const id of ufIds.current) set('uf', id, { c: id === selectedUf ? acc : base, sel: id === selectedUf });
      return;
    }
    if (isBR) {
      for (const u of unidades) set('uf', u.id, { c: colorOf(u), sel: u.id === selectedUf });
    } else if (map.getSource('mun')) {
      for (const u of unidades) set('mun', u.cdIbge ?? u.id, { c: colorOf(u) });
    }
    if (isBR && map.getSource('mun')) {
      for (const list of Object.values(muni)) for (const u of list) set('mun', u.cdIbge ?? u.id, { c: colorOf(u) });
    }
    // UFs com municípios carregados deixam de ser pintadas por baixo
    const loadedUfs = isBR && level === 'municipio' ? Object.keys(muni) : [];
    if (map.getSource('mun')) {
      const flt: any = isBR ? ['in', ['get', 'uf'], ['literal', loadedUfs.length ? loadedUfs : ['__none__']]] : ['==', ['get', 'uf'], scope];
      map.setFilter('mun-fill', flt); map.setFilter('mun-line', flt);
    }
    if (isBR) { const ufKey = (map as any)._ufKey; map.setFilter('uf-fill', loadedUfs.length ? ['!', ['in', ['get', ufKey], ['literal', loadedUfs]]] : null); }
  }, [ready, muniReady, unidades, muni, colorOf, selectedUf, level, isBR, scope, mini, themeV]);

  // seleção destacada nos municípios (hover vindo da tabela)
  useEffect(() => {
    const map = mapRef.current; if (!map || !muniReady || !highlightId) return;
    map.setFeatureState({ source: 'mun', id: highlightId }, { hover: true });
    return () => { map.setFeatureState({ source: 'mun', id: highlightId }, { hover: false }); };
  }, [highlightId, muniReady]);

  // rótulos de UF
  useEffect(() => {
    if (!ready || mini) return;
    const show = isBR && !(level === 'municipio' && (selectedUf || zoom >= MUNI_ZOOM));
    for (const [uf, { el }] of Object.entries(markers.current)) {
      const u = lookup.get(uf); const l = u?.lider != null ? candBy.get(u.lider) : undefined;
      el.style.display = show ? '' : 'none';
      el.innerHTML = `${uf}<span>${l ? l.partido : ''}</span>`;
    }
  }, [ready, unidades, candBy, level, selectedUf, zoom, isBR, mini, lookup]);

  // ---------- câmera ----------
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    const bb = bboxRef.current; const pad = mini ? 4 : 28;
    if (!isBR) { const b = bb[scope]; if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, duration: 0 }); return; }
    if (selectedUf && bb[selectedUf] && !mini) { const b = bb[selectedUf]; map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 900 }); }
    else map.fitBounds(BRASIL_BOUNDS, { padding: pad, duration: mini ? 0 : 700 });
  }, [ready, selectedUf, scope, isBR, mini]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => { const m = mapRef.current; if (!m) return; m.resize(); });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const back = () => { onSelectUf?.(null); setLevel('uf'); };
  const tu = tip ? lookup.get(tip.id) : undefined;
  const nameOf = (id: string) => tu?.nome ?? id;
  const ordered = tu ? Object.entries(tu.shares).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
  const boxW = box.current?.clientWidth ?? 600;

  return (
    <div className="map-col">
    <div className={`map-box ${mini ? 'mini' : ''}`} role="group" aria-label={mini ? 'Seletor de estado no mapa' : 'Mapa por líder projetado'}>
      <div ref={box} />
      {!mini && isBR && ready && (
        <div className="map-ctl">
          <div className="seg" role="group" aria-label="Nível do mapa">
            <button aria-pressed={level === 'uf'} onClick={() => { setLevel('uf'); if (selectedUf) onSelectUf?.(null); }}>Estados</button>
            <button aria-pressed={level === 'municipio'} onClick={() => setLevel('municipio')}>Municípios</button>
          </div>
          {(selectedUf || zoom > 4) && <button className="btn" onClick={back}>Voltar ao Brasil</button>}
        </div>
      )}
      {!mini && isBR && level === 'municipio' && !selectedUf && zoom < MUNI_ZOOM && <div className="map-msg">Clique num estado ou aproxime para carregar os municípios</div>}
      {loading && !mini && <div className="map-loading" role="status">Carregando municípios…</div>}
      {geoErr && <div className="map-msg">Geometrias indisponíveis (public/geo)</div>}
      {tip && (
        <div className="tip" style={{ left: tip.x > boxW - 260 ? tip.x - 230 : tip.x + 14, top: Math.max(6, tip.y - (mini ? 10 : 20)) }}>
          <h4>{nameOf(tip.id)}{!tip.muni && !mini && isBR ? ` (${tip.id})` : ''}</h4>
          {mini ? <div className="tsub">Clique para escolher</div> : tu ? (
            <>
              <div className="tsub">{fmtPct(tu.pctApurado, 0)} apurado · {tu.tipo === 'apurado' ? 'resultado apurado' : 'projeção'}</div>
              {ordered.map(([nr, s], i) => { const c = candBy.get(Number(nr)); return (
                <div className={`tr ${i === 0 ? 'l' : ''}`} key={nr}><i className="sw" style={{ background: hexOk(c?.cor) }} /><span>{c ? `${c.nome.split(' ')[0]} ${c.partido}` : nr}</span><span className="num">{fmtPct(s)}</span></div>
              ); })}
              {tu.margem != null && <div className="tsub" style={{ marginTop: 6, marginBottom: 0 }}>margem do líder: {fmtPct(tu.margem)}</div>}
            </>
          ) : <div className="tsub">Sem dados</div>}
        </div>
      )}
    </div>
    {!mini && ready && <MapLegend cands={cands} />}
    </div>
  );
}

function MapLegend({ cands }: { cands: Candidato[] }) {
  return (
    <div className="legend">
      <div className="lr">{cands.slice(0, 5).map((c) => <span className="li" key={c.nr}><i style={{ background: hexOk(c.cor) }} />{c.nome.split(' ')[0]} {c.partido}</span>)}</div>
      <div className="ramp">cor: líder projetado · intensidade: margem<b aria-hidden /></div>
    </div>
  );
}
