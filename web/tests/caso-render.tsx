// OS CASOS DO TESTE DE RENDERIZACAO. Roda por `web/tests/render.ts`, que
// compila este arquivo com esbuild — nao rode este direto.
//
// ============================================================================
// O QUE UM TESTE DE RENDERIZACAO PEGA QUE OS OUTROS NAO
//
// `web/tests/ajuda.ts` prova que a BUSCA acha e que o vocabulario nao tem
// jargao. Nada ali toca em React, e por isso nada ali percebe:
//
//   1. QUE O COMPONENTE NAO MONTA. Nome de icone que nao existe na uniao,
//      `passo.destino` usado sem guarda, `.map` sobre `undefined` — tudo isso
//      passa no `tsc` de tipos frouxos e explode na primeira abertura. Este
//      arquivo monta o painel de verdade: se ele lancar, o teste falha;
//   2. QUE O TEXTO NAO CHEGA NA TELA. A frase pode estar certa em `ajuda.ts` e
//      nao ser desenhada — um `&&` mal colocado esconde a secao inteira sem
//      erro nenhum;
//   3. QUE O ESTADO VAZIO E UM BECO. A pessoa que busca "jabuticaba" TEM de
//      receber alguma coisa, e a unica forma de provar isso e olhar o HTML;
//   4. QUE O BOTAO NAO LEVA A LUGAR NENHUM. Um `<button>` sem destino, ou uma
//      camada sem tela desenhando "Resolver", manda alguem clicar no vazio.
//
// COMO ELE RODA SEM NAVEGADOR: `renderToStaticMarkup` devolve o HTML do
// primeiro render. Efeito nao roda — e nao precisa: `ajuda-corpo.tsx` foi
// separado justamente para receber TUDO por propriedade, entao qualquer estado
// (carregando, falhou, vazio, cheio, buscando) e montavel sem rede e sem tempo.

import { renderToStaticMarkup } from 'react-dom/server';
import { CorpoDaAjuda } from '../src/ajuda-corpo.tsx';
import { passosDoEstado, type CamadaLida } from '../src/ajuda.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

/** Monta o painel e devolve o HTML. Se o componente lancar, o teste morre aqui —
 *  que e o resultado certo: painel que nao monta e painel que nao existe. */
const desenhar = (p: Partial<CorpoDaAjuda> = {}): string =>
  renderToStaticMarkup(
    <CorpoDaAjuda
      rota={p.rota ?? '/clientes'}
      passos={p.passos ?? []}
      carregando={p.carregando ?? false}
      falhou={p.falhou ?? false}
      aoFechar={() => {}}
      ir={() => {}}
      consultaInicial={p.consultaInicial}
    />,
  );

/** Texto visivel: sem marcacao e sem entidade, do jeito que a pessoa le. Sem
 *  isto, procurar "11 de 29" falharia por causa de um `<span>` no meio. */
const texto = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * O TEXTO DE UMA SECAO SO, achada pelo titulo.
 *
 * Existe porque procurar no HTML inteiro nao distingue "o assunto aparece no
 * CONTEXTO desta tela" de "o assunto aparece nas perguntas comuns, como em toda
 * tela" — e a primeira versao do R7c caiu exatamente nisso, acusando um defeito
 * que nao havia.
 */
const secao = (html: string, titulo: string): string => {
  const partes = html.split('<section class="ajuda-secao">');
  const alvo = partes.find((x) => texto(x).startsWith(titulo));
  return alvo === undefined ? '' : texto(alvo);
};

const camada = (p: Partial<CamadaLida>): CamadaLida =>
  ({ camada: 'vencimento', situacao: 'pendente', faltam: 3, total: 29, efeito: 'bloqueia_fatura', ...p });

// ================================================== R1 o painel monta, e e um dialogo
{
  const html = desenhar();
  chk('R1', html.length > 500, `o painel monta e produz HTML (${html.length} caracteres)`);
  chk('R1b', html.includes('role="dialog"') && html.includes('aria-modal="true"'),
      'e monta como DIALOGO com `aria-modal` — quem usa leitor de tela precisa saber que o resto da '
      + 'pagina ficou atras');
  chk('R1c', html.includes('aria-label="Central de ajuda"'),
      'com nome acessivel proprio: "dialogo" sem nome nao diz qual');
  chk('R1d', html.includes('aria-label="Fechar a ajuda"'),
      'e o botao de fechar tem rotulo — um X sozinho e um icone sem nome');
  // No HTML e nao no texto: a dica e um `placeholder`, que e ATRIBUTO — o
  // extrator de texto o descarta junto com a tag, e a primeira versao deste
  // teste acusou um defeito que nao existia.
  chk('R1e', html.includes('type="search"') && html.includes('Descreva com suas palavras'),
      'a caixa de busca aparece, com a dica que ensina a perguntar em portugues comum');
  chk('R1f', html.includes('aria-label="Descreva com suas palavras'),
      'e a mesma dica e o nome acessivel do campo — sem isso, para o leitor de tela ele e "busca" e nada mais');
}

