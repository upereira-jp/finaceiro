// USUÁRIOS — a primeira tela da pasta «Administração da plataforma».
//
// Pedido do dono em 30/09/2026: *«adicionar usuários ao sistema, e uma
// configuração de quais setores eles podem visualizar, isso deve ser marcado
// por checkbox»*. Até esse dia, cadastrar a segunda pessoa de uma empresa era
// um script de terminal e o painel do Supabase.
//
// DUAS PARTES, na ordem em que se usa:
//
//   o cadastro      fechado até o clique em «Adicionar pessoa» — a lista é o que
//                   se consulta todo dia, e o formulário, uma vez por contratação;
//   a matriz        uma linha por pessoa, uma caixa por setor. Cada caixa grava
//                   sozinha; a que não pode mudar aparece travada e diz por quê
//                   (`usuarios-regras.ts`).
//
// O QUE A TELA NÃO DECIDE: quem pode tudo isto. O servidor confere o perfil
// Administrador E a pasta marcada, e o banco confere de novo (migration 41). A
// tela só não mostra o que ia ser recusado.

import { useMemo, useState } from 'react';
import { api, type UsuarioDoTenant } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { useSessao } from '../sessao.tsx';
import { PerguntaNaTela } from '../serie.tsx';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, Marca, Icone, Interruptor, Escolha,
  Carregando, contem,
} from '../ui.tsx';
import {
  PERFIS, COLUNAS_DE_SETOR, alternarSetor, caixaDoSetor, mudancaDePerfil, perfilTravado,
  ehContaDeServico, gerarSenha, textoDeAcesso, faltaNoFormulario, SENHA_MINIMA,
  type Papel,
} from '../usuarios-regras.ts';

type Lista = { usuarios: UsuarioDoTenant[]; podeCadastrarLogin: boolean };
type Criado = { usuarioId: string; contaJaExistia: boolean; senhaDefinida: boolean; aviso: string | null };

async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

