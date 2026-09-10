// CONTRATOS — a camada que bloqueia tudo, e a que so existe aqui.
//
// `contrato` NAO e espelhado do CRM, por desenho: a SPEC-002 2 espelha cliente,
// usina, usina_geracao e unidade_consumidora, e o contrato congela o tier do
// originador (R20-b) e guarda o contador de faturas cheias - decisoes do
// financeiro, nao do CRM. Consequencia medida em 28/07: producao tem 35 UCs e
// ZERO contratos, e por isso nenhuma fatura pode nascer.
//
// RASCUNHO E ATIVACAO SAO DOIS ATOS, e a tela nao os funde: ativar exige
// documento validado do cliente e ocupa a UC pela R14 (um contrato vigente por
// UC, e vigente inclui suspenso).
//
// O ORIGINADOR E OBRIGATORIO AQUI, e so aqui - Q-ORIGINADOR-01, decidida em
// 29/07/2026. A carteira LEVA originador e **nenhuma comissao foi paga a
// ninguem ainda**, entao o contador `faturas_cheias_pagas` nascer em 0 e o
// valor CERTO e a comissao esta inteira pela frente.
//
// A segunda frase e TESTEMUNHO do dono e nao medicao - nada nos dois sistemas
// registra comissao paga por fora. Os 29 clientes ATIVOS do CRM sao reais e nao
// a contradizem: cliente ativo diz que ele recebe credito, nao que alguem foi
// comissionado. O raciocinio inteiro esta em `contrato-regras.ts`, que e onde a
// regra mora.
//
// A exigencia mora na TELA e nao no banco, de proposito. `originador_id` segue
// nullable: um contrato sem comissao e um estado legitimo do dominio, e torna-lo
// NOT NULL decidiria por todos os tenants e por todo contrato futuro uma questao
// que foi respondida sobre 39 contratos desta carteira. O que o sistema ganha
// no lugar da constraint e a camada `originador_do_contrato` da prontidao, que
// ACUSA contrato ativo sem originador - deteccao no lugar de prevencao, como o
// CAT-8 e para o rls_auto_enable.
//
// O PRECO DE ERRAR AQUI NAO E SIMETRICO, e por isso o botao trava em vez de
// avisar: `src/repos/split.ts` so monta o item de comissao quando ha
// originador_id E tier congelado. Sem eles a reparticao roda, fecha e nao paga -
// sem erro, sem log, sem recusa. E nao ha desfazer: o campo so se escreve no
// `rascunhar`, porque a R20-b congela o tier no fechamento.

import { useState } from 'react';
import { api, type Contrato, type UnidadeConsumidora, type Originador, type Cliente } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, ThOrd, Marca, Icone, useOrdenacao, ordenar, rotulo, Escolha, linha,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { paraCentavos, emReais } from '../dinheiro.ts';
import { podeCriarContrato, motivoDaTrava } from '../contrato-regras.ts';

