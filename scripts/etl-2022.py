#!/usr/bin/env python3
"""ETL Boletim de Urna 2022 1o turno -> Postgres (secao_hist, voto_secao_hist, candidato_hist, resultado_mun_hist).
Uso: python3 scripts/etl-2022.py [--uf XX ...] [--keep-zip] [--no-agg]
Sem --uf: todos (27 UFs + ZZ). Idempotente por UF (apaga e recarrega). CSV nunca é extraído (stream do zip)."""
import sys, os, io, csv, zipfile, subprocess, time, collections, datetime, argparse, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
LOG = os.path.join(DATA, 'etl-2022.log')
UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO ZZ".split()
URL = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_1t_%s_051020221321.zip"
CARGOS = {'1', '3', '5'}
csv.field_size_limit(1 << 24)

def env():
    d = {}
    for l in open(os.path.join(ROOT, '.env')):
        if '=' in l and not l.startswith('#'):
            k, v = l.strip().split('=', 1); d[k] = v
    return d
DBURL = env()['DATABASE_URL']

def log(m):
    s = "%s %s" % (datetime.datetime.now().strftime('%H:%M:%S'), m)
    print(s, flush=True)
    open(LOG, 'a').write(s + "\n")

def psql(sql, stdin=None):
    p = subprocess.run(['psql', DBURL, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], input=stdin, capture_output=True, text=True)
    if p.returncode: raise RuntimeError(p.stderr)
    return p.stdout

def download(uf):
    path = os.path.join(DATA, uf + '.zip')
    for t in range(6):
        r = subprocess.run(['curl', '-sS', '-fL', '-A', 'Mozilla/5.0', '--retry', '3', '--retry-delay', '5', '-o', path, URL % uf])
        if r.returncode == 0:
            try:
                zipfile.ZipFile(path).testzip(); return path
            except Exception as e:
                log("%s zip inválido (%s), retry" % (uf, e))
        else:
            log("%s download falhou rc=%s, retry %d" % (uf, r.returncode, t + 1))
        time.sleep(10)
    raise RuntimeError("download %s falhou" % uf)

def parse_dt(s):
    if not s or s.startswith('#'): return r'\N'
    try:
        d, t = s.split(' '); dd, mm, yy = d.split('/')
        return "%s-%s-%s %s" % (yy, mm, dd, t)
    except Exception: return r'\N'

def process(uf, path):
    z = zipfile.ZipFile(path)
    name = [n for n in z.namelist() if n.lower().endswith('.csv')][0]
    rd = csv.reader(io.TextIOWrapper(z.open(name), encoding='latin1', newline=''), delimiter=';', quotechar='"')
    h = next(rd); ix = {c: i for i, c in enumerate(h)}
    g = lambda n: ix[n]
    iC, iM, iZ, iS = g('CD_CARGO_PERGUNTA'), g('CD_MUNICIPIO'), g('NR_ZONA'), g('NR_SECAO')
    iD, iA, iP, iT, iV, iN, iSG, iQ = g('DT_BU_RECEBIDO'), g('QT_APTOS'), g('QT_COMPARECIMENTO'), g('CD_TIPO_VOTAVEL'), g('NR_VOTAVEL'), g('NM_VOTAVEL'), g('SG_PARTIDO'), g('QT_VOTOS')
    iU, iUR, iDC = g('DS_TIPO_URNA'), g('NR_URNA_EFETIVADA'), g('DS_CARGO_PERGUNTA')
    secs = {}; votos = {}; cands = {}
    st = collections.Counter(); cargo_names = {}
    for r in rd:
        c = r[iC]
        if c not in CARGOS: continue
        cargo_names[c] = r[iDC]
        k = (int(c), int(r[iM]), int(r[iZ]), int(r[iS]))
        urna = r[iUR]; tp = r[iU]
        s = secs.get(k)
        if s is None:
            s = secs[k] = {'dt': parse_dt(r[iD]), 'a': r[iA], 'p': r[iP], 'b': 0, 'n': 0, 'urna': urna, 'tp': tp}
            st['urna_' + tp] += 1
        elif s['urna'] != urna:
            st['dup_urna_ignorada'] += 1; continue   # outra urna para mesma seção: ignora (first wins)
        t = r[iT]; q = int(r[iQ])
        if t == '2': s['b'] += q
        elif t == '3': s['n'] += q
        elif t == '1':
            nr = int(r[iV])
            votos[k + (nr,)] = votos.get(k + (nr,), 0) + q
            cands[(int(c), nr)] = (r[iN], r[iSG])
    return secs, votos, cands, st, cargo_names

