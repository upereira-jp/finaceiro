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

// ============================================================================
// A TELA COMEÇA PELO QUE FALTA (01/10/2026, etapa 7a do redesenho)
//
// O Mês dizia «Contrato ativo (6 unidades)» e o link abria esta tela — que
// listava os 37 contratos que EXISTEM, sem cliente, sem usina, sem quem trouxe e
// sem busca. As seis unidades sem contrato não apareciam em lugar nenhum: para
// achá-las era preciso cruzar de cabeça Unidades consumidoras com esta lista. E
// cada uma das 37 linhas tinha «Suspender» e «Encerrar» à vista — 74 botões, o
// primeiro agindo num clique.
//
// AGORA, DE CIMA PARA BAIXO, NA ORDEM DO TRABALHO:
//
//   «Unidades sem contrato ativo (N)»   as faturáveis sem contrato ativo, com
//                                       cliente e usina, e «Criar contrato» que
//                                       abre o painel já na unidade. A lista sai
//                                       de `o-que-falta.ts`, com o MESMO
//                                       predicado da camada `contrato_ativo`;
//   «Contratos em vigor»                 a busca, os filtros, o «N de M» e a
//                                       tabela com Cliente, Usina e Quem trouxe o
//                                       cliente. Suspender e Encerrar moram no
//                                       menu «⋯» da linha, e os dois perguntam
//                                       na tela dizendo unidade E cliente;
//   «Quem traz clientes»                 o cadastro e o «quem é quem», no pé.
//
// E O ENDEREÇO RECORTA: `?pendencia=sem_contrato` mostra só o bloco do que
// falta, `?pendencia=sem_originador` só os contratos sem quem trouxe — com o
// «Mostrando só: …» dizendo o recorte, e o «x» devolvendo a tela inteira.

import { useState } from 'react';
import { api, type Contrato, type UnidadeConsumidora, type Originador, type Cliente,
  type VendedorDoCrm, type Usina } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, ThOrd, Marca, Icone, useOrdenacao, ordenar, rotulo, Escolha,
  BotaoDeCriar, PainelDeCriar, Busca, Ferramentas, Filtro, MostrandoSo, Menu, contem,
} from '../ui.tsx';
import type { TomDoSelo } from '../iconografia.ts';

/* O status do contrato no tom do selo (`TomDoSelo`). [30/09/2026, etapa 4a] O
 * que nao e `ativo` era vermelho; suspender e encerrar sao decisoes, nao falhas
 * — `neutro` —, e o rascunho e a tarefa de ativar — `a_fazer`. */
const tomDoContrato = (status: string): TomDoSelo =>
  (status === 'ativo' ? 'ok' : status === 'rascunho' ? 'a_fazer' : 'neutro');
import { Ligacao } from '../rota.tsx';
import { paraCentavos, emReais } from '../dinheiro.ts';
import { diaEmBr, hojeEmSP } from '../formato.ts';
import { PerguntaNaTela } from '../serie.tsx';
import { podeCriarContrato, motivoDaTrava, deQuem, nomeDoAto, ROTULO_DO_ATO } from '../contrato-regras.ts';
import {
  unidadesSemContratoAtivo, quemTrouxeOMesmoCliente, contratoSemQuemTrouxe, type UnidadeSemContrato,
} from '../o-que-falta.ts';
import { FILTROS_DA_TELA, filtroDaConsulta, rotuloDoRecorte, esquecerORecorte } from '../destino-da-camada.ts';

/** O nome da usina como a pessoa a chama: o apelido, senão o código. */
const nomeDaUsina = (u: Usina | undefined): string | null =>
  (u ? (u.apelido?.trim() || `Usina ${u.codigo_geradora}`) : null);

