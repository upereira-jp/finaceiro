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

/** Erros de negocio carregam `status` proprio e mensagem escrita para ser lida. */
function temStatusDeNegocio(e: any): e is { status: number; name: string; message: string } {
  return typeof e?.status === 'number' && e.status >= 400 && e.status < 500;
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

  return { status: 500, corpo: { erro: 'ErroInterno', mensagem: 'Erro interno.' } };
}

/** O que vai para o log do servidor. Detalhe fica aqui, nunca na resposta. */
export function ehInesperado(e: any): boolean {
  return !temStatusDeNegocio(e) && !(e instanceof TypeError) &&
         !['P2002', 'P2003', 'P2025'].includes(e?.code);
}