def load(uf, secs, votos, cands):
    tmp = lambda n: os.path.join(DATA, '%s_%s.tsv' % (uf, n))
    with open(tmp('sec'), 'w') as f:
        for (c, m, z, s), v in secs.items():
            f.write("2022\t1\t%d\t%s\t%d\t%d\t%d\t%s\t%s\t%s\t%d\t%d\n" % (c, uf, m, z, s, v['dt'], v['a'], v['p'], v['b'], v['n']))
    with open(tmp('vot'), 'w') as f:
        for (c, m, z, s, nr), q in votos.items():
            f.write("2022\t1\t%d\t%s\t%d\t%d\t%d\t%d\t%d\n" % (c, uf, m, z, s, nr, q))
    esc = lambda x: x.replace('\\', '\\\\').replace('\t', ' ')
    with open(tmp('can'), 'w') as f:
        for (c, nr), (n, p) in cands.items():
            f.write("2022\t1\t%d\t%s\t%d\t%s\t%s\n" % (c, uf, nr, esc(n), esc(p)))
    for t in ('secao_hist', 'voto_secao_hist', 'candidato_hist', 'resultado_mun_hist'):
        psql("delete from %s where ano=2022 and turno=1 and uf='%s'" % (t, uf))
    for t, n in (('secao_hist', 'sec'), ('voto_secao_hist', 'vot'), ('candidato_hist', 'can')):
        subprocess.run(['psql', DBURL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', "\\copy %s from '%s'" % (t, tmp(n))], check=True)
        os.remove(tmp(n))

AGG = """
insert into resultado_mun_hist (ano,turno,cargo,uf,cd_mun,nr_votavel,votos,aptos,comparec,brancos,nulos)
select v.ano,v.turno,v.cargo,v.uf,v.cd_mun,v.nr_votavel,v.votos,t.aptos,t.comparec,t.brancos,t.nulos from
 (select ano,turno,cargo,uf,cd_mun,nr_votavel,sum(qt_votos) votos from voto_secao_hist where ano=2022 and turno=1 and uf='%(uf)s' group by 1,2,3,4,5,6) v
 join (select ano,turno,cargo,uf,cd_mun,sum(aptos) aptos,sum(comparec) comparec,sum(brancos) brancos,sum(nulos) nulos from secao_hist where ano=2022 and turno=1 and uf='%(uf)s' group by 1,2,3,4,5) t
 using (ano,turno,cargo,uf,cd_mun)
"""

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--uf', nargs='*'); ap.add_argument('--keep-zip', action='store_true')
    a = ap.parse_args()
    ufs = [u.upper() for u in a.uf] if a.uf else UFS
    os.makedirs(DATA, exist_ok=True)
    T0 = time.time()
    for uf in ufs:
        t0 = time.time()
        try:
            log("%s: baixando" % uf)
            p = download(uf)
            log("%s: zip %.0f MB, processando" % (uf, os.path.getsize(p) / 1e6))
            secs, votos, cands, st, cn = process(uf, p)
            if not a.keep_zip: os.remove(p)
            log("%s: cargos=%s %s" % (uf, cn, dict(st)))
            nodt = sum(1 for v in secs.values() if v['dt'] == r'\N')
            load(uf, secs, votos, cands)
            psql(AGG % {'uf': uf})
            log("%s: OK secao_hist=%d voto=%d cand=%d sem_dt=%d em %.0fs" % (uf, len(secs), len(votos), len(cands), nodt, time.time() - t0))
        except Exception as e:
            log("%s: ERRO %s" % (uf, e))
    psql("analyze secao_hist; analyze voto_secao_hist; analyze candidato_hist; analyze resultado_mun_hist")
    log("FIM total %.0fs" % (time.time() - T0))

main()
