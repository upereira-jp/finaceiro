// O PAINEL ÚNICO DE SAÚDE — puro, sem JSX, com suíte própria (`web/tests/painel-de-saude.ts`).
//
// `PLANO-global-por-etapas-2026-09-22.md` §5, «Observabilidade do dinheiro»: *"um
// painel único de saúde (ciclo, fila, webhook, A1, backup, caixa) na primeira tela
// de cada funil"*. Até 03/10/2026 a resposta estava espalhada em três lugares: a
// faixa do alto do Mês (só o certificado e o aviso de pagamento, e só quando
// quebrados), o rodapé do Mês (as três rodadas automáticas) e o journal do
// servidor (a verificação diária, e os avisos de pagamento que o sistema não
// baixou — seis em dez dias, que ninguém via sem entrar na máquina).
//
// O PAINEL AFIRMA, além de alarmar: uma linha por peça, SEMPRE, com o estado e a
// frase do que isso quer dizer para quem opera — «em dia» é informação, e sem
// ela «não vejo aviso nenhum» significaria as duas coisas ao mesmo tempo (a mesma
// razão do rodapé das rodadas). As faixas do alto continuam: elas gritam; o
// painel conta.
//
// O QUE AINDA NÃO EXISTE APARECE COMO TAL, e não some nem fica vermelho para
// sempre: o backup (ninguém decidiu ainda frequência, retenção e quem restaura) e
// o caixa (depende das contas bancárias e do saldo de partida). «Não existe» é
// neutro e não conta no resumo como alarme — vermelho permanente é alarme
// desligado.

import { linhasDasAutomacoes, type RodadaNaTela } from './automacoes.ts';
import { estadoDoCertificado } from './cobranca-regras.ts';
import type { NivelDoAviso } from './saude-do-dinheiro.ts';
import { emReais } from './dinheiro.ts';
import { diaEmBr } from './formato.ts';

export type EstadoDaPeca = 'em_dia' | 'atencao' | 'falha' | 'nao_medido' | 'nao_existe';

/** A palavra do selo. A cor é o segundo sinal, nunca o único (restrição 3 do tema). */
export const ROTULO_DO_ESTADO_DA_PECA: Readonly<Record<EstadoDaPeca, string>> = {
  em_dia: 'em dia',
  atencao: 'atenção',
  falha: 'com falha',
  nao_medido: 'não medido',
  nao_existe: 'não existe',
};

/** Abre sozinho quando há o que conferir; fechado, o resumo de uma linha basta. */
export const temAlarme = (pecas: readonly PecaDaSaude[]): boolean =>
  pecas.some((x) => x.estado === 'falha' || x.estado === 'atencao');

export type ChaveDaPeca =
  | 'ciclo_do_crm' | 'fila_de_emissao' | 'consulta_ativa' | 'rodadas'
  | 'banco' | 'certificado' | 'aviso' | 'ignorados' | 'backup' | 'caixa';

export type PecaDaSaude = {
  chave: ChaveDaPeca;
  /** «O aviso de pagamento do banco» — o sujeito da frase. */
  nome: string;
  /** O que o estado quer dizer para quem opera, em uma frase. */
  frase: string;
  estado: EstadoDaPeca;
  /** Linhas de apoio (um aviso por linha, por exemplo). Vazio na maioria. */
  detalhes: string[];
  /** O texto de engenharia, que só aparece atrás de «ver detalhe técnico». */
  tecnico: string[];
  /** A tela onde isso se resolve, quando há uma. */
  destino: { rotulo: string; endereco: string } | null;
};

/** O que `GET /conector-cobranca/avisos-ignorados` devolve (datas em texto ISO). */
export type AvisosIgnoradosNaTela = {
  janela_em_dias: number;
  titulo_desconhecido: { total: number; valor_centavos: number };
  evento_ignorado: { total: number };
  avisos: Array<{
    id: string;
    recebido_em: string;
    motivo: 'titulo_desconhecido' | 'evento_ignorado';
    nosso_numero: string | null;
    valor_centavos: number | null;
    data_liquidacao: string | null;
    detalhe: string | null;
  }>;
};

