import { createContext, useContext, useEffect, useRef, useState, type ReactNode, createElement } from 'react';
import type { Meta } from './types';

export class ApiError extends Error {}

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(path, { signal, headers: { accept: 'application/json' } });
  if (!r.ok) throw new ApiError(`${r.status} ${r.statusText}`);
  return r.json();
}

export type LinkStatus = 'conectando' | 'ao-vivo' | 'reconectando';
interface Live { tick: number; status: LinkStatus; meta: Meta | null; metaErro: boolean }
const LiveCtx = createContext<Live>({ tick: 0, status: 'conectando', meta: null, metaErro: false });
export const useLive = () => useContext(LiveCtx);

/** Mantém SSE em /api/stream; se cair, o EventSource reconecta sozinho e, enquanto isso, fazemos polling a cada 10 s. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<LinkStatus>('conectando');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErro, setMetaErro] = useState(false);
  const poll = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const loadMeta = () => getJSON<Meta>('/api/meta').then((m) => { if (alive) { setMeta(m); setMetaErro(false); setStatus((s) => (s === 'reconectando' && poll.current === undefined ? 'ao-vivo' : s)); } }).catch(() => alive && setMetaErro(true));
    const startPoll = () => {
      if (poll.current !== undefined) return;
      poll.current = window.setInterval(() => { setTick((t) => t + 1); loadMeta(); }, 10_000);
    };
    const stopPoll = () => { if (poll.current !== undefined) { clearInterval(poll.current); poll.current = undefined; } };
    loadMeta();
    let es: EventSource | null = null;
    if (typeof EventSource === 'undefined') { setStatus('reconectando'); startPoll(); }
    else {
      es = new EventSource('/api/stream');
      es.onopen = () => { stopPoll(); setStatus('ao-vivo'); setTick((t) => t + 1); loadMeta(); };
      es.addEventListener('update', () => { setStatus('ao-vivo'); setTick((t) => t + 1); loadMeta(); });
      es.onerror = () => { setStatus('reconectando'); startPoll(); };
    }
    return () => { alive = false; es?.close(); stopPoll(); };
  }, []);

  return createElement(LiveCtx.Provider, { value: { tick, status, meta, metaErro } }, children);
}

export interface Res<T> { data: T | null; erro: boolean; carregando: boolean }
/** GET que refaz a cada tick do stream. Mantém o dado anterior enquanto atualiza (sem piscar). */
export function useApi<T>(path: string | null): Res<T> {
  const { tick } = useLive();
  const [s, setS] = useState<{ key: string | null; data: T | null; erro: boolean }>({ key: null, data: null, erro: false });
  useEffect(() => {
    if (!path) return;
    const ac = new AbortController();
    getJSON<T>(path, ac.signal)
      .then((d) => setS({ key: path, data: d, erro: false }))
      .catch((e) => { if (e.name !== 'AbortError') setS((p) => ({ key: path, data: p.key === path ? p.data : null, erro: true })); });
    return () => ac.abort();
  }, [path, tick]);
  const same = s.key === path;
  return { data: same ? s.data : null, erro: same && s.erro, carregando: !same || (s.data == null && !s.erro) };
}
