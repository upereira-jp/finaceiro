// A SAIDA DO RATEIO (SPEC-002 R27). Pura, sem banco e sem CRM.
// Uso: node --experimental-strip-types tests/saida-do-rateio.ts
//
// O modo de falha que esta suite persegue tem dois lados, e os dois custam
// dinheiro:
//
//   - NAO SOLTAR quem saiu: o espelho soma mais de 100% na usina e a trava R11
//     derruba o ciclo inteiro. Foi o estado de 16/09 a 22/09/2026;
//   - SOLTAR quem nao saiu: a UC sai do faturamento sem que o CRM tenha dito
//     nada. E o que uma view quebrada faria se nao houvesse freio.
//
// Cada freio tem o seu caso mudo ao lado do falante, com uma diferenca so.

import { decidirSaidas, tetoDeSaidas, type UcVinculada, type RateioLido } from '../src/dominio/saida-do-rateio.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const uc = (n: number, usina = '0001', pct = '1.8000'): UcVinculada => ({
  id: `uc-${n}`, numero_uc: `UC${String(n).padStart(3, '0')}`,
  crm_usina_cliente_id: `ct-${n}`, codigo_geradora: usina, percentual_rateio: pct,
});
const lidoDe = (ucs: UcVinculada[], extra: { contrato: string; uc: string; usina: string }[] = []): RateioLido => ({
  contratos: new Set([...ucs.map((u) => u.crm_usina_cliente_id), ...extra.map((e) => e.contrato)]),
  ucs: new Set([...ucs.map((u) => u.numero_uc), ...extra.map((e) => e.uc)]),
  usinas: new Set([...ucs.map((u) => u.codigo_geradora!), ...extra.map((e) => e.usina)]),
});

// A forma de 16/09/2026: 21 UCs na 0001, tres saem, duas novas entram.
const carteira = Array.from({ length: 21 }, (_, i) => uc(i + 1));
const ficaram = carteira.slice(3);
const novas = [{ contrato: 'ct-novo-1', uc: 'UCN01', usina: '0001' },
               { contrato: 'ct-novo-2', uc: 'UCN02', usina: '0001' }];

// ---- S1: o caso real. As tres saem, nenhuma fica retida.
{
  const d = decidirSaidas(carteira, lidoDe(ficaram, novas));
  chk('S1', d.soltar.map((u) => u.numero_uc).join(',') === 'UC001,UC002,UC003' && d.retidas.length === 0,
      `16/09: as tres UCs que sumiram do CRM sao soltas (${d.soltar.length} soltas, ${d.retidas.length} retidas)`);
}

// ---- S2: o caminho limpo. Leitura igual ao espelho, nada sai.
{
  const d = decidirSaidas(carteira, lidoDe(carteira));
  chk('S2', d.soltar.length === 0 && d.retidas.length === 0,
      'caminho limpo: tudo que esta no espelho esta no CRM, zero saidas e zero sinais');
}

// ---- S3/S3b: o numero da UC continua no CRM sob OUTRO contrato. E recadastro,
// e quem cuida e o espelho normal - soltar aqui brigaria com ele.
{
  const recadastro = [{ contrato: 'ct-recadastrado', uc: 'UC001', usina: '0001' }];
  const d = decidirSaidas(carteira, lidoDe(carteira.slice(1), recadastro));
  chk('S3', d.soltar.length === 0 && d.retidas.length === 0,
      'contrato novo para a MESMA UC nao e saida: o numero continua no CRM');
  const d2 = decidirSaidas(carteira, lidoDe(carteira.slice(1)));
  chk('S3b', d2.soltar.length === 1 && d2.soltar[0].numero_uc === 'UC001',
      'caso mudo do S3: sem o recadastro, a mesma UC sai');
}

// ---- S4/S4b: freio 1. A usina nao tem nenhuma linha na leitura.
{
  const outra = uc(50, '0002');
  const d = decidirSaidas([...carteira, outra], lidoDe(carteira));
  chk('S4', d.soltar.length === 0 && d.retidas.length === 1 && /nao tem nenhuma linha/.test(d.retidas[0].motivo),
      'usina que a leitura nao menciona: a UC fica vinculada e vira sinal com o motivo');
  const vizinha = uc(51, '0002');
  const d2 = decidirSaidas([...carteira, outra, vizinha], lidoDe([...carteira, vizinha]));
  chk('S4b', d2.soltar.length === 1 && d2.soltar[0].numero_uc === 'UC050' && d2.retidas.length === 0,
      'caso mudo do S4: com outra UC da mesma usina na leitura, a ausencia vale e a UC sai');
}

// ---- S5/S5b: freio 2. Saida em massa nao solta nada.
{
  const teto = tetoDeSaidas(carteira.length);           // max(3, ceil(21 * 0,25)) = 6
  chk('S5a', teto === 6, `o teto para 21 vinculadas e 6 (veio ${teto})`);
  const d = decidirSaidas(carteira, lidoDe(carteira.slice(7)));          // 7 somem
  chk('S5', d.soltar.length === 0 && d.retidas.length === 7 && d.retidas.every((r) => /view quebrada/.test(r.motivo)),
      `7 de 21 somem de uma vez: nenhuma e solta, as 7 viram sinal (${d.soltar.length}/${d.retidas.length})`);
  const d2 = decidirSaidas(carteira, lidoDe(carteira.slice(6)));         // 6 somem
  chk('S5b', d2.soltar.length === 6 && d2.retidas.length === 0,
      'caso mudo do S5: 6 saidas, exatamente no teto, passam');
}

// ---- S6: carteira pequena. O minimo de 3 vale mesmo quando 25% daria menos.
{
  const pequena = [uc(1), uc(2), uc(3), uc(4)];
  const d = decidirSaidas(pequena, lidoDe([pequena[3]]));
  chk('S6', tetoDeSaidas(4) === 3 && d.soltar.length === 3,
      `4 vinculadas, 3 saem: o piso de ${tetoDeSaidas(4)} deixa passar (a forma do caso real numa usina pequena)`);
}

// ---- S7: leitura vazia nao decide nada - zero linhas e ambiguo (SPEC-002 §7).
{
  const d = decidirSaidas(carteira, { contratos: new Set(), ucs: new Set(), usinas: new Set() });
  chk('S7', d.soltar.length === 0 && d.retidas.length === 0,
      'leitura vazia: nada solto e nada acusado, mesmo com 21 vinculadas');
}

// ---- S8: a decisao nao inventa percentual nem usina - devolve as UCs como vieram.
{
  const d = decidirSaidas(carteira, lidoDe(ficaram));
  chk('S8', d.soltar[0] === carteira[0],
      'a decisao devolve a propria UC do espelho, sem campo novo: quem escreve e o motor');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
