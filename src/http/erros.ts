// Traducao de erro de dominio para resposta HTTP.
//
// A regra que este arquivo existe para cumprir: o modo de falha tem que contar o
// que aconteceu. E a mesma queixa que o projeto faz das policies sem policy -
// "resultado vazio, nao erro de permissao" - e ela vale igual aqui. Violacao de
// constraint chegando na API como 500 nao diz nada a quem chamou.
//
// E o inverso tambem: erro que NAO foi previsto nao vaza mensagem interna. 500
// sai generico, com o detalhe indo para o log do servidor e nao para o cliente.

export type RespostaDeErro = {
  status: number;
  corpo: { erro: string; mensagem: string; [k: string]: unknown };
};

/**
 * ERRO NOSSO, COM STATUS DELIBERADO.
 *
 * ============================================================================
 * DUAS CORRECOES MEDIDAS EM 14/08, E AS DUAS ERAM SILENCIOSAS
 *
 * 1. A FAIXA IA ATE 499, e todo erro nosso de 502/503 caia no 500 generico.
 *    Medido rodando `traduzir()` contra as classes reais:
 *
 *      SemChaveDaAnthropic(503)      -> 500 {"erro":"ErroInterno"}
 *      RespostaInesperadaDoModelo(502) -> 500 {"erro":"ErroInterno"}
 *
 *    A `Q-LEITOR-01` e o cabecalho das rotas de leitura AFIRMAM que a ausencia
 *    da chave responde 503 "com a mensagem certa". Nao respondia. Quem opera
 *    via "Erro interno." e nao tinha como saber que faltava configurar a chave.
 *
 *    A condicao que separa erro deliberado de erro inesperado nao e a FAIXA do
 *    status - e o status ter sido escrito por nos. Entao a faixa vai a 600.
 *
 * 2. E ISSO SOZINHO ABRIA UM BURACO PIOR, porque nem todo objeto com `status`
 *    numerico e nosso. O `APIError` do SDK da Anthropic tem `status` numerico e
 *    `message` com o CORPO DA API dentro, e as subclasses dele nao definem
 *    `name` - entao `e.name` e `'Error'`. Medido:
 *
 *      Anthropic 401 -> HTTP 401 {"erro":"Error","mensagem":"401 {...}"}
 *
 *    Um 401 da Anthropic chegando como 401 nosso **desloga quem opera**: o
 *    `api.ts` da SPA trata 401 como sessao morta e manda para o login, e a fatura
 *    em edicao morre junto. Alem de vazar a resposta da API inteira.
 *
 *    O PORTAO NAO PODE SER O `name`, e isto foi MEDIDO ao tentar. A primeira
 *    versao deste conserto exigia `name !== 'Error'` - o raciocinio era que erro
 *    nosso e classe com nome proprio. Mas 23 sitios deste projeto lancam
 *    `Object.assign(new Error('X nao encontrado.'), { status: 404 })`, que e
 *    forma legitima e deliberada para o 404 de "linha nao existe": criar uma
 *    classe por entidade seria vinte e tres classes que so carregam um numero.
 *    Com o portao no nome, os vinte e tres viravam **500**, e a suite acusou na
 *    hora (`H26`: `GET /api/clientes` sem credencial passou de 401 para 500).
 *
 *    ENTAO O PORTAO E OUTRO, E ELE FICA NA FRONTEIRA. Quem embrulha o erro de
 *    terceiro e `src/concessionaria/leitor-visao.ts`, que traduz todo `APIError`
 *    da Anthropic em erro NOSSO antes de deixa-lo subir - com status escolhido
 *    por nos e sem o corpo da resposta dela. E o lugar certo: quem conhece a
 *    biblioteca e quem a chama, e nao o tradutor de HTTP.
 *
 *    O que este arquivo garante e o outro lado: erro sem `status` nenhum sai
 *    500 generico, com o detalhe no log e nunca na resposta.
 */
function temStatusDeNegocio(e: any): e is { status: number; name: string; message: string } {
  return typeof e?.status === 'number' && e.status >= 400 && e.status < 600;
}

export function traduzir(e: any): RespostaDeErro {
  // 1. Erro de negocio, com status e mensagem deliberados.
  if (temStatusDeNegocio(e)) {
    const corpo: RespostaDeErro['corpo'] = { erro: e.name ?? 'ErroDeNegocio', mensagem: e.message };
    // EscolhaDeTenantNecessaria carrega a lista - sem ela o cliente nao tem como
    // responder o 409.
    if (Array.isArray((e as any).tenants)) corpo.tenants = (e as any).tenants;
    return { status: e.status, corpo };
  }

  // 2. Validacao de entrada. Os repositorios lancam TypeError para float em
  //    centavos, decimal como number e competencia fora do dia 1.
  if (e instanceof TypeError) {
    return { status: 422, corpo: { erro: 'EntradaInvalida', mensagem: e.message } };
  }

  // 3. Erros do Prisma que TEM leitura de negocio. O resto cai no 500.
  switch (e?.code) {
    case 'P2002':
      return { status: 409, corpo: { erro: 'ConflitoDeUnicidade', mensagem: 'Ja existe registro com esses dados.' } };
    case 'P2003':
      return { status: 422, corpo: { erro: 'ReferenciaInvalida',
        mensagem: 'Referencia inexistente ou de outro tenant. Nenhuma FK atravessa tenant (CLAUDE.md 2).' } };
    case 'P2025':
      return { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Registro nao encontrado.' } };
  }

  // 4. Contexto ausente e BUG do servidor, nao erro do cliente: significa que
  //    um handler chamou repositorio fora de withTenant. 500, e alto no log.
  if (e?.name === 'SemContextoDeTenant') {
    return { status: 500, corpo: { erro: 'ErroInterno', mensagem: 'Erro interno.' } };
  }

  /*
   * 5. CAMINHO DE URL COM ESCAPE MALFORMADO. `casar()` do servidor chama
   *    `decodeURIComponent` em todo segmento de parametro, e `%E0%A4%A` levanta
   *    `URIError` ANTES de qualquer rota existir. Medido: `GET /api/clientes/%E0%A4%A`
   *    virava 500 "Erro interno." e entrava no log de erro INESPERADO - varredura
   *    de robo enchendo o log de alarme falso.
   *
   *    400 e a mesma decisao que `lerCorpo` ja toma para JSON malformado.
   */
  if (e instanceof URIError) {
    return { status: 400, corpo: { erro: 'CaminhoInvalido',
      mensagem: 'O caminho tem escape percentual malformado e nao pode ser lido.' } };
  }

  return { status: 500, corpo: { erro: 'ErroInterno', mensagem: 'Erro interno.' } };
}

/** O que vai para o log do servidor. Detalhe fica aqui, nunca na resposta. */
export function ehInesperado(e: any): boolean {
  return !temStatusDeNegocio(e) && !(e instanceof TypeError) && !(e instanceof URIError) &&
         !['P2002', 'P2003', 'P2025'].includes(e?.code);
}
