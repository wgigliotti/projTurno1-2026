import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useLive } from '../lib/api';
import { fmtClock, fmtHM, fmtInt, fmtPct } from '../lib/format';
import { AnimatedNumber, Skel } from './ui';

const AVISO = 'Projeção não oficial. Resultado oficial: TSE';

function useTheme() {
  const [t, setT] = useState<'dark' | 'light'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  useEffect(() => { document.documentElement.dataset.theme = t; try { localStorage.setItem('theme', t); } catch { /* ignore */ } }, [t]);
  return [t, () => setT((x) => (x === 'dark' ? 'light' : 'dark'))] as const;
}

function Topbar() {
  const [theme, toggle] = useTheme();
  const { search } = useLocation();
  const keep = (p: string) => ({ pathname: p, search: p === '/governador' || p === '/senador' ? new URLSearchParams(search).get('uf') ? `?uf=${new URLSearchParams(search).get('uf')}` : '' : '' });
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Apuração 2026, início"><b>APURAÇÃO</b><i>2026</i><small>projeção ao vivo</small></Link>
      <nav className="nav" aria-label="Cargos">
        <NavLink to={keep('/')} end>Presidente</NavLink>
        <NavLink to={keep('/governador')}>Governador</NavLink>
        <NavLink to={keep('/senador')}>Senador</NavLink>
        <NavLink to="/historico">Histórico</NavLink>
        <NavLink to="/metodologia">Metodologia</NavLink>
      </nav>
      <span className="spacer" />
      <button className="iconbtn" onClick={toggle} aria-label={`Mudar para tema ${theme === 'dark' ? 'claro' : 'escuro'}`} title="Alternar tema">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" /></svg>
        {theme === 'dark' ? 'Escuro' : 'Claro'}
      </button>
    </header>
  );
}

function Ruler({ pct }: { pct: number }) {
  const n = 50; const on = Math.floor(pct * n);
  return <div className="ruler" aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : i === on && pct < 1 ? 'edge' : ''} />)}</div>;
}

export function LiveBar() {
  const { meta, status, metaErro } = useLive();
  const [now, setNow] = useState(Date.now());
  const rec = useRef({ rel: '', at: Date.now() });
  if (meta && rec.current.rel !== meta.relogio) rec.current = { rel: meta.relogio, at: Date.now() };
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (!meta) return <div className="live">{(status === 'reconectando' || metaErro) && <div className="banner" role="status"><span className="spin" />Reconectando ao servidor…</div>}<div className="live-in"><Skel w={110} h={30} /><Skel w={120} h={36} /><Skel h={44} /><Skel w={160} h={34} /></div></div>;
  const clock = new Date(meta.relogio).getTime() + (meta.fonte === 'live' ? now - rec.current.at : 0);
  const offline = status === 'reconectando';
  return (
    <div className="live" role="region" aria-label="Estado da apuração">
      {offline && <div className="banner" role="status"><span className="spin" />Reconectando ao servidor… os números abaixo podem estar desatualizados.</div>}
      {!offline && meta.pctEleitoresApurados < 0.001 && <div className="banner" role="status">Ainda sem urnas apuradas: os valores abaixo são só a expectativa do modelo (baseline da eleição anterior), não um resultado. A apuração começa após as 17h (Brasília).</div>}
      <div className="live-in">
        <span className={`badge ${meta.fonte === 'replay' ? 'replay' : ''} ${offline ? 'off' : ''}`}>
          <span className="dot" aria-hidden />{offline ? 'SEM SINAL' : meta.fonte === 'replay' ? 'REPLAY 2022' : 'AO VIVO'}
        </span>
        <div className="clock cond num">{fmtClock(clock)}<small>{meta.fonte === 'replay' ? 'horário simulado' : 'horário de Brasília'}</small></div>
        <div className="apur">
          <div className="apur-top">
            <span className="apur-pct cond"><AnimatedNumber value={meta.pctEleitoresApurados} format={(n) => fmtPct(n, 1)} /></span>
            <span className="apur-lab">dos eleitores apurados · <b className="num"><AnimatedNumber value={meta.secoesApuradas} format={fmtInt} /></b> de <span className="num">{fmtInt(meta.secoesTotal)}</span> seções</span>
          </div>
          <Ruler pct={meta.pctEleitoresApurados} />
        </div>
        <div className="live-meta">Última atualização do TSE<br /><b className="num">{fmtHM(meta.ultimaAtualizacaoTSE)}</b></div>
      </div>
    </div>
  );
}

export function Footer() {
  const { meta } = useLive();
  return (
    <footer className="foot">
      <span><b>{AVISO}</b></span>
      <span>Modelo {meta?.modelo.versao ?? '—'} · <Link to="/metodologia">como calculamos</Link></span>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <Topbar />
      <LiveBar />
      <main id="conteudo" className="page" tabIndex={-1}>{children}</main>
      <Footer />
    </>
  );
}
