// CONFERE se a configuracao de origem do webhook ACEITARIA uma notificacao da
// Sicoob. NAO TOCA NO BANCO, nao abre rede, e nao imprime segredo nenhum -
// `WEBHOOK_*` nao sao segredos, e o `.env.example` explica por que.
//
// ============================================================================
// POR QUE ELE EXISTE, e o motivo e o mesmo dos dois modos de falha da ADR-0006
//
// A rota do webhook recusa com o **404 generico**, identico ao de rota
// inexistente. Isso e deliberado (Decisao 4: um 401 confirmaria o endpoint a
// quem esta tentando), e tem um preco: **configuracao errada e indistinguivel
// de "a Sicoob nao chamou"**. Ninguem descobre pelo log do lado deles, e o
// nosso so diz "recusado".
//
// Ja aconteceu duas vezes no desenho, com causas diferentes:
//   §9.1 da ADR - exigir mTLS que a outra ponta nao apresenta: 100% recusado;
//   SIC6 dos testes - lista certa e `X-Real-IP` nao confiado: 100% recusado.
//
// Entao a conferencia nao pergunta "a configuracao esta preenchida". Ela
// SIMULA a notificacao real, na topologia real, e diz PASSA ou RECUSA.
//
// USO
//   # conferir a linha ANTES de colar em /etc/financeiro.env (nao le ambiente):
//   npm run origem-webhook -- --ips "$(...)"
//
//   # conferir o que a PRODUCAO tem hoje (herda /etc/financeiro.env):
//   systemd-run --wait --pipe --collect --quiet \
//     --property=EnvironmentFile=/etc/financeiro.env \
//     --working-directory=/opt/financeiro/app \
//     /opt/financeiro/node/bin/node --experimental-strip-types scripts/origem-do-webhook.ts
//
// SAI 0 se aceitaria as notificacoes da Sicoob, 1 se recusaria. O codigo de
// saida e o contrato: da para prende-lo num alarme sem ler a saida.

import { verificarOrigem, lerConfig, type Evidencia } from '../src/http/origem-do-webhook.ts';
import { IPS_DO_SICOOB, BLOCOS_DECLARADOS, linhaDeAmbiente } from '../src/http/ips-do-sicoob.ts';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const ipsDoArgumento = arg('ips');

/* `--ips` substitui SO a lista; o resto continua vindo do ambiente. E o modo de
 * conferir a linha antes de existir arquivo nenhum. */
const cfg = ipsDoArgumento !== undefined
  ? { ...lerConfig(), ips: lerConfig({ WEBHOOK_IPS: ipsDoArgumento }).ips }
  : lerConfig();

const fonte = ipsDoArgumento !== undefined ? '--ips (argumento)' : 'WEBHOOK_IPS (ambiente)';

/* A EVIDENCIA DA PRODUCAO. O `financeiro.service` escuta em 127.0.0.1:3000 e
 * quem fala com a internet e o nginx: toda notificacao chega da loopback, com o
 * IP verdadeiro no `X-Real-IP` que o vhost repassa. Simular com o IP no socket
 * daria um "passa" que a producao nao reproduz. */
const comoEmProducao = (ipReal: string): Evidencia => ({
  ip: '127.0.0.1', daLoopback: true, tlsAutorizado: false, tlsSujeito: undefined,
  cabecalhoVerificado: undefined, cabecalhoSujeito: undefined, cabecalhoIp: ipReal,
});

const p = (s = '') => console.log(s);
p();
p('  ORIGEM DO WEBHOOK - a configuracao aceitaria a Sicoob?');
p('  ' + '-'.repeat(72));
p(`  lista .................. ${cfg.ips.length} entrada(s), de ${fonte}`);
p(`  WEBHOOK_MTLS_VIA_PROXY . ${cfg.viaProxy ? '1 (o X-Real-IP do nginx e conferido)' : 'AUSENTE'}`);
p(`  WEBHOOK_MTLS_SUJEITO ... ${cfg.sujeitoEsperado ? `"${cfg.sujeitoEsperado}" (EXIGE certificado)` : 'ausente (correto: a Sicoob nao apresenta certificado)'}`);
p();

