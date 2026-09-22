// O OUVINTE DO CRM E O TIMER, lidos do disco. ADR-0008. Sem banco.
// Uso: node --experimental-strip-types tests/escuta-crm.ts
//
// O ouvinte e o timer rodam o MESMO ciclo por caminhos diferentes, e o que os
// mantem coerentes sao quatro linhas de configuracao que ninguem ve rodar. Cada
// uma delas, se mudar, falha em silencio:
//
//   - KillMode=mixed: sem ela, parar o servico mata o ciclo no meio e o EXCLUDE
//     trava o conector (Q-CICLO-ORFAO-01) - um defeito que so aparece no deploy;
//   - SuccessExitStatus=75: sem ela, cada encontro dos dois disparadores deixa o
//     timer `failed`, e `failed` e o que se aprende a ignorar;
//   - o 75 do script: sem ele, o ouvinte trata "ocupado" como falha e espera um
//     minuto em vez de quinze segundos;
//   - os mesmos --auth-user e --tenant nas duas unidades: com argumentos
//     diferentes, o ouvinte sincronizaria OUTRO tenant do que o timer confere.

import { readFileSync } from 'node:fs';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const semContinuacao = (u: string) => u.replace(/\\\n\s*/g, ' ');
const valor = (u: string, chave: string) => new RegExp(`^${chave}=(.*)$`, 'm').exec(u)?.[1]?.trim();
const argumento = (u: string, nome: string) =>
  new RegExp(`--${nome}\\s+(\\S+)`).exec(valor(semContinuacao(u), 'ExecStart') ?? '')?.[1];

const escuta = ler('deploy/financeiro-escuta-crm.service');
const ciclo = ler('deploy/financeiro-ciclo.service');
const scriptCiclo = ler('scripts/ciclo-crm.ts');
const scriptEscuta = ler('scripts/escuta-crm.ts');

chk('EC1', valor(escuta, 'KillMode') === 'mixed',
    'o ouvinte usa KillMode=mixed: o SIGTERM nao alcanca o ciclo filho');
chk('EC2', Number(valor(escuta, 'TimeoutStopSec')) >= Number(valor(ciclo, 'TimeoutStartSec')),
    `o ouvinte espera o filho pelo menos o teto do ciclo (${valor(escuta, 'TimeoutStopSec')} >= ${valor(ciclo, 'TimeoutStartSec')})`);
chk('EC3', valor(escuta, 'Restart') === 'always',
    'o ouvinte volta sozinho se cair (Restart=always)');
chk('EC4', argumento(escuta, 'auth-user') === argumento(ciclo, 'auth-user')
         && argumento(escuta, 'tenant') === argumento(ciclo, 'tenant')
         && !!argumento(ciclo, 'tenant'),
    'as duas unidades rodam o ciclo com o MESMO --auth-user e o MESMO --tenant');
chk('EC5', /^SuccessExitStatus=.*\b75\b/m.test(ciclo),
    'o timer declara 75 (outro ciclo em andamento) como sucesso');
chk('EC6', /CicloJaEmAndamento[\s\S]{0,400}process\.exit\(75\)/.test(scriptCiclo),
    'o ciclo sai com 75 quando o EXCLUDE recusa o segundo disparo');
chk('EC7', /CODIGO_OCUPADO = 75/.test(scriptEscuta) && /'--valendo'/.test(scriptEscuta),
    'o ouvinte reconhece o 75 e roda o ciclo valendo, como o timer');
chk('EC8', /filhoAtual[\s\S]{0,200}once\('exit'/.test(scriptEscuta),
    'ao encerrar, o ouvinte espera o ciclo em andamento terminar');
chk('EC9', /OnCalendar=\*:0\/15/.test(ler('deploy/financeiro-ciclo.timer')),
    'o timer de 15 minutos continua - e a rede do aviso perdido (SPEC-002 §11)');

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