export function TelaContratos() {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const clientes = useDados<Cliente[]>(() => api.get('/clientes?limite=500'));
  const origs = useDados<Originador[]>(() => api.get('/originadores'));
  const acao = useAcao();

  const [ucId, setUcId] = useState('');
  const [origId, setOrigId] = useState('');
  const [fechamento, setFechamento] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState('');
  const { ordem, alternar } = useOrdenacao('uc');

  const uc = ucs.dado?.find((u) => u.id === ucId);

  // As condicoes moram em `contrato-regras.ts`, puras, porque o runner do web/
  // nao le JSX e regra sem teste e comentario (regra 8).
  const estado = {
    ucEscolhida: Boolean(uc), ucTemUsina: Boolean(uc?.usina_id),
    temOriginador: Boolean(origId), ocupado: acao.ocupado,
  };
  const trava = motivoDaTrava(estado);

  /*
   * Um contrato vigente por UC (R14). A lista mostra so as que estao livres:
   * oferecer a UC ocupada faria o erro sair como 409 depois de preencher tudo.
   *
   * ==========================================================================
   * UMA REQUISICAO, E NAO UMA POR UC — trocado em 14/08.
   *
   * Isto era: lista as UCs (1 requisicao) e depois **uma requisicao HTTP por
   * UC** para descobrir o contrato vigente de cada uma, seis em paralelo. Com as
   * 41 UCs de hoje sao 42 requisicoes; no teto atual de `?limite=500` sao 501, e
   * cada uma abre transacao, resolve login e consulta.
   *
   * `GET /contratos-vigentes` devolve o mapa `{uc_id: contrato}` numa consulta
   * so, servida pelo indice unico cheio `contrato_vigente_unico_por_uc` sobre a
   * coluna gerada `uc_vigente` — que e a mesma definicao de "vigente" que o
   * banco usa para impedir dois contratos na mesma UC.
   *
   * E O `catch` DE 404 SAIU JUNTO, com o comentario que o justificava: nao ha
   * mais 404 para engolir, porque nao ha mais uma requisicao por UC. O cuidado
   * que ele descrevia continua valendo em outros lugares e esta escrito no
   * cabecalho de `dados.ts`, que e onde ele pertence.
   *
   * `ucs.dado` NAO E REBUSCADO: a lista ja esta em maos logo acima, e pedi-la de
   * novo era a segunda requisicao que este trecho fazia sem precisar.
   */
  const vigentes = useDados<Record<string, Contrato | null>>(
    () => api.get<Record<string, Contrato | null>>('/contratos-vigentes'));

  // Enquanto `vigentes` nao respondeu - ou falhou -, NAO ha lista de livres.
  // `!vigentes.dado?.[u.id]` daria `true` para todas nesses dois estados, e a
  // tela ofereceria justamente as UCs ja contratadas.
  const livres = vigentes.dado
    ? (ucs.dado ?? []).filter((u) => u.status === 'ativa' && !vigentes.dado![u.id])
    : [];

  const numeroUc = (id: string) => ucs.dado?.find((x) => x.id === id)?.numero_uc ?? id;
  const linhas = ordenar(
    Object.entries(vigentes.dado ?? {})
      .filter((par): par is [string, Contrato] => Boolean(par[1]))
      .map(([ucid, k]) => ({ ucid, k })),
    ordem,
    {
      uc: (l) => numeroUc(l.ucid),
      fechamento: (l) => l.k.data_fechamento,
      situacao: (l) => l.k.status,
      cheias: (l) => l.k.faturas_cheias_pagas,
    },
  );

  // O botao ja trava sem originador; esta guarda existe porque `criar` e uma
  // funcao exportada pelo componente e nao pelo `disabled`, e uma tecla de
  // atalho ou um teste que a chamasse direto passaria por cima da UI.
  async function criar() {
    if (!uc || !origId) return;
    const ok = await acao.executar(async () => {
      // valor_referencia_centavos e Int em centavos - a regra 1 vale na UI
      // tambem, e a conversao aqui e por TEXTO, sem multiplicar por 100.
      const criado = await api.post<Contrato>('/contratos', {
        cliente_id: uc.cliente_id,
        unidade_consumidora_id: uc.id,
        usina_id: uc.usina_id,
        originador_id: origId,
        data_fechamento: fechamento,
        valor_referencia_centavos: paraCentavos(valor || '0'),
        valor_referencia_origem: 'local',
      });
      await api.post(`/contratos/${criado.id}/ativar`);
    });
    if (ok) { setUcId(''); setValor(''); acao.anunciar('Contrato criado e ativado.'); vigentes.recarregar(); }
  }

  return (
    <Pagina titulo="Contratos"
            sub="Liga o cliente, a unidade, a usina e quem trouxe o cliente. É a peça que faz a cobrança existir: sem contrato ativo, aquela unidade fica fora do mês inteiro.">
      <div className="cartao secao">
        <div className="campos">
          <Campo rotulo="Unidade consumidora" porqueDe="contrato" valor={ucId} ao={setUcId}
                 opcoes={livres.map((u) => ({
                   valor: u.id,
                   texto: `${u.numero_uc}${u.usina_id ? '' : ' (sem usina!)'}`,
                 }))} />
          <Campo rotulo="Quem trouxe o cliente (obrigatório)" porqueDe="comissao" valor={origId} ao={setOrigId}
                 opcoes={(origs.dado ?? []).map((o) => ({ valor: o.id, texto: `${o.nome} · ${o.tipo}` }))} />
          <Campo rotulo="Data de fechamento" porqueDe="valor-da-comissao" valor={fechamento} ao={setFechamento} tipo="date" />
          <Campo rotulo="Valor de referência (R$)" porqueDe="valor-de-referencia" valor={valor} ao={setValor} dica="Ex. 789,00" />
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 8 }}>
          Quem trouxe o cliente <strong>não muda depois</strong>: se essa pessoa for promovida mais
          tarde, este contrato continua valendo o combinado de hoje. E a data de fechamento decide
          qual é o primeiro mês cobrado por inteiro.
          {valor && <> Valor: <strong>{(() => { try { return emReais(paraCentavos(valor)); } catch { return 'inválido'; } })()}</strong>.</>}
        </p>
        <button className="primario" onClick={criar} disabled={!podeCriarContrato(estado)}>
          <Icone nome="contratos" tamanho={15} peso="bold" /> Criar e ativar
        </button>
        {trava === 'uc_sem_usina' && (
          <Aviso tipo="erro">
            Esta unidade ainda não tem usina. Escolha a usina e a fatia do cliente em <Ligacao para="/unidades">Unidades consumidoras</Ligacao> antes de criar o contrato.
          </Aviso>
        )}
        {/* A lista vazia e o estado de PRODUCAO hoje: zero originadores. Sem esta
            frase o select fica em "—" sem explicacao e o botao trava sem dizer
            por que - que e o defeito da tela de Contratos de novo, em outra
            casa. O erro de leitura tem aviso proprio e vem antes: lista vazia
            por falha nao e lista vazia por ausencia. */}
        {origs.erro && <Aviso tipo="erro">Não consegui carregar a lista de quem trouxe os clientes: {origs.erro}</Aviso>}
        {/* ATE 08/09/2026 ESTA FRASE MANDAVA PEDIR A OUTRA PESSOA. `POST
            /originadores` existia e so era alcancavel por `npm run originadores`
            — script rodado de um Codespace por quem tem o repositorio clonado.
            Nao ha aba «Originadores» na barra, e nunca houve.

            O CUSTO ESTAVA MEDIDO: 28 de 29 contratos ativos, e o que falta no
            29º e um originador que nao existe («Out Sales»). A tela EXIGE um do
            `<select>`, e a saida era pedir a alguem com terminal. E o defeito
            historico do projeto — «um campo que so o psql alcanca» — na tela que
            congela a aliquota de comissao para sempre (R20-b). */}
        {!origs.erro && !origs.carregando && (origs.dado ?? []).length === 0 && (
          <Aviso tipo="erro">
            Ninguém cadastrado ainda como quem traz clientes — e o contrato não pode ser criado
            sem isso. A escolha não muda depois, então ela precisa estar certa da primeira vez.
          </Aviso>
        )}
        <NovoOriginador aoCriar={() => origs.recarregar()} />
        {trava === 'sem_originador' && (origs.dado ?? []).length > 0 && (
          <Aviso tipo="alerta">
            Escolha quem trouxe o cliente. Isso não pode ser corrigido depois, e sem essa
            informação a comissão simplesmente não é paga quando o dinheiro entrar — sem aviso.
          </Aviso>
        )}
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {vigentes.erro && <Aviso tipo="erro">{vigentes.erro}</Aviso>}
      <Tabela cabecalho={<>
                <ThOrd chave="uc" ordem={ordem} ao={alternar}>Unidade</ThOrd>
                <ThOrd chave="fechamento" ordem={ordem} ao={alternar}>Fechamento</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                <ThOrd chave="cheias" ordem={ordem} ao={alternar} num>Cheias pagas</ThOrd>
                <th>Ações</th>
              </>}
              vazio={
                // Os tres estados sao DIFERENTES e a frase tem que distingui-los.
                // "Nenhum contrato" durante a carga, ou depois de uma falha, e a
                // mesma mentira que o `catch` engolido contava.
                vigentes.carregando ? 'Lendo os contratos…'
                : vigentes.erro ? 'Não foi possível ler os contratos — o aviso acima diz por quê. Esta lista não está vazia: ela é desconhecida.'
                : 'Nenhum contrato — e é isso que impede a primeira fatura.'
              }>
        {linhas.map(({ ucid, k }) => (
          <LinhaDoContrato key={ucid} k={k} uc={numeroUc(ucid)} aoMudar={() => vigentes.recarregar()} />
        ))}
      </Tabela>
    </Pagina>
  );
}

