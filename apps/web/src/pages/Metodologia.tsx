export default function Metodologia() {
  return (
    <article className="prose">
      <div className="page-h"><div><h1>Metodologia</h1></div></div>
      <div className="aviso-box" role="note"><strong>Projeção não oficial. Resultado oficial: TSE</strong></div>

      <h2>O que você está vendo</h2>
      <p>Os números destacados em cada candidato são uma <b>projeção do resultado final</b>, não a contagem parcial. A contagem parcial aparece ao lado, como “apurado”, e a diferença entre as duas é justamente o que o modelo tenta explicar.</p>

      <h2>Por que a contagem parcial engana</h2>
      <p>As urnas não chegam ao TSE em ordem aleatória. Seções pequenas e de zonas rurais costumam fechar antes; as grandes capitais, depois. Por isso o candidato que lidera com 30% apurados pode não ser o que lidera no fim. É o <b>viés de ordem de apuração</b>.</p>

      <h2>Como projetamos</h2>
      <ul>
        <li><b>Por município.</b> Cada município é projetado separadamente: o que já foi apurado ali é completado com o padrão das seções que faltam, que costuma diferir das que já chegaram.</li>
        <li><b>Correção de viés.</b> A projeção usa o histórico de eleições anteriores no mesmo município para estimar como o resultado das seções pendentes tende a se desviar do que foi apurado até agora.</li>
        <li><b>Soma.</b> Os municípios são somados com o peso do eleitorado de cada um, em cada UF e no país, e o resultado é expresso em percentual dos votos válidos.</li>
      </ul>

      <h2>Intervalo de 90%</h2>
      <p>A faixa hachurada em cada barra e o sombreado do gráfico mostram o <b>intervalo de 90%</b>: rodamos milhares de simulações (Monte Carlo) sorteando o resultado das seções pendentes dentro da incerteza estimada. Em 90% das simulações o resultado final cai dentro da faixa. Ela estreita à medida que a apuração avança.</p>
      <p>As mesmas simulações dão as probabilidades de vitória no 1º turno, de ida ao 2º turno, de cada confronto e, para o Senado, de estar entre os dois mais votados.</p>

      <h2>Quão bem funciona? (teste com 2022)</h2>
      <p>Reproduzimos a chegada real das urnas de 2022 e comparamos a projeção com o resultado final. Para <b>Presidente</b>, com 3% a 97% do eleitorado apurado, o erro médio foi de <b>0,36 ponto percentual</b> e o intervalo de 90% conteve o resultado final em <b>97%</b> das vezes. Para <b>Governador</b> (27 estados), com 50% apurado o erro médio foi de 0,40 p.p., com o líder e o 2º turno corretos em 100% dos casos. Com apenas 5% apurado o erro costuma ficar entre 1 e 2 p.p. Em 2026 há candidatos novos e o Senado tem 2 votos por eleitor, então o desempenho pode diferir.</p>
      <h2>Como ler o mapa</h2>
      <p>Cada região é pintada com a cor do candidato à frente na projeção. Quanto mais forte a cor, maior a margem sobre o segundo colocado. Ao passar o mouse, o painel mostra os percentuais de cada candidato e quanto da região já foi apurado. O voto no exterior aparece em caixa separada porque não tem território.</p>

      <h2>Limitações</h2>
      <ul>
        <li>É uma estimativa. Um erro de modelo, uma mudança brusca de padrão ou dados incompletos do TSE podem fazer o resultado final sair da faixa.</li>
        <li>Com poucas seções apuradas, as faixas ficam largas e as probabilidades pouco informativas.</li>
        <li>As probabilidades não são previsões: 90% de chance de algo não significa certeza.</li>
        <li>Votos em branco e nulos não entram no percentual de votos válidos usado para decidir a vitória.</li>
        <li>O painel não substitui o resultado oficial, que só o TSE divulga e totaliza.</li>
      </ul>
      <h2>Autoria e código aberto</h2>
      <p>Este projeto foi idealizado e dirigido por <b>Willian Gigliotti</b>, que definiu o problema, as regras de negócio (Presidente, Governador e Senador, o mapeamento dos candidatos por campo político, o histórico de fotos a cada 5 minutos) e as decisões de produto e de risco ao longo da noite da eleição. A implementação foi feita com apoio de IA (Claude Code, da Anthropic), com testes de validação em dados reais de 2022. O código completo, o backtest e a documentação estão em <a href="https://github.com/wgigliotti/projTurno1-2026" target="_blank" rel="noopener noreferrer">github.com/wgigliotti/projTurno1-2026</a>. Não é um produto oficial nem tem vínculo com o TSE.</p>
    </article>
  );
}
