import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Número que desliza suavemente até o novo valor. */
export function AnimatedNumber({ value, format, ms = 800 }: { value: number; format: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value); const cur = useRef(value);
  useEffect(() => {
    if (reduce() || !isFinite(value)) { setShown(value); cur.current = value; return; }
    from.current = cur.current; const t0 = performance.now(); let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (value - from.current) * e; setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="num">{format(shown)}</span>;
}

export function Skel({ w = '100%', h = 16, style }: { w?: number | string; h?: number | string; style?: CSSProperties }) {
  return <div className="skel" style={{ width: w, height: h, ...style }} aria-hidden />;
}

export function ErrorBox({ what }: { what: string }) {
  return (
    <div className="err" role="status">
      <b>Reconectando…</b>
      <span>Não foi possível carregar {what}. Tentamos de novo automaticamente a cada 10 segundos.</span>
    </div>
  );
}

export function Panel({ title, aside, children, className = '', bodyClass = 'panel-b' }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-h"><h2>{title}</h2>{aside}</div>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}
