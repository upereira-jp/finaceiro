// O CAMINHO DO DINHEIRO, EM DUAS FAIXAS — puro, sem JSX, com suite propria.
//
// POR QUE ESTE ARQUIVO EXISTE, e a pendencia tinha nome.
//
// Ate 09/09/2026 os dois alertas da agenda de cobranca — o certificado A1 e o
// aviso de pagamento — chegavam a dois lugares: o journal do systemd e a tela de
// **Cobranca**. NENHUM DOS DOIS PROCURA NINGUEM, e a tela de Cobranca e a pior
// das duas para isso: ela e a tela de CONFIGURAR o banco, aberta uma vez por
// trimestre. O alerta morava na tela que ninguem abre.
//
// A troca que tinha sido feita era *"ninguem sabe"* por *"quem abrir a tela
// sabe"*. E melhor, e nao e aviso.
//
// SAO DOIS CANAIS E ELES SE COMPLETAM. A unidade `financeiro-saude-cobranca`
// fica vermelha em `systemctl list-units --failed` para quando NINGUEM esta
// olhando; esta faixa aparece no alto de **Pendencias**, a primeira tela da
// barra e a que a operacao abre todo dia, para quando alguem esta.
//
// AS FRASES SAO DE OPERACAO E NAO DE INTEGRACAO, e essa e a regra do arquivo.
// Quem le nao sabe o que e webhook e nao precisa saber. Precisa saber que boleto
// pago vai demorar mais para aparecer baixado, e que o dinheiro nao sumiu. Sem a
// frase do atraso, o alerta parece perda de dinheiro e vira panico.
//
// E ELE E PURO PELO MOTIVO DE SEMPRE (regra 8): o runner do `web/` nao le JSX,
// entao regra dentro de `.tsx` nao tem como ser verificada. Mesmo motivo de
// `cobranca-regras.ts` e `destino-da-camada.ts`.

import type { EstadoDoCertificado } from './cobranca-regras.ts';

/** O espelho de `NivelDoAviso` do servidor (`src/dominio/agenda.ts`). Os cinco
 *  chegam inteiros ate aqui: colapsar `nao_verificavel` em `ativo` na borda
 *  seria a tela afirmando o que o sistema nao sabe. */
export type NivelDoAviso = 'ativo' | 'url_divergente' | 'inativado' | 'ausente' | 'nao_verificavel';

export type FaixaDaSaude = {
  /** `erro` quando ha uma acao a tomar; `alerta` quando o que ha e ignorancia.
   *  A distincao e a mesma que separa `inativado` de `nao_verificavel` no
   *  servidor: "esta quebrado" nao e "ninguem sabe". */
  tom: 'erro' | 'alerta';
  /** A frase em negrito. Uma so, curta, e ela sozinha ja diz o que houve. */
  titulo: string;
  /** O resto. Diz a CONSEQUENCIA para quem opera, e depois o que fazer. */
  corpo: string;
  /** A tela onde isso se resolve, quando ha uma. `null` quando o conserto e
   *  fora do sistema — recadastrar o aviso e trabalho de quem administra o
   *  servidor, e desenhar um link para lugar nenhum e pior que nao desenhar. */
  destino: { rotulo: string; endereco: string } | null;
};

const COBRANCA = { rotulo: 'Cobrança', endereco: '/cobranca' };

/**
 * VAZIO E A RESPOSTA quando esta tudo de pe — mesma disciplina de
 * `alertaDoAviso` no servidor: quem exibe nao precisa saber quais estados
 * merecem faixa.
 *
 * `sem_conector` NAO GERA FAIXA, e a omissao e deliberada. Uma instalacao que
 * ainda nao ligou o banco veria uma faixa vermelha permanente na primeira tela,
 * todo dia, sobre algo que ja esta escrito em letras grandes na tela de
 * Cobranca. E o mesmo "vermelho permanente e alarme desligado" que faz o codigo
 * de saida 3 existir no systemd.
 */