// ============================================ R2 o estado ao vivo vira TEXTO na tela
//
// O `ajuda.ts` prova que a frase e montada. Este bloco prova que ela e DESENHADA
// — sao coisas diferentes, e um `&&` mal colocado separa as duas.
{
  const passos = passosDoEstado([
    camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
    camada({ camada: 'dono_da_usina', faltam: 4, total: 4, efeito: 'bloqueia_split' }),
    camada({ camada: 'geracao_da_competencia', situacao: 'nao_medido', faltam: 0, total: 0 }),
  ]);
  const t = texto(desenhar({ passos }));

  chk('R2', t.includes('CPF ou CNPJ do cliente: 11 de 29 pendentes.'),
      'a frase com o numero real chega na tela, inteira');
  chk('R2b', t.includes('Como está o mês agora'),
      'sob o titulo que responde a pergunta mais provavel de quem abre a ajuda');
  chk('R2c', t.includes('Impede dividir o dinheiro'),
      'a etiqueta de efeito aparece na camada que NAO impede cobrar — e a informacao que evita '
      + 'alguem parar o faturamento inteiro por uma linha que nao o bloqueia');
  chk('R2d', (t.match(/Impede dividir o dinheiro/g) ?? []).length === 1,
      'e SO nessa: repetir a etiqueta em toda linha viraria ruido');
  chk('R2e', t.includes('ainda não dá para conferir') && !t.includes('0 de 0'),
      '"nao medido" chega como frase e nunca como "0 de 0" — pintar zero sobre nada de verde foi '
      + 'um defeito real, achado contra producao em 28/07');
  chk('R2f', !/pendentes\.\s*pendentes/.test(t), 'nenhuma frase sai duplicada');
}

// ================================================ R3 todo botao leva a algum lugar
{
  const passos = passosDoEstado([
    camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
    // Esta NAO tem tela (espelho do CRM, regra 4): nao pode desenhar "Resolver".
    camada({ camada: 'geracao_da_competencia', faltam: 2, total: 4 }),
  ]);
  const html = desenhar({ passos });
  const t = texto(html);

  chk('R3', (t.match(/Resolver/g) ?? []).length === 1,
      'so a camada COM tela ganha o botao "Resolver" — desenha-lo na que nao tem formulario mandaria '
      + 'alguem clicar no vazio');
  chk('R3b', t.includes('Esse número não se digita aqui'),
      'e a que nao tem tela explica por que, em vez de deixar a linha muda');
}

// ==================================== R4 a busca desenha o resultado certo
{
  const t = texto(desenhar({ consultaInicial: 'cadê o boleto' }));
  chk('R4', t.includes('Isto responde'),
      'resultado unico vem sob "Isto responde", e nao "Isto pode responder"');
  chk('R4b', t.includes('Como configuro a emissão de boleto?'),
      'e a pergunta certa e desenhada');
  chk('R4c', t.includes('Abra a aba Conector Sicoob'),
      'com os PASSOS abertos: resultado unico ja vem expandido, porque nao ha o que escolher');
  chk('R4d', !t.includes('Como está o mês agora'),
      'e o estado ao vivo some durante a busca — quem digitou uma pergunta quer a resposta dela');
}

{
  const t = texto(desenhar({ consultaInicial: 'conta de luz' }));
  chk('R4e', t.includes('O que a palavra quer dizer') && t.includes('Unidade consumidora'),
      '"conta de luz" desenha o VERBETE, que e a resposta certa');
  chk('R4f', !t.includes('Como configuro a emissão de boleto?'),
      'e nao desenha o topico do boleto: o casamento fraco pela palavra "conta" foi cortado em '
      + '21/08, depois de aparecer rodando contra producao');
}

// ============================================ R5 o vazio NUNCA e um beco
//
// A razao de existir da central: nao ha divisao de suporte. Uma tela dizendo
// "nada encontrado" e ponto e alguem parado ate alguem chegar.
{
  const t = texto(desenhar({ consultaInicial: 'jabuticaba quantica' }));
  chk('R5', t.includes('Não achei isso'), 'a busca sem resultado admite que nao achou');
  chk('R5b', t.includes('Talvez seja um destes') && t.includes('Por que não consigo cobrar este mês?'),
      'e oferece as perguntas do primeiro dia na mesma frase — a saida vem junto com a recusa');
}

