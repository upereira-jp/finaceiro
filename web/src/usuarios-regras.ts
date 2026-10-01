// AS REGRAS DA TELA «Usuários» — sem JSX, porque o runner do `web/` não lê JSX e
// o que precisa de teste sai do `.tsx` (regra 8).
//
// ============================================================================
// A TELA É UMA MATRIZ, e o desenho é o pedido
//
// *«uma configuração de quais setores eles podem visualizar, isso deve ser
// marcado por checkbox»* (dono, 30/09/2026). Uma linha por pessoa, uma coluna
// por setor, uma caixa em cada cruzamento: quem vê o quê se lê num olhar, e
// marcar é um clique. Cada caixa grava sozinha — não há «salvar» para esquecer.
//
// UMA CAIXA QUE NÃO PODE MUDAR APARECE TRAVADA E DIZ POR QUÊ, em vez de deixar o
// clique ir ao servidor e voltar recusado. As travas são as mesmas regras que o
// servidor aplica (`src/dominio/acesso.ts`) — aqui elas só chegam antes.

import { FUNIS, type ChaveDoFunil } from './navegacao.ts';
import type { NomeDeIcone } from './iconografia.ts';

export type Papel = 'admin' | 'financeiro' | 'cobranca' | 'leitura';

/**
 * OS QUATRO PERFIS, na palavra de quem opera. O nome no banco (`papel`) é
 * `admin/financeiro/cobranca/leitura`; o que a pessoa lê é o que cada um FAZ,
 * transcrito da matriz do PRD §3 (`src/db/contexto.ts`).
 */
export const PERFIS: ReadonlyArray<{ valor: Papel; nome: string; faz: string }> = [
  { valor: 'admin', nome: 'Administrador',
    faz: 'Faz tudo: cadastros, cobrança, contas a pagar e configuração. É o único que pode ver a Administração.' },
  { valor: 'financeiro', nome: 'Financeiro',
    faz: 'Lança e paga contas a pagar. Vê cadastros e cobrança, sem alterar.' },
  { valor: 'cobranca', nome: 'Cobrança',
    faz: 'Emite cobranças, pede boletos e dá baixa. Vê cadastros; não vê contas a pagar.' },
  { valor: 'leitura', nome: 'Só leitura',
    faz: 'Consulta tudo, menos contas a pagar da empresa. Não altera nada.' },
];

export const nomeDoPerfil = (p: string): string => PERFIS.find((x) => x.valor === p)?.nome ?? p;

/** As colunas de caixa, na ordem do menu — tiradas de `FUNIS`, para o nome na
 *  tela ser letra por letra o do menu. */
export const COLUNAS_DE_SETOR: ReadonlyArray<{
  chave: ChaveDoFunil; nome: string; icone: NomeDeIcone; resumo: string;
}> = FUNIS.map((f) => ({ chave: f.chave, nome: f.rotulo, icone: f.icone, resumo: f.resumo }));

const ORDEM = FUNIS.map((f) => f.chave as string);

/** Marca ou desmarca um setor, devolvendo a lista na ordem do menu. */
export function alternarSetor(setores: readonly string[], setor: string): string[] {
  const tem = setores.includes(setor);
  const nova = tem ? setores.filter((s) => s !== setor) : [...setores, setor];
  return ORDEM.filter((s) => nova.includes(s));
}

/** O e-mail da conta de serviço do conector Sicoob — o mesmo teste do servidor. */
export const ehContaDeServico = (email: string): boolean => /@servico\.invalido$/i.test(email.trim());

export type LinhaDeAcesso = {
  papel: string; setores: readonly string[]; ativo: boolean; voce: boolean; email: string;
};

export type EstadoDaCaixa = { marcada: boolean; travada: boolean; motivo: string | null };

/**
 * A caixa de um setor numa linha. A ordem das travas é a ordem em que a pessoa
 * precisa ouvir o motivo: primeiro o que vale para a linha inteira.
 */