export function TelaUsuarios() {
  const sessao = useSessao();
  const carga = useDados<Lista>(() => api.get('/administracao/usuarios'));
  const [formAberto, setFormAberto] = useState(false);
  const [pronto, setPronto] = useState<{ texto: string; criado: Criado; nome: string } | null>(null);
  const [busca, setBusca] = useState('');

  const todos = carga.dado?.usuarios ?? [];
  const visiveis = todos.filter((u) => contem(u.nome, busca) || contem(u.email, busca));
  const ativos = todos.filter((u) => u.ativo && !ehContaDeServico(u.email)).length;
  const desligados = todos.filter((u) => !u.ativo).length;

  /** Depois de mudar a PRÓPRIA linha, o menu do topo tem de refletir. */
  const aoMudar = (u: UsuarioDoTenant) => {
    carga.recarregar();
    if (u.voce) sessao.recarregarSessao();
  };

  return (
    <Pagina titulo="Usuários"
            sub="Quem entra no Financeiro G3 e o que cada pessoa vê. O perfil diz o que a pessoa pode fazer; as caixas, quais setores aparecem no menu dela.">
      {carga.erro && <Aviso tipo="erro">{carga.erro}</Aviso>}

      {pronto && (
        <div className="cartao secao usuario-pronto" role="status">
          <h2><Icone nome="aviso_ok" tamanho={18} /> Acesso de {pronto.nome} criado</h2>
          {pronto.criado.senhaDefinida ? (
            <>
              <p className="sub">
                Envie a mensagem abaixo à pessoa por um canal seguro. A senha provisória aparece só
                agora — depois de fechar este quadro ela não pode ser vista de novo.
              </p>
              <pre className="usuario-mensagem">{pronto.texto}</pre>
            </>
          ) : (
            <p className="sub">
              Esta pessoa já tinha login no Financeiro por outra empresa: ela entra com o e-mail e a
              senha que já usa. A senha provisória digitada aqui não foi aplicada.
            </p>
          )}
          {pronto.criado.aviso && <Aviso tipo="alerta">{pronto.criado.aviso}</Aviso>}
          <div className="usuario-acoes">
            {pronto.criado.senhaDefinida && (
              <BotaoDeCopiar texto={pronto.texto} rotulo="Copiar mensagem" />
            )}
            <button type="button" onClick={() => setPronto(null)}>Fechar</button>
          </div>
        </div>
      )}

      <Ferramentas contagem={todos.length
        ? `${ativos} pessoa${ativos === 1 ? '' : 's'} com acesso${desligados ? ` · ${desligados} desligada${desligados === 1 ? '' : 's'}` : ''}`
        : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por nome ou e-mail…" />
        <button type="button" className={formAberto ? undefined : 'primario'}
                aria-expanded={formAberto} onClick={() => setFormAberto((v) => !v)}>
          {!formAberto && <Icone nome="acrescentar" tamanho={15} peso="bold" />}
          {formAberto ? 'Fechar o cadastro' : 'Adicionar pessoa'}
        </button>
      </Ferramentas>

      {formAberto && (
        <FormularioDePessoa
          podeCadastrarLogin={carga.dado?.podeCadastrarLogin ?? true}
          aoCriar={(criado, f) => {
            setPronto({
              criado, nome: f.nome.trim(),
              texto: textoDeAcesso({ nome: f.nome, email: f.email.trim().toLowerCase(), senha: f.senha,
                                     endereco: location.origin }),
            });
            setFormAberto(false);
            carga.recarregar();
          }} />
      )}

      {carga.carregando && !carga.dado ? <Carregando /> : (
        <Tabela cabecalho={<>
                  <th>Pessoa</th>
                  <th>Perfil</th>
                  {COLUNAS_DE_SETOR.map((c) => (
                    <th key={c.chave} className="usuario-coluna-setor">
                      <span className="usuario-th-setor"><Icone nome={c.icone} tamanho={14} /> {c.nome}</span>
                    </th>
                  ))}
                  <th>Acesso</th>
                </>}
                vazio={todos.length ? 'Ninguém corresponde à busca.' : 'Ninguém tem acesso a esta empresa ainda.'}>
          {visiveis.map((u) => <LinhaDeUsuario key={u.usuario_id} u={u} aoMudar={() => aoMudar(u)} />)}
        </Tabela>
      )}

      <p className="sub usuario-rodape">
        As caixas gravam na hora. Uma caixa apagada não pode mudar naquela linha — pare o ponteiro
        sobre ela para ler o motivo. Desligar um acesso tira a pessoa do sistema na próxima tela que
        ela abrir; religar devolve tudo como estava.
      </p>
    </Pagina>
  );
}

// ======================================================= uma linha da matriz

function LinhaDeUsuario({ u, aoMudar }: { u: UsuarioDoTenant; aoMudar: () => void }) {
  const acao = useAcao();
  const [aviso, setAviso] = useState<string | null>(null);
  const servico = ehContaDeServico(u.email);

  const gravar = async (mudanca: Record<string, unknown>, depois?: string | null) => {
    setAviso(null);
    const ok = await acao.executar(() => api.patch(`/administracao/usuarios/${u.usuario_id}`, mudanca));
    if (ok) { if (depois) setAviso(depois); aoMudar(); }
  };

  const trocarPerfil = (papel: string) => {
    if (papel === u.papel) return;
    const m = mudancaDePerfil(u, papel as Papel);
    void gravar({ papel: m.papel, setores: m.setores }, m.aviso);
  };

  /* [30/09/2026, etapa 4b] DESLIGAR PERGUNTA NA LINHA, embaixo da pessoa — era
     um `window.confirm`. Religar não pergunta: devolve tudo como estava. */
  const [desligando, setDesligando] = useState(false);
  const trocarAtivo = (ligar: boolean) => {
    if (!ligar) { setDesligando(true); return; }
    void gravar({ ativo: true });
  };

  return (
    <>
      <tr className={`usuario-linha${u.ativo ? '' : ' usuario-desligado'}`} aria-busy={acao.ocupado || undefined}>
        <td>
          <div className="usuario-nome">
            <strong>{u.nome}</strong>
            {u.voce && <Marca tom="ok" icone="usuario">você</Marca>}
            {servico && <Marca tom="nao_medido" icone="cobranca">conta do sistema</Marca>}
          </div>
          <div className="fraco usuario-email">{u.email}</div>
        </td>
        <td>
          {servico ? <span className="fraco">Conector Sicoob</span> : (
            <Escolha valor={u.papel} ao={trocarPerfil} rotuloAcessivel={`Perfil de ${u.nome}`}
                     className="usuario-perfil"
                     desabilitado={perfilTravado(u) || acao.ocupado}
                     opcoes={PERFIS.map((p) => ({ valor: p.valor, texto: p.nome }))} />
          )}
        </td>
        {COLUNAS_DE_SETOR.map((c) => {
          const cx = caixaDoSetor(u, c.chave);
          return (
            <td key={c.chave} className="usuario-coluna-setor">
              <input type="checkbox" className="caixa"
                     checked={cx.marcada} disabled={cx.travada || acao.ocupado}
                     title={cx.motivo ?? undefined}
                     aria-label={`${c.nome} para ${u.nome}${cx.motivo ? ` — ${cx.motivo}` : ''}`}
                     onChange={() => void gravar({ setores: alternarSetor(u.setores, c.chave) })} />
            </td>
          );
        })}
        <td>
          <Interruptor ligado={u.ativo} ao={trocarAtivo}
                       rotulo={u.ativo ? 'Ligado' : 'Desligado'}
                       rotuloAcessivel={`Acesso de ${u.nome}: ${u.ativo ? 'ligado' : 'desligado'}`}
                       desabilitado={u.voce || servico || acao.ocupado} />
        </td>
      </tr>
      {desligando && (
        <tr className="usuario-retorno">
          <td colSpan={3 + COLUNAS_DE_SETOR.length}>
            <PerguntaNaTela tom="perigo" rotulo={`Confirmar: desligar o acesso de ${u.nome}`}
                            manter="Manter ligado" confirmar="Desligar o acesso"
                            ocupado={acao.ocupado}
                            aoManter={() => setDesligando(false)}
                            aoConfirmar={() => { setDesligando(false); void gravar({ ativo: false }); }}>
              Desligar o acesso de <strong>{u.nome}</strong>? A pessoa deixa de entrar no Financeiro a
              partir da próxima tela que abrir. Dá para religar depois, com tudo como estava.
            </PerguntaNaTela>
          </td>
        </tr>
      )}
      {(acao.erro || aviso) && (
        <tr className="usuario-retorno">
          <td colSpan={3 + COLUNAS_DE_SETOR.length}>
            {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
            {aviso && <Aviso tipo="alerta">{aviso}</Aviso>}
          </td>
        </tr>
      )}
    </>
  );
}

// ======================================================= o cadastro

type Formulario = { nome: string; email: string; senha: string; papel: Papel | ''; setores: string[] };
const VAZIO: Formulario = { nome: '', email: '', senha: '', papel: '', setores: ['rateio', 'empresa'] };

function FormularioDePessoa({ podeCadastrarLogin, aoCriar }: {
  podeCadastrarLogin: boolean;
  aoCriar: (c: Criado, f: Formulario) => void;
}) {
  const acao = useAcao();
  const [f, setF] = useState<Formulario>(() => ({ ...VAZIO, senha: gerarSenha() }));
  const falta = useMemo(() => faltaNoFormulario({ ...f, papel: f.papel }), [f]);
  const [copiada, setCopiada] = useState(false);

  const escolherPerfil = (papel: Papel) => {
    // Sair do Administrador leva a Administração junto, como na matriz.
    setF((x) => ({ ...x, papel, setores: papel === 'admin' ? x.setores : x.setores.filter((s) => s !== 'administracao') }));
  };

  const enviar = async () => {
    const r: { criado?: Criado } = {};
    const ok = await acao.executar(async () => {
      r.criado = await api.post<Criado>('/administracao/usuarios', {
        nome: f.nome, email: f.email, senha: f.senha, papel: f.papel, setores: f.setores,
      });
    });
    if (ok && r.criado) aoCriar(r.criado, f);
  };

  return (
    <div className="cartao secao usuario-novo">
      <h2><Icone nome="usuarios" tamanho={18} /> Nova pessoa</h2>

      {!podeCadastrarLogin && (
        <Aviso tipo="alerta">
          O servidor ainda não tem a chave que cria logins no Supabase, então o cadastro não vai
          funcionar. A lista e as caixas de setor funcionam normalmente. Quem cuida do servidor precisa
          acrescentar a chave secreta do projeto ao ambiente e reiniciar.
        </Aviso>
      )}

      <div className="campos">
        <Campo rotulo="Nome" valor={f.nome} ao={(v) => setF({ ...f, nome: v })} dica="Como aparece na trilha" />
        <Campo rotulo="E-mail" tipo="email" valor={f.email} ao={(v) => setF({ ...f, email: v })}
               dica="É com ele que a pessoa entra" />
        <div>
          <label htmlFor="senha-provisoria">Senha provisória</label>
          <div className="usuario-senha">
            <input id="senha-provisoria" type="text" value={f.senha} spellCheck={false} autoComplete="off"
                   onChange={(e) => { setF({ ...f, senha: e.target.value }); setCopiada(false); }} />
            <button type="button" title="Gerar outra senha" aria-label="Gerar outra senha"
                    className="so-icone" onClick={() => { setF({ ...f, senha: gerarSenha() }); setCopiada(false); }}>
              <Icone nome="recarregar" tamanho={16} peso="bold" />
            </button>
            <button type="button" title="Copiar a senha" aria-label="Copiar a senha" className="so-icone"
                    onClick={() => void copiar(f.senha).then(setCopiada)}>
              <Icone nome={copiada ? 'ok' : 'copiar'} tamanho={16} peso="bold" />
            </button>
          </div>
          <p className="usuario-dica">
            <Icone nome="senha" tamanho={13} /> Ao menos {SENHA_MINIMA} caracteres. Já vem gerada; a
            mensagem para enviar à pessoa aparece depois do cadastro.
          </p>
        </div>
      </div>

      <fieldset className="usuario-grupo">
        <legend>O que pode fazer</legend>
        <div className="usuario-opcoes">
          {PERFIS.map((p) => (
            <label key={p.valor} className={`opcao${f.papel === p.valor ? ' marcada' : ''}`}>
              <input type="radio" name="perfil-novo" value={p.valor} checked={f.papel === p.valor}
                     onChange={() => escolherPerfil(p.valor)} />
              <span className="opcao-texto">
                <strong>{p.nome}</strong>
                <span>{p.faz}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="usuario-grupo">
        <legend>O que pode ver</legend>
        <div className="usuario-opcoes">
          {COLUNAS_DE_SETOR.map((c) => {
            const travada = c.chave === 'administracao' && f.papel !== 'admin';
            const marcada = f.setores.includes(c.chave);
            return (
              <label key={c.chave} className={`opcao${marcada && !travada ? ' marcada' : ''}${travada ? ' travada' : ''}`}>
                <input type="checkbox" className="caixa" checked={marcada && !travada} disabled={travada}
                       onChange={() => setF({ ...f, setores: alternarSetor(f.setores, c.chave) })} />
                <span className="opcao-texto">
                  <strong><Icone nome={c.icone} tamanho={14} /> {c.nome}</strong>
                  <span>{travada ? 'Só para o perfil Administrador.' : c.resumo}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}

      <div className="usuario-acoes">
        <button className="primario" onClick={() => void enviar()}
                disabled={acao.ocupado || falta !== null || !podeCadastrarLogin}
                title={falta ?? undefined}>
          <Icone nome="acrescentar" tamanho={15} peso="bold" />
          {acao.ocupado ? 'Criando o acesso…' : 'Criar acesso'}
        </button>
        {falta && <span className="fraco">{falta}</span>}
      </div>
    </div>
  );
}

function BotaoDeCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [feito, setFeito] = useState<boolean | null>(null);
  return (
    <button type="button" className="primario" onClick={() => void copiar(texto).then(setFeito)}>
      <Icone nome={feito ? 'ok' : 'copiar'} tamanho={15} peso="bold" />
      {feito ? 'Copiada' : feito === false ? 'Não deu para copiar — selecione o texto' : rotulo}
    </button>
  );
}