/**
 * TUDO O QUE O PAINEL LEU, peça a peça. `null` é «ainda lendo» — e peça ainda
 * lendo não vira linha: uma linha que piscasse «não medido» durante o
 * carregamento seria ruído, e esperar um segundo custa zero.
 */
export type LeituraDaSaude = {
  rodadas: readonly RodadaNaTela[] | null;
  erroDasRodadas: string | null;
  /** O banco (conector de cobrança) está ligado? `null` enquanto lê. */
  semConector: boolean | null;
  /** Dias até o certificado vencer; `null` = sem data cadastrada; `undefined`
   *  = ainda lendo (e aí a linha espera, em vez de piscar «não medido»). */
  diasDoCertificado: number | null | undefined;
  /** `null` enquanto lê. */
  aviso: NivelDoAviso | null;
  /** O papel de quem abriu a tela não consulta o banco (403) — não é falha do banco. */
  avisoSemPermissao: boolean;
  ignorados: AvisosIgnoradosNaTela | null;
  erroDosIgnorados: boolean;
};

const COBRANCA = { rotulo: 'Abrir Cobrança', endereco: '/cobranca' };

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** As peças, na ordem do caminho do dinheiro: o que o sistema faz sozinho, o
 *  banco, o que o banco avisou e não entrou, e o que ainda não existe. */
export function pecasDaSaude(l: LeituraDaSaude): PecaDaSaude[] {
  const p: PecaDaSaude[] = [];
  const peca = (x: Omit<PecaDaSaude, 'detalhes' | 'tecnico' | 'destino'> & Partial<PecaDaSaude>): void => {
    p.push({ detalhes: [], tecnico: [], destino: null, ...x });
  };

  // ------------------------------------------------ as rodadas automáticas
  if (l.erroDasRodadas) {
    peca({
      chave: 'rodadas', nome: 'As rodadas automáticas', estado: 'nao_medido',
      /* O MOTIVO FICA À VISTA, como no rodapé que este painel substituiu: a
         mensagem de erro do servidor é escrita para quem opera. */
      frase: `não foi possível saber se aconteceram — isso não quer dizer que pararam, quer dizer que ninguém sabe. O motivo foi: ${l.erroDasRodadas}`,
    });
  } else if (l.rodadas) {
    for (const r of linhasDasAutomacoes(l.rodadas)) {
      peca({
        chave: r.chave, nome: r.nome, estado: r.saudavel ? 'em_dia' : 'falha',
        frase: r.fez ? `${r.quando} — ${r.fez}.` : `${r.quando}.`,
      });
    }
  }

  // ---------------------------------------------------------------- o banco
  if (l.semConector === true) {
    peca({
      chave: 'banco', nome: 'A cobrança no banco', estado: 'nao_existe',
      frase: 'ainda não foi ligada: não há certificado, aviso de pagamento nem conferência no banco a vigiar.',
      destino: COBRANCA,
    });
  } else if (l.semConector === false) {
    const cert = l.diasDoCertificado === undefined
      ? null
      : estadoDoCertificado({ temConector: true, dias: l.diasDoCertificado });
    const d = l.diasDoCertificado ?? 0;
    switch (cert) {
      case null:
        break;
      case 'ok':
        peca({ chave: 'certificado', nome: 'O certificado do banco', estado: 'em_dia',
               frase: `vale por mais ${d} ${plural(d, 'dia', 'dias')}.`, destino: COBRANCA });
        break;
      case 'vence_em_breve':
        peca({ chave: 'certificado', nome: 'O certificado do banco', estado: 'atencao',
               frase: `vence em ${d} ${plural(d, 'dia', 'dias')} — renovar tem processo e assinatura, e não é um clique.`,
               destino: COBRANCA });
        break;
      case 'vencido':
        peca({ chave: 'certificado', nome: 'O certificado do banco', estado: 'falha',
               frase: 'venceu: nenhum boleto novo é registrado no banco até a renovação.', destino: COBRANCA });
        break;
      default:
        peca({ chave: 'certificado', nome: 'O certificado do banco', estado: 'nao_medido',
               frase: 'não tem data de validade cadastrada, então o sistema não sabe se ele está válido.',
               destino: COBRANCA });
    }

    if (l.aviso) {
      const FRASE_DO_AVISO: Record<NivelDoAviso, [EstadoDaPeca, string]> = {
        ativo: ['em_dia', 'está ligado: um boleto pago avisa o sistema na hora.'],
        inativado: ['falha', 'foi desligado pelo banco — a baixa passa a esperar a conferência diária, de minutos para até um dia.'],
        ausente: ['falha', 'não está cadastrado no banco — a baixa depende só da conferência diária.'],
        url_divergente: ['falha', 'aponta para outro endereço — os pagamentos não chegam aqui na hora.'],
        nao_verificavel: ['nao_medido', 'não deu para perguntar ao banco se ele está ligado.'],
      };
      const [estado, frase] = l.avisoSemPermissao
        ? ['nao_medido' as const, 'não é consultado com o seu papel de acesso — quem opera a cobrança vê esta linha.']
        : FRASE_DO_AVISO[l.aviso];
      peca({ chave: 'aviso', nome: 'O aviso de pagamento do banco', estado, frase,
             destino: l.avisoSemPermissao ? null : COBRANCA });
    }

    // ------------------------------------- o que o banco avisou e não entrou
    if (l.erroDosIgnorados) {
      peca({
        chave: 'ignorados', nome: 'Os avisos de pagamento que o sistema não baixou', estado: 'nao_medido',
        frase: 'não foi possível ler a lista agora.',
      });
    } else if (l.ignorados) {
      p.push(pecaDosIgnorados(l.ignorados));
    }
  }

  // ------------------------------------------------ o que ainda não existe
  peca({
    chave: 'backup', nome: 'O backup do banco de dados', estado: 'nao_existe',
    frase: 'ainda não foi declarado: com que frequência ele é feito, por quanto tempo fica guardado e quem restaura.',
  });
  peca({
    chave: 'caixa', nome: 'O saldo em caixa', estado: 'nao_existe',
    frase: 'ainda não é medido: depende do cadastro das contas bancárias e do saldo de partida de cada uma.',
  });

  return p;
}