export function faixasDaSaude(e: {
  certificado: EstadoDoCertificado;
  /** `null` enquanto a leitura nao voltou. Ausencia de resposta nao e resposta:
   *  nao gera faixa, e nao gera silencio afirmativo tambem — a faixa simplesmente
   *  ainda nao existe. */
  aviso: NivelDoAviso | null;
}): FaixaDaSaude[] {
  const f: FaixaDaSaude[] = [];

  switch (e.certificado) {
    case 'vencido':
      f.push({
        tom: 'erro',
        titulo: 'O certificado do banco venceu.',
        corpo: 'Enquanto ele estiver vencido, nenhum boleto novo consegue ser registrado no '
             + 'Sicoob — e a tentativa falha sem erro óbvio, então a fila só enche. '
             + 'Renovar o certificado tem processo e assinatura: não é um clique.',
        destino: COBRANCA,
      });
      break;
    case 'vence_em_breve':
      f.push({
        tom: 'erro',
        titulo: 'O certificado do banco está para vencer.',
        corpo: 'Quando ele vencer, nenhum boleto novo é registrado no Sicoob. O aviso sai com '
             + 'antecedência de propósito: renovar tem processo e assinatura, e não é um clique.',
        destino: COBRANCA,
      });
      break;
    case 'nao_medido':
      f.push({
        tom: 'alerta',
        titulo: 'Não há data de validade do certificado cadastrada.',
        corpo: 'O sistema não sabe se ele está válido — e por isso não diz que está. '
             + 'Enquanto a data não for preenchida, o aviso de vencimento nunca vai sair.',
        destino: COBRANCA,
      });
      break;
    case 'sem_conector':
    case 'ok':
      break;
  }

  switch (e.aviso) {
    case 'inativado':
      f.push({
        tom: 'erro',
        titulo: 'O banco desligou o aviso de pagamento.',
        corpo: 'Enquanto estiver assim, um boleto pago não avisa o sistema na hora — a Sicoob '
             + 'desliga o aviso sozinha quando a entrega falha, e não comunica. '
             + 'O dinheiro não se perde: a consulta diária ao banco continua dando baixa, então '
             + 'o que muda é o atraso, de minutos para até um dia. '
             + 'Recadastrar o aviso é trabalho de quem administra o servidor.',
        destino: COBRANCA,
      });
      break;
    case 'ausente':
      f.push({
        tom: 'erro',
        titulo: 'Não há aviso de pagamento cadastrado no banco.',
        corpo: 'Boleto pago só vira baixa na consulta diária, nunca na hora. '
             + 'Não é erro — é uma etapa da instalação que falta.',
        destino: COBRANCA,
      });
      break;
    case 'nao_verificavel':
      f.push({
        tom: 'alerta',
        titulo: 'Não deu para perguntar ao banco se o aviso de pagamento está ligado.',
        corpo: 'Isso não quer dizer que está tudo bem: quer dizer que ninguém sabe. '
             + 'A consulta diária continua dando baixa de qualquer forma.',
        destino: COBRANCA,
      });
      break;
    /* `erro` E NAO `alerta`, porque aqui não há ignorância nenhuma: o canal
     * existe, está vivo, e leva o aviso para outro lugar. Tem dono e conserto. */
    case 'url_divergente':
      f.push({
        tom: 'erro',
        titulo: 'O aviso de pagamento do banco aponta para outro endereço.',
        corpo: 'O banco avisa quando um boleto é pago — só que não avisa este sistema. '
             + 'Do lado de quem opera é idêntico a ninguém ter pagado. '
             + 'O dinheiro não se perde: a consulta diária continua dando baixa, então o que muda '
             + 'é o atraso, de minutos para até um dia. '
             + 'O conserto tem ordem: apagar o aviso errado no banco antes de religar aqui.',
        destino: COBRANCA,
      });
      break;
    case 'ativo':
    case null:
      break;
  }

  return f;
}

/**
 * O ESPELHO DA GUARDA DO SERVIDOR — `podeReligarOAviso`, em
 * `src/dominio/agenda.ts`.
 *
 * POR QUE ELE E COPIA E NAO IMPORTACAO: o `web/` e outro `tsconfig` e outro
 * pacote, e nao alcanca `src/`. Mesma situacao das transicoes de fatura em
 * `cobranca-regras.ts`, que tambem espelham o servidor.
 *
 * O RISCO DE COPIA E DERIVA, e ele esta prendido: `SD-14` importa as DUAS e
 * exige que concordem nos quatro niveis. O dia em que o servidor mudar e este
 * arquivo nao, a suite fica vermelha — nao e disciplina de quem escreve.
 *
 * E O SERVIDOR CONTINUA MANDANDO. Isto aqui decide se o BOTAO aparece; quem
 * recusa de verdade e a rota. Esconder existe para nao oferecer o que vai ser
 * negado, e nao para autorizar.
 */
export function podeReligarNaTela(nivel: NivelDoAviso | null): boolean {
  return nivel === 'inativado' || nivel === 'ausente';
}
