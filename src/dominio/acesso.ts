// O ACESSO DE UMA PESSOA A UMA EMPRESA: o papel (o que ela pode FAZER) e os
// setores (o que ela VE). PURO, sem banco — as regras que a tela de
// Administracao aplica antes de gravar.
//
// ============================================================================
// DUAS PERGUNTAS, DUAS RESPOSTAS, e misturar as duas e o defeito a evitar
//
// O PAPEL ja existia (matriz do PRD 3, `src/db/contexto.ts`) e governa o DADO:
// quem escreve cadastro, quem ve contas a pagar. Os SETORES entraram em
// 30/09/2026 (migration 41), a pedido do dono — *"uma configuracao de quais
// setores eles podem visualizar, isso deve ser marcado por checkbox"* — e
// governam a TELA: quais pastas do menu do topo aparecem.
//
// A Administracao da plataforma e um setor, mas so o papel `admin` pode te-la:
// ver a pasta sem poder administrar seria uma tela que recusa todo clique. O
// banco prende isso por CHECK (`usuario_tenant_administracao_so_admin`); aqui a
// regra existe para a pessoa ler a frase certa ANTES de o banco recusar.
//
// ============================================================================
// O QUE ESTE ARQUIVO IMPEDE QUE O BANCO NAO IMPEDE: TRANCAR-SE PARA FORA
//
// Quem administra nao pode tirar de SI MESMO a Administracao, o papel `admin`
// nem o acesso. O banco aceitaria — a linha continua valida —, e a
// consequencia e a pasta sumir no proximo clique, sem caminho de volta pela
// tela se a pessoa era a ultima. Como toda mudanca exige alguem que administra,
// e esse alguem nunca pode se remover, SEMPRE sobra ao menos um.

export const SETORES = ['rateio', 'empresa', 'administracao'] as const;
export type Setor = (typeof SETORES)[number];

/** O que todo vinculo via antes da migration 41, e o DEFAULT da coluna. */
export const SETORES_PADRAO: readonly Setor[] = ['rateio', 'empresa'];

export const PAPEIS = ['admin', 'financeiro', 'cobranca', 'leitura'] as const;
export type Papel = (typeof PAPEIS)[number];

export const ehSetor = (v: unknown): v is Setor => typeof v === 'string' && (SETORES as readonly string[]).includes(v);
export const ehPapel = (v: unknown): v is Papel => typeof v === 'string' && (PAPEIS as readonly string[]).includes(v);

/**
 * Os setores como a lista CANONICA: sem repeticao, na ordem de `SETORES` (a do
 * menu). Recusa com `TypeError` — que a fronteira HTTP traduz em 422 — o que
 * nao for lista de setores conhecidos, e a lista vazia.
 */
export function normalizarSetores(v: unknown): Setor[] {
  if (!Array.isArray(v)) throw new TypeError('setores deve ser uma lista');
  const desconhecidos = v.filter((s) => !ehSetor(s));
  if (desconhecidos.length) {
    throw new TypeError(`setor desconhecido: ${desconhecidos.map((s) => JSON.stringify(s)).join(', ')}`);
  }
  const marcados = SETORES.filter((s) => v.includes(s));
  if (marcados.length === 0) {
    throw new TypeError('marque ao menos um setor. Para tirar o acesso de alguem, desligue o acesso');
  }
  return marcados;
}

/**
 * Os setores que o LOGIN devolveu, lidos com tolerancia: antes da migration 41 a
 * coluna nao existe e o campo vem `undefined`. Os timers carregam o codigo da
 * arvore de trabalho sem esperar deploy (`ordem-migration-antes-do-codigo`), e o
 * login do ciclo passa por aqui — entao ausencia vira o que todo vinculo via
 * ate entao, e nunca erro.
 */
export function setoresDoLogin(v: unknown): Setor[] {
  if (!Array.isArray(v)) return [...SETORES_PADRAO];
  const s = SETORES.filter((x) => v.includes(x));
  return s.length ? s : [...SETORES_PADRAO];
}

export type MotivoDeRecusa = { erro: string; mensagem: string };