// ======================================== R6 os quatro estados do mes
{
  chk('R6', texto(desenhar({ carregando: true })).includes('Conferindo'),
      'carregando: diz que esta conferindo');
  chk('R6b', texto(desenhar({ falhou: true })).includes('Não consegui conferir o mês agora'),
      'falhou: admite a falha E diz que o resto da ajuda continua valendo');
  chk('R6c', texto(desenhar({ falhou: true })).includes('Perguntas mais comuns'),
      'e prova isso desenhando os assuntos mesmo sem o mes — a ajuda nao depende da rede');
  chk('R6d', texto(desenhar({ passos: [] })).includes('Nada pendente'),
      'vazio: "nada pendente" e uma resposta, e nao uma tela em branco');
  chk('R6e', !texto(desenhar({ carregando: true })).includes('Nada pendente'),
      'e carregando NAO diz "nada pendente" — anunciar tudo certo antes de conferir e o defeito '
      + 'mais perigoso desta tela');
}

// ==================================== R7 o contexto muda com a tela aberta
{
  const clientes = secao(desenhar({ rota: '/clientes' }), 'Sobre esta tela');
  const usinas = secao(desenhar({ rota: '/usinas' }), 'Sobre esta tela');

  chk('R7', clientes !== '' && usinas !== '',
      'a secao de contexto aparece quando a tela tem assunto proprio');
  chk('R7b', clientes.includes('O cliente tem CPF na tela, mas o sistema diz que falta'),
      'em Clientes, o contexto e a duvida daquela tela');
  chk('R7c', usinas.includes('Como cadastro o dono de uma usina?')
          && !usinas.includes('O cliente tem CPF na tela'),
      'e em Usinas e OUTRO. Comparado dentro da secao, e nao no HTML inteiro: o topico do CPF esta '
      + 'entre as perguntas comuns e aparece em toda tela — procurar na pagina toda confundiria '
      + '"e o contexto daqui" com "esta na pagina"');
  chk('R7d', secao(desenhar({ rota: '/nao-existe' }), 'Sobre esta tela') === '',
      'tela sem assunto proprio nao desenha a secao vazia');
  chk('R7e', secao(desenhar({ rota: '/nao-existe' }), 'Perguntas mais comuns') !== '',
      'e mesmo la as perguntas comuns continuam — nenhuma tela fica sem saida');
}

// ============================ R8 o assunto vem FECHADO, para a lista ser varrivel
{
  const html = desenhar({ rota: '/usinas' });
  chk('R8', html.includes('aria-expanded="false"'),
      'os assuntos vem fechados: quem reconhece a propria pergunta abre uma, e nao le quatro');
  chk('R8b', desenhar({ consultaInicial: 'cadê o boleto' }).includes('aria-expanded="true"'),
      'mas o resultado UNICO de uma busca ja vem aberto — nao ha o que escolher');
  chk('R8c', (html.match(/aria-expanded/g) ?? []).length >= 3,
      'e cada assunto carrega o proprio estado, e nao um so para todos');
}

// ============================== R9 nenhum jargao chega na tela DESENHADA
//
// O bloco V4 de `ajuda.ts` guarda os TEXTOS. Este guarda o HTML MONTADO — sao
// coisas diferentes: um rotulo escrito direto no JSX (e nao vindo do
// vocabulario) escaparia daquele e cairia aqui.
{
  const html = desenhar({
    rota: '/unidades',
    passos: passosDoEstado([
      camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
      camada({ camada: 'tarifa_da_uc', situacao: 'nao_medido', faltam: 0, total: 0 }),
      camada({ camada: 'regra_de_comissao', faltam: 1, total: 1, efeito: 'bloqueia_split' }),
    ]),
  });
  const t = texto(html);

  const PROIBIDO: Array<[RegExp, string]> = [
    [/\bR\d{1,2}\b/, 'codigo de regra'],
    [/\bQ-[A-Z]/, 'codigo de questao'],
    [/npm run/, 'comando de terminal'],
    [/\bsplit\b/i, 'palavra proibida pela GLOSSARIO.md'],
    [/\bprontid[aã]o\b/i, 'nome interno do calculo'],
    [/\bcamadas?\b/i, 'nome da estrutura interna'],
    [/[a-z]+_[a-z]+/, 'nome de coluna'],
  ];
  for (const [regra, porque] of PROIBIDO) {
    const m = t.match(regra);
    chk('R9', m === null, `o HTML desenhado nao casa com ${regra} (${porque})${m ? ` — ACHADO: "${m[0]}"` : ''}`);
  }
}

export const resultado = () => ({ falhas, feitas });