let recusas = 0;
/* Um motivo por RECUSA daria nove linhas identicas no caso mais comum, que e a
 * lista vazia. Cada motivo distinto sai uma vez. */
const motivosVistos = new Set<string>();
p('  Uma notificacao vinda de cada bloco que o Sicoob declarou em 09/09/2026:');
p();
for (const b of BLOCOS_DECLARADOS) {
  const r = verificarOrigem(comoEmProducao(b.primeiro), cfg);
  if (!r.verificada) recusas++;
  p(`    ${b.cidr.padEnd(19)} ${b.primeiro.padEnd(16)} ${r.verificada ? 'PASSA' : 'RECUSA'}`);
  if (!r.verificada && !motivosVistos.has(r.motivo)) {
    motivosVistos.add(r.motivo);
    p(`      motivo: ${r.motivo}`);
  }
}

/* O CONTROLE NEGATIVO NAO E ENFEITE: uma lista com `0.0.0.0/0` - ou com um
 * `/0` digitado por engano no lugar de `/20` - faria os 9 acima passarem. */
const forasteiros = ['203.0.113.9', '177.53.248.255', '127.0.0.1', '8.8.8.8'];
const aceitosIndevidamente = forasteiros.filter((ip) => verificarOrigem(comoEmProducao(ip), cfg).verificada);
p();
p(`  Controle negativo (estes tem de RECUSAR): ${aceitosIndevidamente.length === 0
      ? 'os 4 recusados, ok'
      : `⚠️ ACEITOU ${aceitosIndevidamente.join(', ')} - a lista esta larga demais`}`);

const listaDivergeDoBanco = JSON.stringify(cfg.ips) !== JSON.stringify([...IPS_DO_SICOOB]);
p();
if (listaDivergeDoBanco && cfg.ips.length > 0) {
  p('  ⚠️ A lista configurada NAO e, exatamente, a que o Sicoob enviou.');
  p('     Isso pode ser intencional (um IP a mais para teste), mas quem ler depois');
  p('     nao tem como saber. A que os testes conferem e a de `ips-do-sicoob.ts`.');
  p();
}

const ok = recusas === 0 && aceitosIndevidamente.length === 0;
p('  ' + '='.repeat(72));
if (ok) {
  p('  VEREDITO: ACEITA as notificacoes da Sicoob e recusa o resto.');
} else {
  p(`  VEREDITO: RECUSARIA ${recusas} dos ${BLOCOS_DECLARADOS.length} blocos.`);
  p();
  if (cfg.ips.length === 0) {
    p('  A lista esta vazia. Preencher em /etc/financeiro.env:');
    p();
    p(`      ${linhaDeAmbiente()}`);
    p();
  }
  if (!cfg.viaProxy) {
    p('  ⚠️ E FALTA A LINHA QUE QUASE NINGUEM LEMBRA. O app esta atras do nginx:');
    p('     o IP do socket e sempre 127.0.0.1 e o verdadeiro vem no X-Real-IP, que');
    p('     so e conferido com esta linha. Sem ela a lista acima nao e nem olhada:');
    p();
    p('      WEBHOOK_MTLS_VIA_PROXY="1"');
    p();
    p('     (o nome diz MTLS por historia - o mTLS caiu na §9 da ADR-0006 e hoje o');
    p('      que ela governa e o IP repassado)');
    p();
  }
  if (cfg.sujeitoEsperado) {
    p('  ⚠️ WEBHOOK_MTLS_SUJEITO esta configurado e EXIGE certificado de cliente.');
    p('     A Sicoob nao apresenta um no envio ("apenas no cadastro" - 08/09/2026),');
    p('     entao esta variavel recusa 100% das notificacoes. Remover.');
    p();
  }
}
p();
process.exit(ok ? 0 : 1);
