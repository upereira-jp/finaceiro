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

import { useState } from 'react';
import { api, type Contrato, type UnidadeConsumidora, type Originador, type Cliente } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Campo } from '../ui.tsx';
import { paraCentavos, emReais } from '../dinheiro.ts';

export function TelaContratos() {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const clientes = useDados<Cliente[]>(() => api.get('/clientes?limite=500'));
  const origs = useDados<Originador[]>(() => api.get('/originadores'));
  const acao = useAcao();

  const [ucId, setUcId] = useState('');
  const [origId, setOrigId] = useState('');
  const [fechamento, setFechamento] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState('');

  const uc = ucs.dado?.find((u) => u.id === ucId);

  // Um contrato vigente por UC (R14). A lista mostra so as que estao livres:
  // oferecer a UC ocupada faria o erro sair como 409 depois de preencher tudo.
  const vigentes = useDados<Record<string, Contrato | null>>(async () => {
    const todas = await api.get<UnidadeConsumidora[]>('/unidades-consumidoras?limite=500');
    const pares = await Promise.all(todas.map(async (u) => {
      try { return [u.id, await api.get<Contrato>(`/unidades-consumidoras/${u.id}/contrato-vigente`)] as const; }
      catch { return [u.id, null] as const; }
    }));
    return Object.fromEntries(pares);
  });

  const livres = (ucs.dado ?? []).filter((u) => u.status === 'ativa' && !vigentes.dado?.[u.id]);

  async function criar() {
    if (!uc) return;
    const ok = await acao.executar(async () => {
      // valor_referencia_centavos e Int em centavos - a regra 1 vale na UI
      // tambem, e a conversao aqui e por TEXTO, sem multiplicar por 100.
      const criado = await api.post<Contrato>('/contratos', {
        cliente_id: uc.cliente_id,
        unidade_consumidora_id: uc.id,
        usina_id: uc.usina_id,
        originador_id: origId || null,
        data_fechamento: fechamento,
        valor_referencia_centavos: paraCentavos(valor || '0'),
        valor_referencia_origem: 'local',
      });
      await api.post(`/contratos/${criado.id}/ativar`);
    });
    if (ok) { setUcId(''); setValor(''); acao.anunciar('contrato criado e ativado'); vigentes.recarregar(); }
  }

  return (
    <Pagina titulo="Contratos"
            sub="Vincula cliente, unidade consumidora, usina e originador. É entidade local: o conector não a espelha, e sem ela nenhuma fatura nasce.">
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campos">
          <Campo rotulo="unidade consumidora" valor={ucId} ao={setUcId}
                 opcoes={livres.map((u) => ({
                   valor: u.id,
                   texto: `${u.numero_uc}${u.usina_id ? '' : ' (sem usina!)'}`,
                 }))} />
          <Campo rotulo="originador (comissão)" valor={origId} ao={setOrigId}
                 opcoes={(origs.dado ?? []).map((o) => ({ valor: o.id, texto: `${o.nome} · ${o.tipo}` }))} />
          <Campo rotulo="data de fechamento" valor={fechamento} ao={setFechamento} tipo="date" />
          <Campo rotulo="valor de referência (R$)" valor={valor} ao={setValor} dica="ex. 789,00" />
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 8 }}>
          O tipo do originador <strong>congela</strong> no fechamento (R20-b): promover um parceiro depois
          não reprecifica este contrato. E a data de fechamento decide qual competência é a primeira
          <strong> fatura cheia</strong>.
          {valor && <> Valor: <strong>{(() => { try { return emReais(paraCentavos(valor)); } catch { return 'inválido'; } })()}</strong>.</>}
        </p>
        <button className="primario" onClick={criar}
                disabled={acao.ocupado || !uc || !uc.usina_id}>criar e ativar</button>
        {uc && !uc.usina_id && (
          <Aviso tipo="erro">Esta UC não tem usina vinculada. Defina o rateio em <a href="#unidades">Unidades</a> antes.</Aviso>
        )}
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {vigentes.erro && <Aviso tipo="erro">{vigentes.erro}</Aviso>}
      <Tabela cabecalho={<><th>UC</th><th>fechamento</th><th>situação</th><th className="num">cheias pagas</th></>}
              vazio="nenhum contrato — e é isso que impede a primeira fatura">
        {Object.entries(vigentes.dado ?? {}).filter(([, k]) => k).map(([ucid, k]) => {
          const u = ucs.dado?.find((x) => x.id === ucid);
          return (
            <tr key={ucid}>
              <td><strong>{u?.numero_uc ?? ucid}</strong></td>
              <td className="fraco">{k!.data_fechamento?.slice(0, 10)}</td>
              <td><span className={`marca ${k!.status === 'ativo' ? 'ok' : 'pendente'}`}>{k!.status}</span></td>
              <td className="num">{k!.faturas_cheias_pagas}</td>
            </tr>
          );
        })}
      </Tabela>
    </Pagina>
  );
}