/* ===================================================== suspender e encerrar
 *
 * OS DOIS ATOS QUE NAO TINHAM TELA. `POST /contratos/:id/suspender` e
 * `/encerrar` existem desde 27/07/2026, e a varredura de 10/09 mediu: nenhuma
 * tela os chamava. A propria tela de Contratos mandava usa-los por escrito —
 * *"trocar depois exige encerrar e refazer o contrato"* — sem oferecer o
 * caminho.
 *
 * O QUE ISSO CUSTAVA NA OPERACAO: cliente que sai, contrato assinado errado e
 * troca do tipo de quem trouxe o cliente sao acontecimentos de rotina, e os tres
 * exigem encerrar. Sem tela, a unidade continuava sendo faturada todo mes ate
 * alguem com acesso ao servidor intervir.
 *
 * OS DOIS SAO SEPARADOS DE PROPOSITO, e a diferenca e a que o banco guarda:
 *
 *   suspender   para de faturar e a unidade CONTINUA OCUPADA - a R14 conta
 *               "vigente" incluindo suspenso, entao nao da para criar outro
 *               contrato na mesma unidade. E a pausa;
 *   encerrar    LIBERA a unidade (a coluna gerada `uc_vigente` vira nula
 *               sozinha), e e o que permite um contrato novo entrar. E o fim.
 *
 * ENCERRAR PEDE CONFIRMACAO E SUSPENDER NAO: encerrar zera o contador de faturas
 * cheias pagas do proximo contrato e nao tem desfazer pela tela; suspender se
 * desfaz reativando.
 */