/**
 * OS AVISOS QUE O SISTEMA NÃO BAIXOU. Os de título desconhecido são dinheiro: o
 * banco avisou um pagamento de boleto que não nasceu aqui — normalmente emitido à
 * mão no portal —, e o sistema respondeu e seguiu. Os de evento ignorado não são
 * pagamento (um cancelamento de baixa, uma baixa sem valor), e não entram na soma.
 */
export function pecaDosIgnorados(i: AvisosIgnoradosNaTela): PecaDaSaude {
  const n = i.titulo_desconhecido.total;
  const e = i.evento_ignorado.total;
  const janela = `nos últimos ${i.janela_em_dias} dias`;
  const detalhes = i.avisos
    .filter((a) => a.motivo === 'titulo_desconhecido')
    .map((a) => [
      a.nosso_numero ? `nosso número ${a.nosso_numero}` : 'sem nosso número',
      a.valor_centavos != null ? emReais(a.valor_centavos) : null,
      a.data_liquidacao ? `pago em ${diaEmBr(a.data_liquidacao)}` : null,
      `avisado em ${diaEmBr(a.recebido_em)}`,
    ].filter(Boolean).join(' · '));
  const tecnico = i.avisos
    .filter((a) => a.motivo === 'evento_ignorado')
    .map((a) => `${diaEmBr(a.recebido_em)}: ${a.detalhe ?? '(sem motivo)'}`);

  const outros = e > 0
    ? ` Além ${plural(n, 'dele', 'deles')}, ${e} ${plural(e, 'aviso não era', 'avisos não eram')} pagamento (cancelamento de baixa, baixa sem valor).`
    : '';

  if (n === 0) {
    return {
      chave: 'ignorados', nome: 'Os avisos de pagamento que o sistema não baixou',
      estado: 'em_dia',
      frase: `nenhum ${janela}: todo pagamento avisado era de boleto deste sistema.${e > 0 ? ` ${e} ${plural(e, 'aviso não era', 'avisos não eram')} pagamento (cancelamento de baixa, baixa sem valor).` : ''}`,
      detalhes: [], tecnico, destino: null,
    };
  }
  return {
    chave: 'ignorados', nome: 'Os avisos de pagamento que o sistema não baixou',
    estado: 'atencao',
    frase: `${n} ${plural(n, 'pagamento avisado', 'pagamentos avisados')} pelo banco ${janela} `
      + `não ${plural(n, 'era', 'eram')} de boleto deste sistema, somando ${emReais(i.titulo_desconhecido.valor_centavos)}. `
      + 'Costuma ser boleto emitido à mão no portal do banco: o dinheiro entrou, e o sistema não o registrou. '
      + `Confira se ${plural(n, 'ele está anotado', 'eles estão anotados')} em outro lugar.${outros}`,
    detalhes: n > detalhes.length ? [...detalhes, `e mais ${n - detalhes.length}`] : detalhes,
    tecnico, destino: null,
  };
}