export function TelaContratos() {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  /* `escopo=todos` (etapa 7a): o nome do cliente aparece em toda linha, e o
     recorte padrao da rota (`carteira_ativa`) deixaria sem nome o cliente de
     um contrato suspenso numa unidade que saiu da carteira. */
  const clientes = useDados<Cliente[]>(() => api.get('/clientes?escopo=todos&limite=500'));
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  const origs = useDados<Originador[]>(() => api.get('/originadores'));
  const acao = useAcao();

  const [ucId, setUcId] = useState('');
  const [origId, setOrigId] = useState('');
  const [fechamento, setFechamento] = useState(hojeEmSP);
  const [valor, setValor] = useState('');
  const { ordem, alternar } = useOrdenacao('cliente');
  /* LISTAR ANTES DE CRIAR (30/09/2026, etapa 4a): o formulario de contrato abria
     a tela, vazio, acima da lista — e o cadastro de quem traz clientes vinha
     espremido dentro dele. A lista vem primeiro; «Novo contrato» abre o painel. */
  const [criando, setCriando] = useState(false);
  /* [etapa 7a] QUEM ABRIU O PAINEL, quando foi o «Criar contrato» de uma
     unidade — o foco volta a ele. E a contagem de aberturas remonta o painel a
     cada unidade escolhida na lista, para o foco entrar de novo no primeiro
     campo vazio mesmo com o painel ja aberto. */
  const [devolverA, setDevolverA] = useState<string | null>(null);
  const [aberturas, setAberturas] = useState(0);

  /* O RECORTE DO ENDERECO, lido so na montagem — depois quem manda e a tela,
     como em Unidades. `sem_contrato` mostra so o bloco do que falta;
     `sem_originador`, so os contratos sem quem trouxe. */
  const [recorte, setRecorte] = useState(() => filtroDaConsulta(location.search, FILTROS_DA_TELA['/contratos']));
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const tirarRecorte = () => { setRecorte(''); esquecerORecorte(); };

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

  /* OS NOMES, pelos ids que cada linha ja traz (etapa 7a). Cliente e usina das
     listas que a tela busca; quem trouxe, do proprio contrato quando o servidor
     o manda junto (`vigentesPorUC` inclui o originador) e da lista de quem traz
     clientes quando nao. */
  const clientePorId = new Map((clientes.dado ?? []).map((c) => [c.id, c.nome]));
  const usinaPorId = new Map((usinas.dado ?? []).map((u) => [u.id, u]));
  const origPorId = new Map((origs.dado ?? []).map((o) => [o.id, o]));
  const ucPorId = new Map((ucs.dado ?? []).map((u) => [u.id, u]));
  const nomes = {
    cliente: (id: string) => clientePorId.get(id) ?? null,
    usina: (id: string | null) => (id ? nomeDaUsina(usinaPorId.get(id)) : null),
  };
  const quemTrouxe = (k: Contrato): string | null =>
    k.originador?.nome ?? (k.originador_id ? origPorId.get(k.originador_id)?.nome ?? null : null);

  const semContrato = unidadesSemContratoAtivo(ucs.dado, vigentes.dado, nomes);

  const todas = Object.entries(vigentes.dado ?? {})
    .filter((par): par is [string, Contrato] => Boolean(par[1]))
    .map(([ucid, k]) => {
      const u = ucPorId.get(ucid);
      return {
        ucid, k, uc: u?.numero_uc ?? ucid,
        cliente: nomes.cliente(k.cliente_id), usina: nomes.usina(k.usina_id), quem: quemTrouxe(k),
        semQuem: contratoSemQuemTrouxe(k, u),
      };
    });
  const linhas = ordenar(
    todas.filter((l) =>
      (contem(l.uc, busca) || contem(l.cliente, busca) || contem(l.usina, busca) || contem(l.quem, busca))
      && (!situacao || l.k.status === situacao)
      && (recorte !== 'sem_originador' || l.semQuem)),
    ordem,
    {
      uc: (l) => l.uc,
      cliente: (l) => l.cliente,
      usina: (l) => l.usina,
      quem: (l) => l.quem,
      situacao: (l) => l.k.status,
      cheias: (l) => l.k.faturas_cheias_pagas,
    },
  );
  const quantosSemQuem = todas.filter((l) => l.semQuem).length;
  /* O QUE CADA RECORTE MOSTRA, decidido aqui e nao no meio do JSX: `sem_contrato`
     so o bloco do que falta (e ele fala mesmo vazio, para quem veio busca-lo);
     `sem_originador` so os contratos; sem recorte, o bloco quando ha o que
     mostrar e os contratos. */
  const soFalta = recorte === 'sem_contrato';
  const soSemQuem = recorte === 'sem_originador';
  const mostraFalta = Boolean(semContrato) && !soSemQuem && ((semContrato?.length ?? 0) > 0 || soFalta);

  /* A SUGESTAO DE QUEM TROUXE (etapa 7a) — o outro contrato do MESMO cliente.
     Oferecida, e nunca pre-selecionada: ver `quemTrouxeOMesmoCliente`. */
  const sugestao = uc && !origId ? quemTrouxeOMesmoCliente(uc.cliente_id, uc.id, vigentes.dado) : null;
  const sugerido = sugestao ? origPorId.get(sugestao.originador_id) : undefined;

  /** «Criar contrato» de uma unidade da lista do que falta: o painel abre já
   *  nela, com o resto em branco — quem trouxe não se adivinha. */
  function criarPara(s: UnidadeSemContrato) {
    acao.limpar();
    setUcId(s.uc_id); setOrigId(''); setValor('');
    setDevolverA(`criar-${s.uc_id}`);
    setAberturas((n) => n + 1);
    setCriando(true);
  }

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
    if (ok) {
      acao.anunciar(`Contrato da ${deQuem(uc.numero_uc, nomes.cliente(uc.cliente_id))} criado e ativado.`);
      setUcId(''); setValor(''); vigentes.recarregar();
      /* O foco segue para a lista do que falta, que é por onde a pessoa
         continua; sem ela (era a última), para o «Novo contrato». */
      setCriando(false);
      requestAnimationFrame(() => {
        (document.getElementById('sem-contrato-titulo') ?? document.getElementById('novo-contrato-gatilho'))?.focus();
      });
    }
  }

  const fecharPainel = () => setCriando(false);

  return (
    <Pagina titulo="Contratos"
            sub="Liga o cliente, a unidade, a usina e quem trouxe o cliente. É a peça que faz a cobrança existir: sem contrato ativo, aquela unidade fica fora do mês inteiro."
            acao={<BotaoDeCriar controla="novo-contrato" aberto={criando}
                                ao={() => { setDevolverA(null); acao.limpar(); setCriando(!criando); }}>
              Novo contrato
            </BotaoDeCriar>}>
      {criando && (
        <PainelDeCriar key={aberturas} id="novo-contrato" devolverA={devolverA}
                       titulo={uc ? `Novo contrato — ${deQuem(uc.numero_uc, nomes.cliente(uc.cliente_id))}` : 'Novo contrato'}
                       aoFechar={fecharPainel}>
          <div className="campos">
            <Campo rotulo="Unidade consumidora" porqueDe="contrato" valor={ucId} ao={setUcId}
                   opcoes={livres.map((u) => ({
                     valor: u.id,
                     texto: `${u.numero_uc}${nomes.cliente(u.cliente_id) ? ` · ${nomes.cliente(u.cliente_id)}` : ''}${u.usina_id ? '' : ' — sem usina'}`,
                   }))} />
            <Campo rotulo="Quem trouxe o cliente (obrigatório)" porqueDe="comissao" valor={origId} ao={setOrigId}
                   opcoes={(origs.dado ?? []).map((o) => ({ valor: o.id, texto: `${o.nome} · ${o.tipo}` }))} />
            <Campo rotulo="Data de fechamento" porqueDe="valor-da-comissao" valor={fechamento} ao={setFechamento} tipo="date" />
            <Campo rotulo="Valor de referência (R$)" porqueDe="valor-de-referencia" valor={valor} ao={setValor} dica="Ex. 789,00" />
          </div>
          {sugestao && sugerido && (
            <p className="ct-sugestao">
              <Icone nome="ajuda" tamanho={14} />
              <span>
                O outro contrato deste cliente (unidade {ucPorId.get(sugestao.uc_id)?.numero_uc ?? '—'}) foi
                trazido por <strong>{sugerido.nome}</strong>. Se esta unidade veio na mesma venda,{' '}
                <button type="button" className="em-link" onClick={() => setOrigId(sugerido.id)}>
                  usar {sugerido.nome}
                </button>
                .
              </span>
            </p>
          )}
          <p className="nota-do-painel">
            Quem trouxe o cliente <strong>não muda depois</strong>: se essa pessoa for promovida mais
            tarde, este contrato continua valendo o combinado de hoje. E a data de fechamento decide
            qual é o primeiro mês cobrado por inteiro.
            {valor && <> Valor: <strong>{(() => { try { return emReais(paraCentavos(valor)); } catch { return 'inválido'; } })()}</strong>.</>}
          </p>
          {trava === 'uc_sem_usina' && (
            /* ÂMBAR E NÃO VERMELHO (etapa 4a): unidade sem usina é cadastro a
               completar, e o caminho está na própria frase. */
            <Aviso tipo="alerta">
              Esta unidade ainda não tem usina. Escolha a usina e a fatia do cliente em <Ligacao para="/unidades">Unidades consumidoras</Ligacao> antes de criar o contrato.
            </Aviso>
          )}
          {/* A lista vazia e o estado de PRODUCAO de 08/09: zero originadores.
              Sem esta frase o select fica em "—" sem explicacao e o botao trava
              sem dizer por que. O erro de leitura tem aviso proprio e vem antes:
              lista vazia por falha nao e lista vazia por ausencia. */}
          {origs.erro && <Aviso tipo="erro">Não consegui carregar a lista de quem trouxe os clientes: {origs.erro}</Aviso>}
          {!origs.erro && !origs.carregando && (origs.dado ?? []).length === 0 && (
            <Aviso tipo="alerta">
              Ninguém cadastrado ainda como quem traz clientes — e o contrato não pode ser criado
              sem isso. Cadastre em <a href="#quem-traz-clientes">Quem traz clientes</a>, no pé desta
              tela. A escolha não muda depois, então ela precisa estar certa da primeira vez.
            </Aviso>
          )}
          {trava === 'sem_originador' && (origs.dado ?? []).length > 0 && (
            <Aviso tipo="alerta">
              Escolha quem trouxe o cliente. Isso não pode ser corrigido depois, e sem essa
              informação a comissão simplesmente não é paga quando o dinheiro entrar — sem aviso.
            </Aviso>
          )}
          {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
          <div className="painel-criar-pe">
            <button className="primario" onClick={criar} disabled={!podeCriarContrato(estado)}>
              <Icone nome="contratos" tamanho={15} peso="bold" /> Criar e ativar
            </button>
            <button type="button" onClick={fecharPainel}>Cancelar</button>
          </div>
        </PainelDeCriar>
      )}
      <RetornoDoAto texto={!criando && acao.sucesso} />

      <MostrandoSo rotulo={rotuloDoRecorte('/contratos', recorte)} aoRemover={tirarRecorte}
                   focarDepois={soFalta ? 'sem-contrato-titulo' : 'contratos-busca'} />

      {vigentes.erro && <Aviso tipo="erro">{vigentes.erro}</Aviso>}

      {/*
        O QUE FALTA VEM PRIMEIRO (etapa 7a). Só aparece com unidade na lista —
        e, no recorte `sem_contrato`, diz também quando ela está vazia: quem
        chegou de um link para «as que faltam» precisa ler que não falta nenhuma.
      */}
      {mostraFalta && semContrato && (
        <UnidadesSemContrato lista={semContrato} criar={criarPara}
                             reativado={() => vigentes.recarregar()} />
      )}

      {!soFalta && (
        <section className="ct-lista" aria-labelledby="contratos-titulo">
          <h2 id="contratos-titulo" tabIndex={-1}>Contratos em vigor</h2>
          <Ferramentas contagem={todas.length ? `${linhas.length} de ${todas.length} contratos` : undefined}>
            <Busca id="contratos-busca" valor={busca} ao={setBusca}
                   dica="Buscar por unidade, cliente ou usina…" />
            <Filtro valor={situacao} ao={setSituacao} rotulo="Filtrar por situação"
                    opcoes={[{ valor: '', texto: 'Todas as situações' },
                             { valor: 'ativo', texto: 'Ativos' },
                             { valor: 'suspenso', texto: 'Suspensos' }]} />
            <Filtro valor={soSemQuem ? recorte : ''}
                    ao={(v) => { if (v) setRecorte(v); else tirarRecorte(); }} rotulo="Filtrar por pendência"
                    opcoes={[{ valor: '', texto: 'Todas as pendências' },
                             { valor: 'sem_originador',
                               texto: `Sem quem trouxe o cliente${quantosSemQuem ? ` (${quantosSemQuem})` : ''}` }]} />
            {(busca || situacao || recorte) && (
              <button type="button" onClick={() => { setBusca(''); setSituacao(''); tirarRecorte(); }}>
                <Icone nome="limpar" tamanho={15} /> Limpar filtros
              </button>
            )}
          </Ferramentas>
          <Tabela cartoes="larga"
                  cabecalho={<>
                    <ThOrd chave="uc" ordem={ordem} ao={alternar}>Unidade</ThOrd>
                    <ThOrd chave="cliente" ordem={ordem} ao={alternar}>Cliente</ThOrd>
                    <ThOrd chave="usina" ordem={ordem} ao={alternar}>Usina</ThOrd>
                    <ThOrd chave="quem" ordem={ordem} ao={alternar}>Quem trouxe o cliente</ThOrd>
                    <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                    <ThOrd chave="cheias" ordem={ordem} ao={alternar} num>Cheias pagas</ThOrd>
                    <th><span className="so-leitor">Ações</span></th>
                  </>}
                  vazio={
                    // Os tres estados sao DIFERENTES e a frase tem que distingui-los.
                    // "Nenhum contrato" durante a carga, ou depois de uma falha, e a
                    // mesma mentira que o `catch` engolido contava.
                    vigentes.carregando ? 'Lendo os contratos…'
                    : vigentes.erro ? 'Não foi possível ler os contratos — o aviso acima diz por quê. Esta lista não está vazia: ela é desconhecida.'
                    : todas.length === 0 ? 'Nenhum contrato — e é isso que impede a primeira fatura.'
                    : soSemQuem && !busca && !situacao
                      ? 'Todo contrato ativo tem quem trouxe o cliente registrado.'
                      : 'Nenhum contrato corresponde à busca ou aos filtros.'
                  }>
            {linhas.map((l) => (
              <LinhaDoContrato key={l.ucid} k={l.k} uc={l.uc} cliente={l.cliente} usina={l.usina}
                               quem={l.quem} semQuem={l.semQuem} aoMudar={() => vigentes.recarregar()} />
            ))}
          </Tabela>
        </section>
      )}

      {/*
        QUEM TRAZ CLIENTES GANHOU LUGAR PRÓPRIO (30/09/2026, etapa 4a). O cadastro
        e o «quem é quem no outro sistema» moravam DENTRO do cartão de criar
        contrato, espremidos entre o botão e os avisos — e o cartão de criar saiu
        do alto da tela. Aqui, no pé, eles têm título, contagem e os mesmos dois
        atos. Continua sem aba própria no menu, pelo motivo de sempre: é nesta
        tela que quem trouxe o cliente importa.
      */}
      <section className="secao-de-pe" aria-labelledby="quem-traz-clientes">
        <h2 id="quem-traz-clientes">Quem traz clientes</h2>
        <p className="sub">
          {(origs.dado ?? []).length === 0
            ? 'Ninguém cadastrado ainda.'
            : `${(origs.dado ?? []).length} ${(origs.dado ?? []).length === 1 ? 'cadastrado' : 'cadastrados'}.`}
          {' '}O tipo decide a comissão, e fica congelado em cada contrato no dia em que ele é criado.
        </p>
        <div className="secao-de-pe-atos">
          <NovoOriginador aoCriar={() => origs.recarregar()} />
          <QuemEQuemNoOutroSistema originadores={origs.dado ?? []} aoCasar={() => origs.recarregar()} />
        </div>
      </section>
    </Pagina>
  );
}