export function caixaDoSetor(l: LinhaDeAcesso, setor: string): EstadoDaCaixa {
  const marcada = l.setores.includes(setor);
  const trava = (motivo: string): EstadoDaCaixa => ({ marcada, travada: true, motivo });

  if (ehContaDeServico(l.email)) return trava('É a conta do conector Sicoob, não uma pessoa. Não se mexe aqui.');
  if (!l.ativo) return trava('O acesso está desligado. Religue para mudar os setores.');
  if (setor === 'administracao' && l.papel !== 'admin') return trava('Só o perfil Administrador pode ver a Administração.');
  if (setor === 'administracao' && l.voce && marcada) {
    return trava('Você não pode tirar a sua própria Administração. Peça a outra pessoa que administra.');
  }
  if (marcada && l.setores.length === 1) {
    return trava('Ao menos um setor fica marcado. Para tirar o acesso, desligue-o.');
  }
  return { marcada, travada: false, motivo: null };
}

/**
 * TROCAR O PERFIL de alguém que tem a Administração para um perfil que não pode
 * tê-la: a Administração sai JUNTO, no mesmo pedido, e a tela diz isso. A
 * alternativa — recusar a troca — obrigaria dois cliques numa ordem que ninguém
 * adivinha (desmarcar primeiro, trocar depois).
 */
export function mudancaDePerfil(l: { papel: string; setores: readonly string[] }, papel: Papel): {
  papel: Papel; setores: string[]; aviso: string | null;
} {
  if (papel !== 'admin' && l.setores.includes('administracao')) {
    const setores = l.setores.filter((s) => s !== 'administracao');
    return {
      papel,
      // Se a Administração era o único setor, a pessoa fica com os dois setores
      // financeiros — nunca com a barra vazia (o banco recusaria).
      setores: setores.length ? [...setores] : ['rateio', 'empresa'],
      aviso: 'A Administração da plataforma saiu junto: ela é só do perfil Administrador.',
    };
  }
  return { papel, setores: [...l.setores], aviso: null };
}

/** O perfil da PRÓPRIA linha fica travado: quem está logado aqui administra, e
 *  qualquer outro perfil tiraria dela a Administração (o servidor recusa igual). */
export const perfilTravado = (l: { voce: boolean; email: string; ativo: boolean }): boolean =>
  l.voce || ehContaDeServico(l.email) || !l.ativo;

// ------------------------------------------------------------- senha provisória

/**
 * SEM 0/O, 1/l/I: a senha vai por mensagem e é digitada à mão, e é nesses pares
 * que alguém erra e liga dizendo que «a senha não funciona».
 */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Doze caracteres em três blocos (`xxxx-xxxx-xxxx`): ~70 bits, e legível ao
 *  telefone. `aleatorio` é injetável só para teste. */
export function gerarSenha(aleatorio: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n))): string {
  const v = aleatorio(12);
  const c = Array.from(v, (x) => ALFABETO[x % ALFABETO.length]!);
  return `${c.slice(0, 4).join('')}-${c.slice(4, 8).join('')}-${c.slice(8, 12).join('')}`;
}

export const SENHA_MINIMA = 10;

/** O texto que quem administra copia e manda à pessoa nova. */
export function textoDeAcesso(p: { nome: string; email: string; senha: string; endereco: string }): string {
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? '';
  return [
    `Olá, ${primeiro}! Seu acesso ao Financeiro G3 está pronto.`,
    `Endereço: ${p.endereco}`,
    `E-mail: ${p.email}`,
    `Senha provisória: ${p.senha}`,
  ].join('\n');
}

/** Confere o formulário antes do clique. `null` = pode enviar. */
export function faltaNoFormulario(f: {
  nome: string; email: string; senha: string; papel: string; setores: readonly string[];
}): string | null {
  if (f.nome.trim().length < 2) return 'Falta o nome.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Falta um e-mail válido.';
  if (f.senha.length < SENHA_MINIMA) return `A senha provisória precisa de ao menos ${SENHA_MINIMA} caracteres.`;
  if (!f.papel) return 'Escolha o perfil.';
  if (f.setores.length === 0) return 'Marque ao menos um setor.';
  if (f.setores.includes('administracao') && f.papel !== 'admin') {
    return 'Só o perfil Administrador pode ver a Administração.';
  }
  return null;
}