/**
 * ALGUMA COISA JÁ FOI LIDA? Antes disso o painel não desenha nada: o backup e o
 * caixa são fatos fixos, e um painel só com eles diria «o que existe está de pé»
 * sem ter medido nada — ausência de resposta não é resposta, nem para gritar nem
 * para tranquilizar (a regra do `R13h`, que vale para o painel inteiro).
 */
export const algoLido = (l: LeituraDaSaude): boolean =>
  l.rodadas !== null || l.erroDasRodadas !== null || l.semConector !== null
  || l.ignorados !== null || l.erroDosIgnorados;

/** Ainda falta alguma peça voltar? Enquanto falta, o resumo não afirma «de pé». */
export const aindaLendo = (l: LeituraDaSaude): boolean =>
  (l.rodadas === null && l.erroDasRodadas === null)
  || l.semConector === null
  || (l.semConector === false && (l.diasDoCertificado === undefined || l.aviso === null
      || (l.ignorados === null && !l.erroDosIgnorados)));

/**
 * O RESUMO DE UMA LINHA, que se lê com o painel fechado. Só falha e atenção
 * contam como alarme; «não medido» é dito à parte (ninguém sabe ≠ está quebrado);
 * «não existe» é dito por último e não impede o «está de pé» — senão o resumo
 * nunca diria que está tudo bem enquanto o backup não for decidido. Com peça
 * ainda por voltar, ele diz que está lendo em vez de afirmar.
 */
export function resumoDaSaude(pecas: readonly PecaDaSaude[], lendo = false): string {
  if (pecas.length === 0) return 'Lendo…';
  const minusculo = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const nomes = (l: readonly PecaDaSaude[]) => l.map((x) => minusculo(x.nome)).join(', ');
  const alarme = pecas.filter((x) => x.estado === 'falha' || x.estado === 'atencao');
  const naoMedidas = pecas.filter((x) => x.estado === 'nao_medido');
  const naoExistem = pecas.filter((x) => x.estado === 'nao_existe');

  const partes: string[] = [];
  if (alarme.length > 0) {
    partes.push(`${alarme.length} ${plural(alarme.length, 'pede', 'pedem')} atenção: ${nomes(alarme)}.`);
  } else {
    partes.push(lendo ? 'Lendo o restante…' : 'O que existe está de pé.');
  }
  if (naoMedidas.length > 0) {
    partes.push(`${naoMedidas.length} não ${plural(naoMedidas.length, 'pôde', 'puderam')} ser ${plural(naoMedidas.length, 'medida', 'medidas')}: ${nomes(naoMedidas)}.`);
  }
  if (naoExistem.length > 0) {
    partes.push(`Ainda não ${plural(naoExistem.length, 'existe', 'existem')}: ${nomes(naoExistem)}.`);
  }
  return partes.join(' ');
}