/* ================================================ as unidades sem contrato
 *
 * A LISTA QUE NÃO EXISTIA (01/10/2026, etapa 7a). A unidade sem contrato é a
 * que NÃO tem linha na tabela de contratos — e por isso era invisível aqui.
 * Uma tabela curta, com o que se precisa para reconhecer a unidade (o número,
 * o cliente, a usina) e o ato: «Criar contrato» para a livre, «Reativar o
 * contrato» para a que tem contrato suspenso — esta continua ocupada (R14), e
 * oferecer criar daria 409 depois de preencher tudo.
 *
 * O botão é o COMUM, e não o laranja: o laranja da tela é o «Criar e ativar»
 * do painel, que é o ato de fato (One Orange). Seis botões laranja numa coluna
 * seriam seis atos principais, que é o mesmo que nenhum.
 */
function UnidadesSemContrato({ lista, criar, reativado }: {
  lista: readonly UnidadeSemContrato[];
  criar: (s: UnidadeSemContrato) => void;
  reativado: () => void;
}) {
  const acao = useAcao();
  const reativar = async (s: UnidadeSemContrato) => {
    if (!s.contrato_id) return;
    const ok = await acao.executar(() => api.post(`/contratos/${s.contrato_id}/ativar`, {}));
    if (ok) { acao.anunciar(`Contrato da ${deQuem(s.numero_uc, s.cliente)} reativado.`); reativado(); }
  };
  return (
    <section className="ct-falta" aria-labelledby="sem-contrato-titulo">
      <h2 id="sem-contrato-titulo" tabIndex={-1}>
        <Icone nome="a_fazer" tamanho={18} peso="bold" />
        Unidades sem contrato ativo <span className="ct-falta-n">({lista.length})</span>
      </h2>
      {lista.length === 0 ? (
        <Aviso tipo="ok">Toda unidade que fatura tem contrato ativo.</Aviso>
      ) : (
        <>
          <p className="sub">
            Faturam pelo outro sistema e ficam fora do mês inteiro aqui até ter contrato ativo.
            «Criar contrato» abre o formulário já na unidade.
          </p>
          {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
          <RetornoDoAto texto={acao.sucesso} />
          <Tabela cabecalho={<><th>Unidade</th><th>Cliente</th><th>Usina</th><th><span className="so-leitor">Ação</span></th></>}>
            {lista.map((s) => (
              <tr key={s.uc_id}>
                <td>
                  <strong>{s.numero_uc}</strong>
                  {s.motivo === 'suspenso' && <div className="uc-meta">contrato suspenso — ocupa a unidade</div>}
                </td>
                <td>{s.cliente ?? <span className="fraco">—</span>}</td>
                <td>
                  {s.usina ?? (
                    <span className="uc-falta-lista">
                      <Icone nome="a_fazer" tamanho={13} peso="bold" /> <span>Sem usina</span>
                    </span>
                  )}
                </td>
                <td className="c-aco ct-falta-ato">
                  {s.motivo === 'suspenso' ? (
                    <button type="button" id={`criar-${s.uc_id}`} disabled={acao.ocupado}
                            aria-label={nomeDoAto('reativar', s.numero_uc, s.cliente)}
                            onClick={() => void reativar(s)}>
                      <Icone nome="confirmar" tamanho={15} /> {ROTULO_DO_ATO.reativar}
                    </button>
                  ) : (
                    <button type="button" id={`criar-${s.uc_id}`}
                            aria-label={nomeDoAto('criar', s.numero_uc, s.cliente)}
                            onClick={() => criar(s)}>
                      <Icone nome="acrescentar" tamanho={15} peso="bold" /> {ROTULO_DO_ATO.criar}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        </>
      )}
    </section>
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
 * [01/10/2026, etapa 7a] OS DOIS MORAM NO MENU «⋯» DA LINHA, e os dois
 * PERGUNTAM. Eram 74 botões à vista nas 37 linhas, e «Suspender» agia num
 * clique — parar de faturar um cliente com um erro de mira. A pergunta diz a
 * unidade E o cliente («Encerrar o contrato da unidade 0254872026, de Ana
 * Lima?»), e o tom diz o peso: suspender é âmbar, sem primário — nada se
 * perde, e «Reativar» desfaz —; encerrar é perigo, com o botão contornado no
 * vermelho, porque não tem desfazer pela tela e zera o contador de faturas
 * cheias do próximo contrato. Reativar continua direto: anda para a frente, e
 * suspender de novo o desfaz.
 */
function LinhaDoContrato({ k, uc, cliente, usina, quem, semQuem, aoMudar }: {
  k: Contrato; uc: string; cliente: string | null; usina: string | null; quem: string | null;
  semQuem: boolean; aoMudar: () => void;
}) {
  const acao = useAcao();
  const [pergunta, setPergunta] = useState<'suspender' | 'encerrar' | null>(null);
  const quemE = deQuem(uc, cliente);
  const COLUNAS = 7;

  /* O FOCO VOLTA AO «⋯» DA LINHA quando a pergunta sai sem agir: o item do
     menu que a abriu já não existe, e sem isto o foco caía no `body`. */
  const voltarAoMenu = () => requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-menu-do-contrato="${k.id}"] .menu > button`)?.focus());
  const desistir = () => { setPergunta(null); voltarAoMenu(); };

  const suspender = async () => {
    setPergunta(null);
    const ok = await acao.executar(() => api.post(`/contratos/${k.id}/suspender`, {}));
    if (ok) { acao.anunciar(`Contrato da ${quemE} suspenso. A unidade continua ocupada por ele — «Reativar o contrato», no menu da linha, volta a faturar.`); aoMudar(); }
    voltarAoMenu();
  };

  const encerrar = async () => {
    setPergunta(null);
    const ok = await acao.executar(() => api.post(`/contratos/${k.id}/encerrar`, {}));
    if (ok) { acao.anunciar(`Contrato da ${quemE} encerrado. A unidade está livre para um contrato novo.`); aoMudar(); }
  };

  const reativar = async () => {
    const ok = await acao.executar(() => api.post(`/contratos/${k.id}/ativar`, {}));
    if (ok) { acao.anunciar(`Contrato da ${quemE} reativado.`); aoMudar(); }
    voltarAoMenu();
  };

  return (
    <>
      <tr>
        <td><strong>{uc}</strong></td>
        <td>{cliente ?? <span className="fraco">—</span>}</td>
        <td>{usina ?? <span className="fraco">—</span>}</td>
        <td>
          {quem ?? (semQuem ? (
            /* ÂMBAR, COM O LÁPIS: é a lacuna que a camada `originador_do_contrato`
               conta — e a comissão deste contrato não é paga enquanto ela durar. */
            <span className="uc-falta-lista">
              <Icone nome="a_fazer" tamanho={13} peso="bold" /> <span>Ninguém registrado</span>
            </span>
          ) : <span className="fraco">—</span>)}
        </td>
        <td className="c-sit">
          <Marca tom={tomDoContrato(k.status)}>{rotulo(k.status)}</Marca>
          <div className="uc-meta">fechado em {diaEmBr(k.data_fechamento)}</div>
        </td>
        <td className="num">{k.faturas_cheias_pagas}</td>
        <td className="c-aco ct-aco">
          <span data-menu-do-contrato={k.id} style={{ display: 'contents' }}>
            <Menu soIcone className="em-menu ct-menu" rotulo={nomeDoAto('menu', uc, cliente)}
                  gatilho={<><Icone nome="mais_acoes" tamanho={18} peso="bold" /><span className="ct-menu-texto">Mais ações</span></>}>
              {k.status === 'ativo' && (
                <button type="button" role="menuitem" disabled={acao.ocupado}
                        aria-label={`${nomeDoAto('suspender', uc, cliente)}…`}
                        onClick={() => setPergunta('suspender')}>
                  <Icone nome="neutro" tamanho={16} /> {ROTULO_DO_ATO.suspender}…
                </button>
              )}
              {k.status === 'suspenso' && (
                <button type="button" role="menuitem" disabled={acao.ocupado}
                        aria-label={nomeDoAto('reativar', uc, cliente)}
                        onClick={() => void reativar()}>
                  <Icone nome="confirmar" tamanho={16} /> {ROTULO_DO_ATO.reativar}
                </button>
              )}
              <button type="button" role="menuitem" className="perigo" disabled={acao.ocupado}
                      aria-label={`${nomeDoAto('encerrar', uc, cliente)}…`}
                      onClick={() => setPergunta('encerrar')}>
                <Icone nome="remover" tamanho={16} /> {ROTULO_DO_ATO.encerrar}…
              </button>
            </Menu>
          </span>
        </td>
      </tr>
      {pergunta === 'suspender' && (
        <tr className="linha-pergunta">
          <td colSpan={COLUNAS}>
            <PerguntaNaTela tom="aviso" rotulo={`Confirmar: suspender o contrato da ${quemE}`}
                            manter="Manter ativo" confirmar={ROTULO_DO_ATO.suspender}
                            ocupado={acao.ocupado}
                            aoManter={desistir} aoConfirmar={() => void suspender()}>
              Suspender o contrato da unidade <strong>{uc}</strong>
              {cliente && <>, de <strong>{cliente}</strong></>}? Ela deixa de ser faturada enquanto ele
              estiver suspenso, e continua ocupada por ele — nenhum contrato novo entra nela. Para voltar
              a faturar, «{ROTULO_DO_ATO.reativar}», no mesmo menu.
            </PerguntaNaTela>
          </td>
        </tr>
      )}
      {pergunta === 'encerrar' && (
        <tr className="linha-pergunta">
          <td colSpan={COLUNAS}>
            <PerguntaNaTela tom="perigo" rotulo={`Confirmar: encerrar o contrato da ${quemE}`}
                            manter="Manter o contrato" confirmar={ROTULO_DO_ATO.encerrar}
                            ocupado={acao.ocupado}
                            aoManter={desistir} aoConfirmar={() => void encerrar()}>
              Encerrar o contrato da unidade <strong>{uc}</strong>
              {cliente && <>, de <strong>{cliente}</strong></>}? A unidade fica livre para um contrato
              novo, e deixa de ser faturada por este. O contador de faturas cheias pagas
              ({k.faturas_cheias_pagas}) recomeça no contrato seguinte, e não há como desfazer isto
              pela tela.
            </PerguntaNaTela>
          </td>
        </tr>
      )}
      {acao.erro && <tr><td colSpan={COLUNAS}><Aviso tipo="erro">{acao.erro}</Aviso></td></tr>}
      {/* A LINHA DO RETORNO EXISTE SEMPRE (01/10/2026, etapa 5): vazia, ela nao
          ocupa altura; e e por existir antes da frase que o leitor de tela
          anuncia «Contrato suspenso» — ver "RetornoDoAto". */}
      <tr className="linha-retorno"><td colSpan={COLUNAS}><RetornoDoAto texto={acao.sucesso} /></td></tr>
    </>
  );
}

/* ============================================ quem e quem no outro sistema
 *
 * POR QUE ESTE PAINEL EXISTE, e o custo dele estava medido no relógio.
 *
 * A cada 15 minutos o sistema confere quem trouxe cada cliente contra o que o
 * outro sistema registrou, e comparava por NOME — porque não havia outro jeito.
 * Em 10/09/2026 isso produzia **29 avisos por rodada**, e agrupados eles eram:
 *
 *     26 x  aqui «Renata Ferreira Estevam»  ·  lá «Renata»
 *      2 x  aqui «Alice Ribeiro Franca»     ·  lá «Out Sales»
 *      1 x  uma divergência de verdade, enterrada no meio das outras
 *
 * **28 dos 29 eram a mesma pessoa com dois nomes.** Um painel que aponta 29
 * coisas todo dia é um painel que se aprende a não abrir — e a que importava era
 * a de baixo.
 *
 * ⚠️ POR QUE UMA LISTA E NÃO UM CAMPO PARA COLAR O IDENTIFICADOR: quem opera não
 * tem como descobrir o identificador de alguém no outro sistema. Um campo assim
 * seria «um campo que só o terminal alcança» com outra roupa, que é exatamente o
 * defeito que este projeto passou o dia fechando. Aqui a pessoa escolhe um nome
 * que existe lá, com quantas vendas cada um tem ao lado.
 *
 * E ELE MORA AQUI pela mesma razão que o cadastro de originador mora: não há aba
 * própria na barra, e é nesta tela que quem trouxe o cliente importa.
 */
function QuemEQuemNoOutroSistema({ originadores, aoCasar }: {
  originadores: readonly Originador[];
  aoCasar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const acao = useAcao();
  /* Só busca o outro sistema quando alguém abre — a leitura atravessa a rede até
     outro banco, e a maioria das visitas a esta tela é para criar contrato. */
  const vendedores = useDados<VendedorDoCrm[]>(
    () => (aberto ? api.get('/crm/vendedores') : Promise.resolve([])), [aberto]);

  const casar = async (o: Originador, crmUserId: string) => {
    const ok = await acao.executar(() => api.put(`/originadores/${o.id}/vendedor-do-crm`,
      { crm_user_id: crmUserId || null }));
    if (ok) {
      acao.anunciar(crmUserId
        ? `${o.nome} passou a ser reconhecido pelo cadastro, e não pelo nome.`
        : `${o.nome} voltou a ser conferido pelo nome.`);
      aoCasar();
    }
  };

  const semCasar = originadores.filter((o) => !o.crm_user_id).length;

  return (
    <div>
      <button type="button" className="botao-frase" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <Icone nome={aberto ? 'ordem_crescente' : 'ordem_decrescente'} tamanho={15} />{' '}
        Quem é quem no outro sistema
        {semCasar > 0 && originadores.length > 0 && (
          <> — <strong>{semCasar}</strong> ainda conferido{semCasar === 1 ? '' : 's'} por nome</>
        )}
      </button>

      {aberto && (
        <div className="cartao" style={{ marginTop: 8 }}>
          <p className="sub" style={{ marginTop: 0 }}>
            O sistema confere de hora em hora quem trouxe cada cliente contra o que está
            registrado do outro lado. Enquanto a ligação não é feita, ele compara pelo{' '}
            <strong>nome escrito</strong> — e o mesmo nome escrito de dois jeitos vira um aviso
            falso que reaparece o dia inteiro. Ligados, os dois cadastros passam a ser a mesma
            pessoa mesmo que um deles seja renomeado.
          </p>

          {vendedores.erro && (
            <Aviso tipo="alerta">
              Não deu para perguntar ao outro sistema quem vende por lá: {vendedores.erro}
            </Aviso>
          )}

          <Tabela vazio="Ninguém cadastrado ainda como quem traz clientes."
                  cabecalho={<><th>Aqui</th><th>É quem, no outro sistema</th></>}>
            {originadores.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.nome}</strong>
                  {!o.crm_user_id && (
                    <div className="fraco" style={{ fontSize: 12 }}>conferido pelo nome</div>
                  )}
                </td>
                <td>
                  {/* [01/10/2026, etapa 5] O SELETOR TEM NOME: era um `Campo` de
                      rótulo vazio, e o leitor de tela ouvia «caixa de seleção»
                      sem dizer de quem. O cabeçalho da coluna não chega a ele
                      linha por linha. */}
                  <Escolha rotuloAcessivel={`Quem é ${o.nome} no outro sistema`} primeira="—"
                         valor={o.crm_user_id ?? ''}
                         ao={(v) => void casar(o, v)}
                         opcoes={[
                           { valor: '', texto: '— ninguém ainda —' },
                           ...(vendedores.dado ?? []).map((v) => ({
                             valor: v.crm_user_id,
                             texto: `${v.vendedor} (${v.creditos} venda${v.creditos === 1 ? '' : 's'})`,
                           })),
                           /* O ESCOLHIDO SOBREVIVE À LISTA. Se quem já foi
                              ligado parar de aparecer do outro lado, a opção
                              some e o `<select>` cairia em "ninguém" sozinho —
                              desfazendo uma ligação que ninguém desfez. */
                           ...(o.crm_user_id
                               && !(vendedores.dado ?? []).some((v) => v.crm_user_id === o.crm_user_id)
                             ? [{ valor: o.crm_user_id, texto: 'ligado a alguém que não aparece mais lá' }]
                             : []),
                         ]} />
                </td>
              </tr>
            ))}
          </Tabela>

          {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
          <RetornoDoAto texto={acao.sucesso} />
        </div>
      )}
    </div>
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
      acao.anunciar(`${nome.trim()} cadastrado. Já aparece em «Quem trouxe o cliente», no Novo contrato.`);
      setNome(''); setDocumento(''); setAberto(false);
      aoCriar();
    }
  };

  if (!aberto) {
    /* Fechado depois de cadastrar, ele ainda diz que deu certo — o formulário
       some junto com a frase, e sem ela o clique pareceria não ter feito nada. */
    return (
      <>
        <button type="button" onClick={() => { acao.limpar(); setAberto(true); }}>
          <Icone nome="acrescentar" tamanho={15} /> Cadastrar quem traz clientes
        </button>
        <RetornoDoAto texto={acao.sucesso} />
      </>
    );
  }

  return (
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Cadastrar quem traz clientes</h3>
      <div className="campos">
        <Campo rotulo="Nome ou razão social" valor={nome} ao={setNome} />
        <Campo rotulo="CPF ou CNPJ" valor={documento} ao={setDocumento}
               dica="O dígito é conferido ao gravar" />
        <label>
          Pessoa
          <Escolha rotuloAcessivel="Pessoa (física ou jurídica)" valor={natureza} ao={setNatureza}
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
      <RetornoDoAto texto={acao.sucesso} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="primario" onClick={() => void criar()} disabled={acao.ocupado}>
          <Icone nome="confirmar" tamanho={15} peso="bold" /> Cadastrar
        </button>
        <button onClick={() => setAberto(false)} disabled={acao.ocupado}>Cancelar</button>
      </div>
    </div>
  );
}
