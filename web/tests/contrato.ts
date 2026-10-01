// As condicoes de criacao de contrato. Puras, sem banco e sem DOM.
// Uso: node --experimental-strip-types web/tests/contrato.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. A Q-ORIGINADOR-01 foi decidida em
// 29/07/2026 na opcao (a): as 39 UCs da carteira LEVAM originador, e nenhuma
// comissao foi paga ainda. A consequencia e uma regra de tela, e regra de tela
// e o tipo de coisa que some numa refatoracao sem nada falhar - o `disabled`
// volta a ser `!uc` e a digitacao dos 39 grava nulo nos 39 outra vez.
//
// O CUSTO DE PERDER ESTA REGRA NAO E UM ERRO NA TELA, e por isso ela tem suite
// propria: `src/repos/split.ts` so monta o item de comissao quando ha
// `originador_id` E tier congelado. Sem eles a reparticao roda, fecha em zero e
// NAO levanta - o dinheiro simplesmente nao sai, sem erro e sem log. E nao ha
// desfazer: a R20-b congela o tier no `rascunhar`, e o conserto e
// `encerrar` + `renovar`, que zera o contador de faturas cheias e deixa na
// trilha uma renovacao que nao houve.

import {
  podeCriarContrato, motivoDaTrava, deQuem, nomeDoAto, ROTULO_DO_ATO, type EstadoDoFormulario,
} from '../src/contrato-regras.ts';
import {
  unidadesSemContratoAtivo, quemTrouxeOMesmoCliente, contratoSemQuemTrouxe,
  type UcDaLista, type ContratoDaLista,
} from '../src/o-que-falta.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};

/** O formulario preenchido por inteiro. Cada caso abaixo estraga UM campo. */
const completo: EstadoDoFormulario = {
  ucEscolhida: true, ucTemUsina: true, temOriginador: true, ocupado: false,
};

// ------------------------------------------------------------ C1 caminho bom
{
  chk('C1', podeCriarContrato(completo) === true && motivoDaTrava(completo) === null,
      'formulario completo libera o botao, e sem motivo de trava');
}

// ------------------------------------------- C2 o originador, nos DOIS sentidos
{
  // O sentido que importa: sem originador o botao TRAVA. Um teste que so
  // conferisse o caminho bom passaria com a regra removida.
  const semOrig = { ...completo, temOriginador: false };
  chk('C2', podeCriarContrato(semOrig) === false,
      'sem originador o botao TRAVA - Q-ORIGINADOR-01 (a): a carteira leva originador e o campo nao e editavel depois');
  chk('C2b', motivoDaTrava(semOrig) === 'sem_originador',
      'e a trava se NOMEIA, para a tela poder dizer por que em vez de so ficar cinza');
  chk('C2c', podeCriarContrato({ ...semOrig, temOriginador: true }) === true,
      'e escolher o originador destrava - a regra e sobre o campo, nao um `false` preso');
}

// ------------------------------------------------- C3 as outras tres condicoes
{
  chk('C3a', podeCriarContrato({ ...completo, ucEscolhida: false }) === false
          && motivoDaTrava({ ...completo, ucEscolhida: false }) === 'sem_uc',
      'sem UC escolhida trava, e o motivo e sem_uc');
  chk('C3b', podeCriarContrato({ ...completo, ucTemUsina: false }) === false
          && motivoDaTrava({ ...completo, ucTemUsina: false }) === 'uc_sem_usina',
      'UC sem usina trava: sem usina nao ha de onde vir o credito');
  chk('C3c', podeCriarContrato({ ...completo, ocupado: true }) === false
          && motivoDaTrava({ ...completo, ocupado: true }) === 'ocupado',
      'escrita em voo trava - o duplo clique criaria dois contratos e o segundo bateria na R14 com 409');
}

// ------------------------------------------------------------- C4 a ORDEM
{
  /*
   * A ordem existe porque a tela mostra UM motivo por vez. Com tudo vazio, a
   * pessoa precisa ouvir "escolha a UC" - e nao "escolha o originador", que ela
   * so consegue depois. E a mesma regra da triagem da prontidao: o que impede
   * de EXISTIR vem antes do que impede de calcular.
   */
  const vazio: EstadoDoFormulario = {
    ucEscolhida: false, ucTemUsina: false, temOriginador: false, ocupado: false,
  };
  chk('C4', motivoDaTrava(vazio) === 'sem_uc',
      'com tudo vazio o motivo e a UC, nao o originador - um motivo por vez, na ordem em que se resolve');
  chk('C4b', motivoDaTrava({ ...vazio, ocupado: true }) === 'ocupado',
      'e `ocupado` vence todos: durante a escrita o que importa e que ela esta em curso');
}