function LinhaDoContrato({ k, uc, aoMudar }: { k: Contrato; uc: string; aoMudar: () => void }) {
  const acao = useAcao();

  const suspender = async () => {
    const ok = await acao.executar(() => api.post(`/contratos/${k.id}/suspender`, {}));
    if (ok) { acao.anunciar('Contrato suspenso. A unidade continua ocupada por ele.'); aoMudar(); }
  };

  const encerrar = async () => {
    if (!confirm(
      `Encerrar o contrato da unidade ${uc}?\n\n`
      + 'A unidade fica livre para um contrato novo, e ela deixa de ser faturada por este. '
      + 'O contador de faturas cheias pagas recomeça no contrato seguinte, e não há como '
      + 'desfazer isto pela tela.')) return;
    const ok = await acao.executar(() => api.post(`/contratos/${k.id}/encerrar`, {}));
    if (ok) { acao.anunciar('Contrato encerrado. A unidade está livre para um contrato novo.'); aoMudar(); }
  };

  const reativar = async () => {
    const ok = await acao.executar(() => api.post(`/contratos/${k.id}/ativar`, {}));
    if (ok) { acao.anunciar('Contrato reativado.'); aoMudar(); }
  };

  return (
    <>
      <tr>
        <td><strong>{uc}</strong></td>
        <td className="fraco">{k.data_fechamento?.slice(0, 10)}</td>
        <td><Marca tom={k.status === 'ativo' ? 'ok' : 'pendente'}>{rotulo(k.status)}</Marca></td>
        <td className="num">{k.faturas_cheias_pagas}</td>
        <td>
          <div style={{ ...linha, gap: 6 }}>
            {k.status === 'ativo' && (
              <button onClick={() => void suspender()} disabled={acao.ocupado}>
                <Icone nome="pendente" tamanho={14} /> Suspender
              </button>
            )}
            {k.status === 'suspenso' && (
              <button onClick={() => void reativar()} disabled={acao.ocupado}>
                <Icone nome="confirmar" tamanho={14} /> Reativar
              </button>
            )}
            <button onClick={() => void encerrar()} disabled={acao.ocupado}>
              <Icone nome="remover" tamanho={14} /> Encerrar
            </button>
          </div>
        </td>
      </tr>
      {acao.erro && <tr><td colSpan={5}><Aviso tipo="erro">{acao.erro}</Aviso></td></tr>}
      {acao.sucesso && <tr><td colSpan={5}><Aviso tipo="ok">{acao.sucesso}</Aviso></td></tr>}
    </>
  );
}

