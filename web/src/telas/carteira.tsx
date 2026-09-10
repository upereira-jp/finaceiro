// CARTEIRA: o ensaio do lote e a posição da competência.
//
// ENSAIO E VALENDO SAO BOTOES DIFERENTES, e nao um interruptor. E o mesmo
// desenho do `npm run ciclo` e do `npm run faturar`, que exigem `--ensaio` ou
// `--valendo` sem default: aqui o erro nao e uma linha a mais no banco, e
// cobranca emitida para a carteira inteira. Caminhos separados nao tem default
// para errar, e o botao de valendo pede confirmacao explicita.

import { useState } from 'react';
import { api, type PosicaoDaCarteira } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, rotulo, linha, Kpi, Marca, Icone, CampoData, AjudaDoMes, DetalheTecnico} from '../ui.tsx';
import { competenciaISO, emReais } from '../dinheiro.ts';

type Resumo = {
  competencia: string; criadas: number; recusadas: number;
  recusas: Record<string, number>; alertas: Record<string, number>;
  detalhe: Array<{ numero_uc: string; motivo: string; explicacao: string }>;
};
/** O formato vive em `api.ts` desde 10/09/2026 — a tela de Pendências lê a
 *  mesma resposta para montar o roteiro do mês, e duas cópias discordariam. */
type Posicao = PosicaoDaCarteira;