/**
 * A CONTA DE SERVICO do conector de cobranca (`src/auth/usuario-de-servico.ts`)
 * aparece na lista como qualquer vinculo — e NAO pode ser mexida pela tela. O
 * webhook de liquidacao da Sicoob entra por ela: desligar o vinculo, ou tirar o
 * papel `cobranca`, faz o aviso de pagamento do banco ser RECUSADO, e o
 * dinheiro que entra deixa de ser baixado. O dominio `servico.invalido` e o que
 * o provisionamento grava (RFC 6761: nao ha caixa de correio).
 */
export const ehContaDeServico = (email: string): boolean => /@servico\.invalido$/i.test(email.trim());

/**
 * A combinacao papel + setores e possivel? `null` quando sim.
 */
export function conferirCombinacao(papel: Papel, setores: readonly Setor[]): MotivoDeRecusa | null {
  if (setores.includes('administracao') && papel !== 'admin') {
    return {
      erro: 'AdministracaoExigeAdmin',
      mensagem: 'Só o perfil Administrador pode ver a Administração da plataforma. Escolha esse perfil '
        + 'ou desmarque a Administração.',
    };
  }
  return null;
}

/**
 * A MUDANCA que quem administra quer fazer no acesso de alguem. `null` quando
 * pode; o motivo, com a frase que a tela mostra, quando nao pode.
 *
 * `ehVoceMesmo` vem do servidor (o vinculo do contexto), nunca do corpo da
 * requisicao.
 */
export function conferirMudanca(p: {
  ehVoceMesmo: boolean;
  papel: Papel;
  setores: readonly Setor[];
  ativo: boolean;
}): MotivoDeRecusa | null {
  const combinacao = conferirCombinacao(p.papel, p.setores);
  if (combinacao) return combinacao;

  if (p.ehVoceMesmo) {
    if (!p.ativo) {
      return { erro: 'NaoPodeSeDesligar',
        mensagem: 'Você não pode desligar o seu próprio acesso. Peça a outra pessoa que administra a plataforma.' };
    }
    if (p.papel !== 'admin' || !p.setores.includes('administracao')) {
      return { erro: 'NaoPodeTirarAPropriaAdministracao',
        mensagem: 'Você não pode tirar de si mesmo a Administração da plataforma — a pasta sumiria no '
          + 'próximo clique. Peça a outra pessoa que administra a plataforma.' };
    }
  }
  return null;
}

// ------------------------------------------------------------- a pessoa nova

/** A senha provisoria. O Supabase Auth aceita 6; aqui se pede 10, porque quem a
 *  digita e quem administra e ela vai por mensagem ate a pessoa. */
export const SENHA_MINIMA = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PessoaNova = { nome: string; email: string; senha: string; papel: Papel; setores: Setor[] };

/**
 * O corpo do cadastro, conferido e normalizado. Lanca `TypeError` (422) com a
 * frase para quem opera.
 */
export function lerPessoaNova(c: any): PessoaNova {
  const nome = String(c?.nome ?? '').trim().replace(/\s+/g, ' ');
  const email = String(c?.email ?? '').trim().toLowerCase();
  const senha = String(c?.senha ?? '');
  if (nome.length < 2) throw new TypeError('informe o nome da pessoa');
  if (!EMAIL.test(email)) throw new TypeError('o e-mail não parece um endereço válido');
  if (ehContaDeServico(email)) throw new TypeError('este endereço é reservado às contas de serviço do sistema');
  if (senha.length < SENHA_MINIMA) {
    throw new TypeError(`a senha provisória precisa de ao menos ${SENHA_MINIMA} caracteres`);
  }
  if (senha.trim() !== senha) throw new TypeError('a senha provisória não pode começar nem terminar com espaço');
  if (!ehPapel(c?.papel)) throw new TypeError('escolha o perfil da pessoa');
  const setores = normalizarSetores(c?.setores);
  const recusa = conferirCombinacao(c.papel, setores);
  if (recusa) throw new TypeError(recusa.mensagem);
  return { nome, email, senha, papel: c.papel, setores };
}