/* ==========================================================================
 * C5..C8 — O QUE FALTA EM CONTRATOS (01/10/2026, etapa 7a)
 * ==========================================================================
 *
 * A tela listava os contratos que EXISTEM; as unidades sem contrato nao
 * apareciam em lugar nenhum. A lista agora sai de `o-que-falta.ts`, e o que
 * estas verificacoes prendem e que ela casa com a camada `contrato_ativo` do
 * servidor — `uc_ativa` (faturavel) sem contrato `ativo` —, ou o «6 unidades»
 * do Mes e a lista desta tela discordariam.
 */
const uc = (id: string, p: Partial<UcDaLista> = {}): UcDaLista => ({
  id, numero_uc: `0${id.replace(/\D/g, '').padStart(9, '0')}`, cliente_id: `cli-${id}`, usina_id: 'usina-1',
  status: 'ativa', rateio_situacao: 'ativado', crm_usina_cliente_id: `crm-${id}`, ...p,
});
const k = (ucId: string, p: Partial<ContratoDaLista> = {}): ContratoDaLista => ({
  id: `k-${ucId}`, cliente_id: `cli-${ucId}`, unidade_consumidora_id: ucId, originador_id: 'orig-1', status: 'ativo', ...p,
});
const NOMES = {
  cliente: (id: string) => ({ 'cli-u1': 'Ana Lima', 'cli-u2': 'Bruno Dias', 'cli-u3': 'Carla Rocha' } as Record<string, string>)[id] ?? null,
  usina: (id: string | null) => (id === 'usina-1' ? 'Usina Sol do Cerrado' : null),
};

{
  const ucs = [
    uc('u1'),                                                        // ativo: fora
    uc('u2'),                                                        // sem contrato: DENTRO
    uc('u3'),                                                        // suspenso: DENTRO, com «Reativar»
    uc('u4', { rateio_situacao: 'aguardando_ativacao' }),            // não fatura: fora
    uc('u5', { status: 'cancelada' }),                               // cancelada: fora
    uc('u6', { crm_usina_cliente_id: null, rateio_situacao: null }), // local, sem contrato: DENTRO
    uc('u7', { usina_id: null }),                                    // sem usina e sem contrato: DENTRO
  ];
  const vigentes: Record<string, ContratoDaLista | null> = {
    u1: k('u1'), u2: null, u3: k('u3', { status: 'suspenso' }), u4: null, u5: null,
  };
  const l = unidadesSemContratoAtivo(ucs, vigentes, NOMES)!;
  const ids = l.map((x) => x.uc_id).sort().join();
  chk('C5', ids === 'u2,u3,u6,u7',
      `as unidades sem contrato ativo sao as FATURAVEIS sem contrato \`ativo\` — a livre, a de contrato `
      + `suspenso, a local e a sem usina; a ativa, a que aguarda ativacao e a cancelada ficam de fora (${ids})`);
  const u3 = l.find((x) => x.uc_id === 'u3')!;
  const u2 = l.find((x) => x.uc_id === 'u2')!;
  chk('C5b', u3.motivo === 'suspenso' && u3.contrato_id === 'k-u3' && u2.motivo === 'sem_contrato' && u2.contrato_id === null,
      'a suspensa vem marcada como tal, com o contrato que a ocupa (R14) — a tela oferece «Reativar», '
      + 'e nao «Criar», que daria 409');
  chk('C5c', u2.cliente === 'Bruno Dias' && u2.usina === 'Usina Sol do Cerrado'
          && l.find((x) => x.uc_id === 'u7')!.usina === null && l.find((x) => x.uc_id === 'u6')!.cliente === null,
      'cada uma traz o cliente e a usina pelo nome — e o que nao se sabe fica nulo, sem inventar');
  chk('C5d', l[0]!.cliente === 'Bruno Dias' && l[l.length - 1]!.cliente === null,
      'a ordem e a do cliente (quem procura, procura pelo nome), e quem nao tem nome vai para o fim');
  chk('C5e', unidadesSemContratoAtivo(ucs, null, NOMES) === null && unidadesSemContratoAtivo(null, vigentes, NOMES) === null,
      'sem o mapa de contratos (ou sem as unidades) a lista e DESCONHECIDA, e nao vazia — senao toda '
      + 'unidade pareceria sem contrato enquanto a leitura nao chega');
}

