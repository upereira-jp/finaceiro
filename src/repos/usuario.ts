// QUEM TEM ACESSO A EMPRESA — a lista, o cadastro e a troca de acesso. A tela
// e a «Usuários», na pasta «Administração da plataforma» (30/09/2026).
//
// A AUTORIDADE E CONFERIDA DUAS VEZES, e nenhuma substitui a outra:
//
//   aqui       `exigirAdministracao()`: papel `admin` (a matriz do PRD 3) E o
//              setor `administracao` no vinculo do contexto. Da a frase certa
//              antes de o banco ser tocado;
//   no banco   as duas funcoes SECURITY DEFINER da migration 41 reimpoem o mesmo
//              predicado (`app.administra_a_plataforma()`) e recusam com 42501.
//              E o que segura um handler que esqueca a linha de cima.
//
// A TRILHA (regra 9) E DO BANCO: `usuario` e `usuario_tenant` tem o gatilho
// `auditar`, que grava quem mudou, antes e depois — inclusive o que passa pelas
// funcoes SECURITY DEFINER (`tests/administracao.sql`, AD9).

import { db, exigir } from '../db/contexto.ts';
import { ehSqlstate, SQLSTATE } from '../db/sqlstate.ts';
import {
  conferirMudanca, normalizarSetores, ehPapel, setoresDoLogin, ehContaDeServico,
  type Papel, type Setor,
} from '../dominio/acesso.ts';

export type UsuarioDoTenant = {
  usuario_id: string;
  nome: string;
  email: string;
  papel: Papel;
  setores: Setor[];
  ativo: boolean;
  criado_em: Date;
  /** A linha e de quem esta perguntando. A tela a usa para travar as caixas que
   *  tirariam o proprio acesso; o servidor confere de novo em `alterarAcesso`. */
  voce: boolean;
};

const erro = (status: number, nome: string, mensagem: string) =>
  Object.assign(new Error(mensagem), { status, name: nome });

/** 403 nomeado. Papel sem `administrar` ja cai no `exigir` com a frase dele. */
export async function exigirAdministracao(): Promise<void> {
  await exigir('administrar');
  const r: Array<{ pode: boolean }> = await db().$queryRaw`SELECT app.administra_a_plataforma() AS pode`;
  if (!r?.[0]?.pode) {
    throw erro(403, 'SemAdministracao',
      'A Administração da plataforma não está liberada para você nesta empresa. Peça a quem administra '
      + 'que marque essa pasta no seu acesso.');
  }
}

const daLinha = (l: any): UsuarioDoTenant => ({
  usuario_id: l.usuario_id,
  nome: l.nome,
  email: l.email,
  papel: l.papel,
  setores: setoresDoLogin(l.setores),
  ativo: Boolean(l.ativo),
  criado_em: l.criado_em,
  voce: Boolean(l.voce),
});

export async function listar(): Promise<UsuarioDoTenant[]> {
  await exigirAdministracao();
  const linhas: any[] = await db().$queryRaw`
    SELECT usuario_id, nome, email, papel, setores, ativo, criado_em, voce
      FROM app.usuarios_do_tenant()`;
  return linhas.map(daLinha);
}

/**
 * Quem, NESTA empresa, ja usa este e-mail. Existe para o cadastro recusar ANTES
 * de criar conta no Supabase Auth: criar a conta e depois descobrir que a pessoa
 * ja estava na lista deixaria um ato externo feito a toa.
 */
export async function acharPorEmail(email: string): Promise<UsuarioDoTenant | null> {
  const todos = await listar();
  return todos.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Liga a conta de login ao tenant CORRENTE. O tenant nao e parametro nem aqui
 * nem na funcao do banco — sai do contexto.
 */
export async function vincular(p: {
  authUserId: string; nome: string; email: string; papel: Papel; setores: Setor[];
}): Promise<{ usuarioId: string; usuarioJaExistia: boolean }> {
  await exigirAdministracao();
  try {
    const r: Array<{ usuario_id: string; usuario_ja_existia: boolean }> = await db().$queryRaw`
      SELECT usuario_id, usuario_ja_existia
        FROM app.vincular_usuario(${p.authUserId}::uuid, ${p.nome}, ${p.email}, ${p.papel},
                                  ${p.setores}::text[])`;
    if (!r?.[0]?.usuario_id) throw new Error('vincular_usuario nao devolveu o usuario');
    return { usuarioId: r[0].usuario_id, usuarioJaExistia: Boolean(r[0].usuario_ja_existia) };
  } catch (e) {
    if (ehSqlstate(e, SQLSTATE.violacaoDeUnico)) {
      throw erro(409, 'JaTemAcesso', 'Esta pessoa já tem acesso a esta empresa. Para mudar o que ela vê, '
        + 'use «Editar acesso» na linha dela.');
    }
    if (ehSqlstate(e, '42501')) {
      throw erro(403, 'SemAdministracao', 'O banco recusou o cadastro: a Administração da plataforma não '
        + 'está liberada para você nesta empresa, ou a conta desta pessoa está desligada na plataforma.');
    }
    if (ehSqlstate(e, SQLSTATE.violacaoDeCheck)) {
      throw erro(422, 'AcessoInvalido', 'Só o perfil Administrador pode ver a Administração da plataforma.');
    }
    throw e;
  }
}

/**
 * Muda papel, setores e/ou se o acesso esta ligado. PATCH de verdade: o que nao
 * vem, fica como esta.
 */
export async function alterarAcesso(usuarioId: string, m: {
  papel?: unknown; setores?: unknown; ativo?: unknown;
}): Promise<UsuarioDoTenant> {
  await exigirAdministracao();

  const atual = (await listar()).find((u) => u.usuario_id === usuarioId);
  if (!atual) throw erro(404, 'NaoEncontrado', 'Esta pessoa não tem acesso a esta empresa.');
  if (ehContaDeServico(atual.email)) {
    throw erro(422, 'ContaDeServico', 'Esta é a conta do conector Sicoob, e não uma pessoa: é por ela que o '
      + 'banco avisa os pagamentos. Mexer no acesso dela faria os pagamentos deixarem de ser baixados.');
  }

  if (m.papel !== undefined && !ehPapel(m.papel)) throw new TypeError('perfil desconhecido');
  if (m.ativo !== undefined && typeof m.ativo !== 'boolean') throw new TypeError('ativo deve ser verdadeiro ou falso');

  const papel: Papel = (m.papel as Papel | undefined) ?? atual.papel;
  const setores: Setor[] = m.setores !== undefined ? normalizarSetores(m.setores) : atual.setores;
  const ativo: boolean = (m.ativo as boolean | undefined) ?? atual.ativo;

  const recusa = conferirMudanca({ ehVoceMesmo: atual.voce, papel, setores, ativo });
  if (recusa) throw erro(422, recusa.erro, recusa.mensagem);

  try {
    await db().$queryRaw`
      UPDATE usuario_tenant
         SET papel = ${papel}::papel_tenant, setores = ${setores}::text[], ativo = ${ativo}
       WHERE tenant_id = app.current_tenant_id() AND usuario_id = ${usuarioId}::uuid
      RETURNING usuario_id`;
  } catch (e) {
    if (ehSqlstate(e, SQLSTATE.violacaoDeCheck)) {
      throw erro(422, 'AcessoInvalido', 'Só o perfil Administrador pode ver a Administração da plataforma.');
    }
    throw e;
  }

  const depois = (await listar()).find((u) => u.usuario_id === usuarioId);
  if (!depois) throw erro(404, 'NaoEncontrado', 'Esta pessoa não tem acesso a esta empresa.');
  return depois;
}