/* ================================================= cadastrar quem traz clientes
 *
 * O FORMULARIO QUE FALTAVA. `POST /originadores` existe desde 29/07/2026 e a
 * unica porta era `npm run originadores`; `PATCH` e `DELETE` nao tinham nem tela
 * nem script. Nao ha aba propria na barra e ele mora AQUI porque e aqui que a
 * falta aparece: a tela de Contratos exige um do `<select>` e travava sem dizer
 * onde arrumar.
 *
 * O TIPO E O CAMPO CARO, e por isso ele vem com a consequencia escrita ao lado:
 * a R20-b congela o tier no rascunho do contrato, e trocar depois exige encerrar
 * e renovar — o que zera o contador de faturas cheias e deixa na trilha uma
 * renovacao que nao houve.
 *
 * O DOCUMENTO E OBRIGATORIO (a coluna e NOT NULL) e o digito e conferido na
 * gravacao, entao numero inventado e recusado com nome — nao ha o que validar
 * aqui.
 */
function NovoOriginador({ aoCriar }: { aoCriar: () => void }) {
  const acao = useAcao();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [natureza, setNatureza] = useState('pf');
  const [tipo, setTipo] = useState('vendedor_g3');

  const criar = async () => {
    if (!nome.trim() || !documento.trim()) {
      acao.anunciar('Nome e CPF/CNPJ são obrigatórios.');
      return;
    }
    const ok = await acao.executar(() => api.post('/originadores', {
      nome: nome.trim(),
      documento_bruto: documento.trim(),
      natureza,
      tipo,
    }));
    if (ok) {
      acao.anunciar(`${nome.trim()} cadastrado. Já aparece na lista acima.`);
      setNome(''); setDocumento(''); setAberto(false);
      aoCriar();
    }
  };

  if (!aberto) {
    return (
      <p className="sub">
        <button type="button" onClick={() => setAberto(true)}>
          <Icone nome="acrescentar" tamanho={15} /> Cadastrar quem traz clientes
        </button>
      </p>
    );
  }

  return (
    <div className="cartao secao">
      <h3 style={{ marginTop: 0 }}>Quem traz clientes</h3>
      <div className="campos">
        <Campo rotulo="Nome ou razão social" valor={nome} ao={setNome} />
        <Campo rotulo="CPF ou CNPJ" valor={documento} ao={setDocumento}
               dica="O dígito é conferido ao gravar" />
        <label>
          Pessoa
          <Escolha rotuloAcessivel="Pessoa física ou jurídica" valor={natureza} ao={setNatureza}
                   opcoes={[{ valor: 'pf', texto: 'Pessoa física' },
                            { valor: 'pj', texto: 'Pessoa jurídica' }]} />
        </label>
        <label>
          Tipo
          <Escolha rotuloAcessivel="Tipo de quem traz o cliente" valor={tipo} ao={setTipo}
                   opcoes={[{ valor: 'vendedor_g3', texto: 'Vendedor da casa' },
                            { valor: 'terceirizado', texto: 'Terceirizado' },
                            { valor: 'parceiro_indicador', texto: 'Parceiro indicador' },
                            { valor: 'parceiro_captador', texto: 'Parceiro captador' },
                            { valor: 'parceiro_captador_senior', texto: 'Parceiro captador sênior' }]} />
        </label>
      </div>
      <p className="sub">
        <strong>O tipo decide a comissão</strong>, e ele fica congelado em cada contrato no momento
        em que o contrato é criado. Trocar depois exige encerrar e refazer o contrato — o que zera
        a contagem de meses cheios. Confira antes de gravar.
      </p>
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="primario" onClick={() => void criar()} disabled={acao.ocupado}>
          <Icone nome="confirmar" tamanho={15} peso="bold" /> Cadastrar
        </button>
        <button onClick={() => setAberto(false)} disabled={acao.ocupado}>Cancelar</button>
      </div>
    </div>
  );
}