{
  const vigentes: Record<string, ContratoDaLista | null> = {
    a: k('a', { cliente_id: 'c1', originador_id: 'carlos' }),
    b: null,
    c: k('c', { cliente_id: 'c2', originador_id: 'carlos' }),
    d: k('d', { cliente_id: 'c2', originador_id: 'juliana' }),
    e: k('e', { cliente_id: 'c3', originador_id: null }),
  };
  const s1 = quemTrouxeOMesmoCliente('c1', 'b', vigentes);
  chk('C6', s1?.originador_id === 'carlos' && s1.uc_id === 'a',
      'a sugestao de quem trouxe vem do OUTRO contrato do mesmo cliente, com a unidade dele');
  chk('C6b', quemTrouxeOMesmoCliente('c2', 'b', vigentes) === null
          && quemTrouxeOMesmoCliente('c3', 'b', vigentes) === null
          && quemTrouxeOMesmoCliente('c9', 'b', vigentes) === null,
      'duas pessoas diferentes nos outros contratos, nenhuma registrada, ou cliente sem outro contrato: '
      + 'nenhuma sugestao — escolher entre elas seria adivinhar');
  chk('C6c', quemTrouxeOMesmoCliente('c1', 'a', vigentes) === null,
      'o proprio contrato da unidade nao se sugere a si mesmo');
}

{
  const fat = uc('f');
  const naoFat = uc('n', { rateio_situacao: 'aguardando_ativacao' });
  chk('C7', contratoSemQuemTrouxe(k('f', { originador_id: null }), fat)
          && !contratoSemQuemTrouxe(k('f'), fat)
          && !contratoSemQuemTrouxe(k('f', { originador_id: null, status: 'suspenso' }), fat)
          && !contratoSemQuemTrouxe(k('n', { originador_id: null }), naoFat)
          && !contratoSemQuemTrouxe(k('x', { originador_id: null }), undefined),
      'o recorte «sem quem trouxe» e o da camada `originador_do_contrato`: contrato ATIVO, em unidade '
      + 'FATURAVEL, sem originador — o suspenso e o de unidade que nao fatura nao contam, como no servidor');
}

{
  /* OS NOMES DOS ATOS — a persona Sam ouvia 37 «Suspender» iguais. */
  const linhas = [['0254872026', 'Ana Lima'], ['0386467556', 'Ana Lima'], ['0387289454', 'Bruno Dias'], ['0648858192', null]] as const;
  const nomes = linhas.flatMap(([u, c]) => (['menu', 'suspender', 'encerrar', 'reativar', 'criar'] as const).map((a) => nomeDoAto(a, u, c)));
  chk('C8', new Set(nomes).size === nomes.length,
      'cada ato de cada linha tem um nome acessivel UNICO — o mesmo cliente com duas unidades tambem se distingue');
  chk('C8b', nomeDoAto('encerrar', '0254872026', 'Ana Lima') === 'Encerrar o contrato da unidade 0254872026, de Ana Lima'
          && nomeDoAto('suspender', '0648858192', null) === 'Suspender o contrato da unidade 0648858192'
          && deQuem('0648858192', '  ') === 'unidade 0648858192',
      'o nome diz a unidade E o cliente — e, sem cliente, so a unidade, nunca «de null»');
  chk('C8c', (Object.keys(ROTULO_DO_ATO) as Array<keyof typeof ROTULO_DO_ATO>)
        .every((a) => nomeDoAto(a, '1', 'X').startsWith(ROTULO_DO_ATO[a])),
      'todo nome acessivel COMECA pelo texto visivel do botao — quem fala com o computador diz o que le (WCAG 2.5.3)');
}

console.log();
if (falhas > 0) { console.log(`--- contrato: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- contrato (regras da tela e o que falta em Contratos): 21 verificacoes, 0 falhas');
