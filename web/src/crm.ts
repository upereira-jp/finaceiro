// O OUTRO SISTEMA — o endereco dele, e como montar um link que cai no lugar certo.
//
// ============================================================================
// POR QUE ISTO NAO MORA NA `ajuda.ts`
//
// Mesma razao do `porques.ts`, e o mesmo custo se fosse ignorada: a `ajuda.ts`
// carrega 45 assuntos, o glossario e a busca inteira, e ela e um pedaco pedido
// sob demanda - so quando alguem abre o painel. A tela de Usinas precisa de UMA
// constante e UMA funcao para desenhar um link por linha; importar a ajuda para
// isso poria o painel inteiro no carregamento de uma tela de cadastro.
//
// ============================================================================
// QUATRO DADOS NAO SE DIGITAM AQUI, e essa e a razao de existir um link
//
// Cliente, usina, unidade consumidora e geracao mensal sao ESPELHADOS do outro
// sistema. Este aqui nao escreve la, de proposito: dois donos para o mesmo
// numero e o proximo ciclo passando por cima em silencio. A consequencia e que
// dizer "nao ha tela" esta certo e e um beco - quem le fica sabendo que nao
// resolve ali e continua sem saber onde resolve.

/** A raiz. Sem barra no fim: quem monta o caminho poe a dele. */
export const CRM = 'https://app.blackhaus.io';

/**
 * A FICHA DA USINA no outro sistema, que e onde mora a grade de geracao mensal.
 *
 * DEVOLVE NULL QUANDO NAO HA ID, e isso e o ponto desta funcao existir em vez de
 * um template literal solto na tela. `${CRM}/usinas/${id}` com `id` nulo monta
 * `/usinas/null` - um link que existe, parece igual aos outros, abre o outro
 * sistema e cai numa ficha que nao existe. A usina espelhada tem id; a cadastrada
 * a mao daqui nao tem, e para essa o certo e nao desenhar link nenhum.
 */
export const usinaNoCrm = (crmUsinaId: string | null | undefined): string | null =>
  crmUsinaId ? `${CRM}/usinas/${crmUsinaId}` : null;