export function TelaCarteira() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const acao = useAcao();
  const posicao = useDados<Posicao[]>(() => api.get('/carteira'));

  // Mais recente primeiro, de proposito: quem abre a carteira quer o mes
  // corrente, e o mes corrente no fim de uma lista crescente e o que some.
  const posicoes = [...(posicao.dado ?? [])]
    .sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
  const atual = posicoes[0];

  const rodar = (modo: 'ensaio' | 'compor') => async () => {
    if (modo === 'compor' && !confirm(
      `Compor as faturas de ${mes} VALENDO?\n\nIsto grava faturas em rascunho no banco. ` +
      'Emitir é um segundo ato, depois da conferência.')) return;
    const ok = await acao.executar(async () =>
      setResumo(await api.post<Resumo>(`/faturamento/${competenciaISO(mes)}/${modo}`)));
    if (ok && modo === 'compor') { acao.anunciar('Lote composto em rascunho.'); posicao.recarregar(); }
  };

  return (
    <Pagina titulo="Faturamento"
            sub="O caminho em LOTE, que cobra a partir da geração medida. Desde 21/08/2026 o caminho oficial é outro: a fatura nasce da conta da distribuidora, na aba Fatura unificada.">
      {/*
        ⚠️ ESTA TELA E O CAMINHO APOSENTADO, e ate 08/09/2026 nada dizia isso.
        Ela tem o nome mais obvio da barra («Faturamento»), o subtitulo dizia «onde
        a fatura do mes nasce» — falso desde a `Q-CICLO-01` — e o botao primario.
        A Central de Ajuda casava «gerar fatura», «faturar o mes» e «como faturo»
        com ELA.

        E o custo nao e de leitura: uma fatura composta por aqui BLOQUEIA a mesma
        unidade no caminho oficial, com `uc_ja_faturada`, e desfazer exige o
        cancelamento — que ate hoje nao tinha botao. Um clique curioso travava o
        mes.
      */}
      <Aviso tipo="alerta">
        <strong>Este não é o caminho da fatura que o cliente recebe.</strong> Ele cobra a partir
        da <strong>geração medida</strong> × rateio × tarifa, e o documento que sai não tem as
        sete faixas nem a economia acumulada. Desde 21/08/2026 a cobrança nasce da{' '}
        <strong>conta da distribuidora lida</strong>, na aba <strong>Fatura unificada</strong>.
        <br />
        <strong>Gerar as cobranças aqui trava o mês daquelas unidades</strong> no caminho oficial:
        a conta lida passa a ser recusada com «esta unidade já tem fatura», e desfazer é cancelar
        cada uma na aba Emissão e cobrança.
        <DetalheTecnico>
          <p style={{ margin: 0 }}>
            <code>POST /faturamento/:competencia/compor</code> → <code>fatura.comporLote</code> →{' '}
            <code>triar()</code>. O caminho oficial é <code>faturarRegistro</code>, e a guarda que
            colide é <code>uc_ja_faturada</code> em <code>triarRegistro</code>. A tela continua
            aqui porque é o único caminho de lote que existe, e porque as faturas já compostas por
            ele precisam de onde ser vistas — ver <code>Q-CICLO-01</code> e <code>Q-CICLO-02</code>.
          </p>
        </DetalheTecnico>
      </Aviso>
      {atual && (
        <div className="kpis">
          <Kpi nome={<>Faturado · {String(atual.competencia).slice(0, 7)}</>} icone="faturado"
               valor={emReais(atual.faturado_centavos)} />
          <Kpi nome="Recebido" icone="recebido" valor={emReais(atual.recebido_centavos)} />
          <Kpi nome="A receber" icone="a_receber" valor={emReais(atual.a_receber_centavos)} />
          <Kpi nome="Vencidas em aberto" icone="vencidas" valor={atual.vencidas_em_aberto}
               tom={atual.vencidas_em_aberto ? 'erro' : undefined} />
        </div>
      )}

      <div className="cartao secao">
        <div style={{ ...linha, gap: 12 }}>
          <div>
            <label>Mês de referência</label>
            <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }} /><AjudaDoMes />
          </div>
          <div style={{ alignSelf: 'end', display: 'flex', gap: 8 }}>
            {/*
              OS DOIS ROTULOS MUDARAM EM 21/08/2026, e sao os dois passos que
              fazem a fatura do mes existir — o lugar do sistema onde um nome
              obscuro custa mais caro.

              "Ensaio" era um SUBSTANTIVO, e substantivo nao diz o que o clique
              faz. Pior: a duvida que ele levanta é justamente a que impede
              alguem de clicar — «isto vai cobrar os clientes?». O rotulo novo
              responde antes de ser perguntado, e a resposta é nao.

              "Compor valendo" era vocabulario de dominio ("compor" é o nome do
              ato em `dominio/faturamento.ts`) somado a um adverbio que so faz
              sentido para quem conhece o par ensaio/valendo. O que a pessoa quer
              fazer ali é GERAR AS COBRANCAS do mes, e é isso que o botao diz.

              As rotas, o dominio e o `rodar('compor')` NAO mudaram: rotulo é o
              que a pessoa le, dominio é o que o sistema é.
            */}
            <button onClick={rodar('ensaio')} disabled={acao.ocupado}>
              <Icone nome="recarregar" tamanho={15} /> Simular, sem cobrar ninguém
            </button>
            {/* DEIXOU DE SER `primario` em 08/09/2026: o botao mais destacado da
                tela nao pode ser o do caminho aposentado. O ato continua
                disponivel — quem precisa do lote precisa dele. */}
            <button onClick={rodar('compor')} disabled={acao.ocupado}>
              <Icone nome="carteira" tamanho={15} /> Gerar as cobranças pelo caminho em lote
            </button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {resumo && (
        <>
          <div style={{ ...linha, gap: 10, marginBottom: 12 }}>
            <Marca tom="ok">{resumo.criadas} fatura(s)</Marca>
            <Marca tom={resumo.recusadas ? 'pendente' : 'ok'}>{resumo.recusadas} recusada(s)</Marca>
            {Object.entries(resumo.alertas).map(([a, n]) => (
              <Marca key={a} tom="nao_medido">{n} × {rotulo(a)}</Marca>
            ))}
          </div>
          {/*
            A RECUSA CARREGA O MOTIVO, e a contagem por motivo e o que traz
            problema a tona - foi assim que a Q-VALOR-01 apareceu no conector,
            em vez de virar 40 faturas erradas.
          */}
          {resumo.detalhe.length > 0 && (
            <Tabela cabecalho={<><th>Unidade</th><th>Motivo</th><th>O que significa</th></>}>
              {resumo.detalhe.slice(0, 60).map((d, i) => (
                <tr key={i}>
                  <td><strong>{d.numero_uc}</strong></td>
                  <td><Marca tom="pendente">{rotulo(d.motivo)}</Marca></td>
                  <td className="fraco" style={{ fontSize: 13 }}>{d.explicacao}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}

      <h2>Posição por mês de referência</h2>
      {posicao.erro && <Aviso tipo="erro">{posicao.erro}</Aviso>}
      <Tabela cabecalho={<>
                <th>Mês de referência</th><th className="num">Faturas</th><th className="num">Emitidas</th>
                <th className="num">Liquidadas</th><th className="num">Vencidas</th>
                <th className="num">Faturado</th><th className="num">Recebido</th><th className="num">A receber</th>
              </>}
              vazio="Nenhuma fatura ainda.">
        {posicoes.map((p) => (
          <tr key={p.competencia}>
            <td><strong>{String(p.competencia).slice(0, 7)}</strong></td>
            <td className="num">{p.faturas}</td>
            <td className="num">{p.emitidas}</td>
            <td className="num">{p.liquidadas}</td>
            <td className="num" style={{ color: p.vencidas_em_aberto ? 'var(--erro)' : undefined }}>{p.vencidas_em_aberto}</td>
            <td className="num">{emReais(p.faturado_centavos)}</td>
            <td className="num">{emReais(p.recebido_centavos)}</td>
            <td className="num">{emReais(p.a_receber_centavos)}</td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
