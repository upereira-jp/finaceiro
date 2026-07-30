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
import { api, ErroDaApi, type Contrato, type UnidadeConsumidora, type Originador, type Cliente } from '../api.ts';
import { emLotes, useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, ThOrd, Marca, Icone, useOrdenacao, ordenar, rotulo,
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

  // Um contrato vigente por UC (R14). A lista mostra so as que estao livres:
  // oferecer a UC ocupada faria o erro sair como 409 depois de preencher tudo.
  //
  // SO O 404 VIRA `null`. Um `catch` que engole tudo transformaria falha de rede,
  // 401 de token vencido e 500 em "esta UC nao tem contrato" - a armadilha que o
  // cabecalho do `dados.ts` descreve, com contrato como exemplo literal. O preco
  // seria pago aqui: a tabela mostraria "Nenhum contrato" com contratos no banco,
  // e a UC ja contratada voltaria para a lista de livres. Qualquer outro erro
  // sobe, e o `useDados` o poe na tela - o <Aviso> de `vigentes.erro` ja existia
  // esperando por ele, e nunca recebia nada.
  const vigentes = useDados<Record<string, Contrato | null>>(async () => {
    const todas = await api.get<UnidadeConsumidora[]>('/unidades-consumidoras?limite=500');
    const pares = await emLotes(todas, async (u) => {
      try {
        return [u.id, await api.get<Contrato>(`/unidades-consumidoras/${u.id}/contrato-vigente`)] as const;
      } catch (e: unknown) {
        if (e instanceof ErroDaApi && e.status === 404) return [u.id, null] as const;
        throw e;
      }
    });
    return Object.fromEntries(pares);
  });

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
            sub="Vincula cliente, unidade consumidora, usina e originador. É entidade local: o conector não a espelha, e sem ela nenhuma fatura nasce.">
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campos">
          <Campo rotulo="Unidade consumidora" valor={ucId} ao={setUcId}
                 opcoes={livres.map((u) => ({
                   valor: u.id,
                   texto: `${u.numero_uc}${u.usina_id ? '' : ' (sem usina!)'}`,
                 }))} />
          <Campo rotulo="Originador (comissão) — obrigatório" valor={origId} ao={setOrigId}
                 opcoes={(origs.dado ?? []).map((o) => ({ valor: o.id, texto: `${o.nome} · ${o.tipo}` }))} />
          <Campo rotulo="Data de fechamento" valor={fechamento} ao={setFechamento} tipo="date" />
          <Campo rotulo="Valor de referência (R$)" valor={valor} ao={setValor} dica="Ex. 789,00" />
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 8 }}>
          O tipo do originador <strong>congela</strong> no fechamento (R20-b): promover um parceiro depois
          não reprecifica este contrato. E a data de fechamento decide qual competência é a primeira
          <strong> fatura cheia</strong>.
          {valor && <> Valor: <strong>{(() => { try { return emReais(paraCentavos(valor)); } catch { return 'inválido'; } })()}</strong>.</>}
        </p>
        <button className="primario" onClick={criar} disabled={!podeCriarContrato(estado)}>
          <Icone nome="contratos" tamanho={15} peso="bold" /> Criar e ativar
        </button>
        {trava === 'uc_sem_usina' && (
          <Aviso tipo="erro">
            Esta UC não tem usina vinculada. Defina o rateio em <Ligacao para="/unidades">Unidades</Ligacao> antes.
          </Aviso>
        )}
        {/* A lista vazia e o estado de PRODUCAO hoje: zero originadores. Sem esta
            frase o select fica em "—" sem explicacao e o botao trava sem dizer
            por que - que e o defeito da tela de Contratos de novo, em outra
            casa. O erro de leitura tem aviso proprio e vem antes: lista vazia
            por falha nao e lista vazia por ausencia. */}
        {origs.erro && <Aviso tipo="erro">Falha ao ler os originadores: {origs.erro}</Aviso>}
        {!origs.erro && !origs.carregando && (origs.dado ?? []).length === 0 && (
          <Aviso tipo="erro">
            Nenhum originador cadastrado — e o contrato não pode ser criado sem um.
            O tipo congela aqui (R20-b) e não há edição depois. Cadastre pelo caminho da
            aplicação (<code>npm run originadores</code>) antes de digitar os contratos.
          </Aviso>
        )}
        {trava === 'sem_originador' && (origs.dado ?? []).length > 0 && (
          <Aviso tipo="alerta">
            Escolha o originador. Ele não é editável depois: <code>split.ts</code> só monta a
            comissão quando ele existe, e sem ele a repartição fecha sem pagar — sem erro e sem log.
          </Aviso>
        )}
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {vigentes.erro && <Aviso tipo="erro">{vigentes.erro}</Aviso>}
      <Tabela cabecalho={<>
                <ThOrd chave="uc" ordem={ordem} ao={alternar}>UC</ThOrd>
                <ThOrd chave="fechamento" ordem={ordem} ao={alternar}>Fechamento</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                <ThOrd chave="cheias" ordem={ordem} ao={alternar} num>Cheias pagas</ThOrd>
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
          <tr key={ucid}>
            <td><strong>{numeroUc(ucid)}</strong></td>
            <td className="fraco">{k.data_fechamento?.slice(0, 10)}</td>
            <td><Marca tom={k.status === 'ativo' ? 'ok' : 'pendente'}>{rotulo(k.status)}</Marca></td>
            <td className="num">{k.faturas_cheias_pagas}</td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
