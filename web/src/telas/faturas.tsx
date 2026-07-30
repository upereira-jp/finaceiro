// FATURAS: o caminho que faltava na tela — emitir, pedir o boleto, dar baixa.
//
// POR QUE ESTA TELA EXISTE. O backend tinha o ciclo do dinheiro inteiro e a SPA
// parava em "compor rascunho": as rotas de emitir, de boleto e de baixa existiam
// e nao havia como chegar nelas sem `curl`. Quem opera nao tem `curl`, e o
// resultado pratico era um sistema que compunha faturas e nao cobrava ninguem.
//
// A ORDEM DA TELA E A ORDEM DOS ATOS, e ela e assim no servidor tambem:
//
//   compor (Carteira)  ->  emitir  ->  boleto  ->  baixa
//   rascunho               emitida     registrado   paga
//
// Cada passo tem precondicao de status, e as quatro estao em `cobranca-regras.ts`
// como ESPELHO do repositorio, com a linha citada. A tela nao decide nada: ela
// evita oferecer o botao que o servidor vai recusar. O servidor recusa de
// qualquer forma, e essa e a ordem certa.
//
// DUAS COISAS QUE PARECEM DETALHE E SAO DINHEIRO:
//
//   - o boleto pedido sem conector volta 412 NOMEADO, e sem certificado A1 volta
//     503 NOMEADO. A tela mostra a frase do servidor inteira, porque ela foi
//     escrita para quem opera. Trocar por "erro ao gerar" jogaria fora a unica
//     informacao util;
//   - a baixa manual e o UNICO gatilho de split que funciona hoje (PRD 5.2), e
//     ela exige o valor ao CENTavo. O total esperado e pre-enchido por
//     `totalEsperadoDaBaixa`, soma de inteiros, para que o caminho normal nao
//     seja um erro de servidor. E ela pede confirmacao: reparte dinheiro.

import { useState } from 'react';
import { api, type Fatura, type Boleto, type UnidadeConsumidora } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Marca, rotulo, linha, useOrdenacao, ordenar, ThOrd,
  Icone, CampoData, Carregando,
} from '../ui.tsx';
import { competenciaISO, emReais, paraCentavos } from '../dinheiro.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';
import {
  podeEmitirFatura, podeGerarBoleto, podeBaixarManual,
  totalEsperadoDaBaixa, tomDoStatusDaFatura,
} from '../cobranca-regras.ts';
import { ICONE_DO_STATUS_DA_FATURA } from '../iconografia.ts';

export function TelaFaturas() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [aberta, setAberta] = useState<string | null>(null);
  const acao = useAcao();
  const { ordem, alternar } = useOrdenacao('vencimento');

  const faturas = useDados<Fatura[]>(() => api.get(`/faturamento/${competenciaISO(mes)}`), [mes]);
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));

  // O NUMERO DA UC NAO VEM NA FATURA, e ele e a unica coluna que quem opera
  // reconhece: a fatura carrega `unidade_consumidora_id`, um uuid. O mapa e
  // montado aqui em vez de por uma requisicao por linha - com 39 UCs, 39
  // requisicoes prenderiam 39 conexoes do pool transacional (ver `emLotes`).
  const numeroDaUc = new Map((ucs.dado ?? []).map((u) => [u.id, u.numero_uc]));

  const lista = ordenar(faturas.dado ?? [], ordem, {
    uc: (f) => numeroDaUc.get(f.unidade_consumidora_id) ?? null,
    status: (f) => f.status,
    vencimento: (f) => f.vencimento,
    total: (f) => f.valor_total_centavos,
    consumo: (f) => Number(f.consumo_kwh ?? 0),
  });

  const recarregar = () => { faturas.recarregar(); };

  const emitir = (f: Fatura) => async () => {
    const ok = await acao.executar(() => api.post(`/faturas/${f.id}/emitir`));
    if (ok) { acao.anunciar(`Fatura da UC ${numeroDaUc.get(f.unidade_consumidora_id) ?? ''} emitida.`); recarregar(); }
  };

  const emitirLote = async () => {
    const rascunhos = lista.filter((f) => podeEmitirFatura(f.status)).length;
    if (!rascunhos) return;
    if (!confirm(
      `Emitir ${rascunhos} fatura(s) de ${mes} de uma vez?\n\n` +
      'Emitir é o ato que fecha o valor: depois dele a fatura não muda mais de valor, ' +
      'e é a partir daí que ela pode virar boleto.')) return;
    const ok = await acao.executar(() => api.post(`/faturamento/${competenciaISO(mes)}/emitir`));
    if (ok) { acao.anunciar(`${rascunhos} fatura(s) emitida(s).`); recarregar(); }
  };

  const exportar = () => {
    const csv = paraCsv<Fatura>([
      { titulo: 'UC', de: (f) => numeroDaUc.get(f.unidade_consumidora_id) ?? f.unidade_consumidora_id },
      { titulo: 'Competência', de: (f) => String(f.competencia).slice(0, 7) },
      { titulo: 'Status', de: (f) => f.status },
      { titulo: 'Vencimento', de: (f) => String(f.vencimento).slice(0, 10) },
      { titulo: 'Geração kWh', de: (f) => f.geracao_kwh_competencia ?? '' },
      { titulo: '% rateio', de: (f) => f.percentual_rateio_aplicado ?? '' },
      { titulo: 'Consumo kWh', de: (f) => f.consumo_kwh ?? '' },
      { titulo: 'Tarifa R$/kWh', de: (f) => f.tarifa_reais_por_kwh ?? '' },
      { titulo: 'Consumo R$', de: (f) => reaisParaPlanilha(f.valor_consumo_centavos) },
      { titulo: 'Concessionária R$', de: (f) => reaisParaPlanilha(f.valor_tarifas_concessionaria_centavos) },
      { titulo: 'Juros/multa R$', de: (f) => reaisParaPlanilha(f.valor_juros_multa_centavos) },
      { titulo: 'Total R$', de: (f) => reaisParaPlanilha(f.valor_total_centavos) },
      { titulo: 'Fatura cheia', de: (f) => (f.flag_fatura_cheia ? 'sim' : 'não') },
    ], lista);
    baixarCsv(nomeDoArquivo('faturas', mes), csv);
  };

  const rascunhos = lista.filter((f) => podeEmitirFatura(f.status)).length;

  return (
    <Pagina titulo="Faturas"
            sub="A competência inteira, linha por linha. Emitir fecha o valor; o boleto vem depois; a baixa é o único gatilho do split.">
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div style={{ ...linha, gap: 12 }}>
          <div>
            <label>Competência</label>
            <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Competência" style={{ width: 'auto' }} />
          </div>
          <div style={{ alignSelf: 'end', display: 'flex', gap: 8 }}>
            <button onClick={() => void emitirLote()} disabled={acao.ocupado || !rascunhos}>
              <Icone nome="emitir" tamanho={15} /> Emitir as {rascunhos} em rascunho
            </button>
            <button onClick={exportar} disabled={!lista.length}>
              <Icone nome="baixar" tamanho={15} /> Exportar CSV
            </button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {/*
        OS TRES ESTADOS DO VAZIO, distinguidos. E a licao da tela de Contratos
        (28/07): "nenhuma fatura" durante a carga, ou depois de uma falha de
        leitura, e a mesma mentira que um `catch` vazio conta.
      */}
      {faturas.erro && (
        <Aviso tipo="erro">
          Não foi possível ler as faturas: {faturas.erro} — esta lista não está vazia,
          ela é <strong>desconhecida</strong>.
        </Aviso>
      )}
      {ucs.erro && (
        <Aviso tipo="alerta">
          Falha ao ler as unidades consumidoras: {ucs.erro} — a coluna UC abaixo mostra o
          identificador interno em vez do número.
        </Aviso>
      )}

      <Tabela cabecalho={<>
                <ThOrd chave="uc" ordem={ordem} ao={alternar}>UC</ThOrd>
                <ThOrd chave="status" ordem={ordem} ao={alternar}>Status</ThOrd>
                <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                <ThOrd chave="consumo" ordem={ordem} ao={alternar} num>Consumo kWh</ThOrd>
                <ThOrd chave="total" ordem={ordem} ao={alternar} num>Total</ThOrd>
                <th>Ações</th>
              </>}
              vazio={faturas.carregando
                ? <Carregando texto="Lendo a competência…" />
                : faturas.erro
                  ? 'Lista desconhecida — o aviso acima diz por quê.'
                  : `Nenhuma fatura em ${mes}. Compor o lote é na aba Carteira.`}>
        {lista.map((f) => (
          <FaturaLinha key={f.id} f={f} uc={numeroDaUc.get(f.unidade_consumidora_id)}
                       aberta={aberta === f.id} abrir={() => setAberta(aberta === f.id ? null : f.id)}
                       emitir={emitir(f)} recarregar={recarregar} acao={acao} />
        ))}
      </Tabela>
    </Pagina>
  );
}

// ------------------------------------------------------------- a linha e o painel

function FaturaLinha(p: {
  f: Fatura; uc: string | undefined; aberta: boolean; abrir: () => void;
  emitir: () => Promise<void>; recarregar: () => void;
  acao: ReturnType<typeof useAcao>;
}) {
  const { f, acao } = p;
  return (
    <>
      <tr>
        <td><strong>{p.uc ?? f.unidade_consumidora_id.slice(0, 8)}</strong></td>
        <td>
          <Marca tom={tomDoStatusDaFatura(f.status)} icone={ICONE_DO_STATUS_DA_FATURA[f.status]}>
            {rotulo(f.status)}
          </Marca>
        </td>
        <td>{String(f.vencimento).slice(0, 10).split('-').reverse().join('/')}</td>
        <td className="num">{f.consumo_kwh ?? '—'}</td>
        <td className="num"><strong>{emReais(f.valor_total_centavos)}</strong></td>
        <td>
          <div style={{ ...linha, gap: 6 }}>
            {podeEmitirFatura(f.status) && (
              <button onClick={() => void p.emitir()} disabled={acao.ocupado}>
                <Icone nome="emitir" tamanho={14} /> Emitir
              </button>
            )}
            <button onClick={p.abrir} aria-expanded={p.aberta}>
              <Icone nome="boleto" tamanho={14} />
              {p.aberta ? 'Fechar' : 'Boleto e baixa'}
            </button>
          </div>
        </td>
      </tr>
      {p.aberta && (
        <tr>
          {/* O painel aberto recua para a terceira superficie da paleta: sem isso
              ele se confunde com a linha seguinte da tabela. `--fundo-suave` era
              um token que NAO EXISTIA - o fallback `transparent` estava em uso
              desde 29/07 sem ninguem notar. O nome certo e `--fundo-recuo`. */}
          <td colSpan={6} style={{ background: 'var(--fundo-recuo)' }}>
            <PainelDaFatura f={f} recarregar={p.recarregar} />
          </td>
        </tr>
      )}
    </>
  );
}

function PainelDaFatura({ f, recarregar }: { f: Fatura; recarregar: () => void }) {
  const acao = useAcao();
  // O 404 aqui e RESPOSTA - "esta fatura nao tem boleto" -, e o `useDados` poe
  // qualquer outro erro na tela. Mesma distincao da tela de Cobranca.
  const boleto = useDados<Boleto | null>(async () => {
    try { return await api.get<Boleto>(`/faturas/${f.id}/boleto`); }
    catch (e: any) { if (e?.status === 404) return null; throw e; }
  }, [f.id]);

  const [juros, setJuros] = useState('0');
  const [multa, setMulta] = useState('0');
  const [observacao, setObservacao] = useState('');

  // Centavos, inteiros. `paraCentavos` converte por TEXTO (regra 1) e levanta
  // `ValorInvalido` no que nao for valor - entao o total so e calculado quando os
  // dois campos sao validos, e nao com um `Number()` que devolveria NaN calado.
  let jurosCent = 0, multaCent = 0, valorInvalido: string | null = null;
  try { jurosCent = juros.trim() ? paraCentavos(juros) : 0; } catch (e: any) { valorInvalido = e.message; }
  try { multaCent = multa.trim() ? paraCentavos(multa) : 0; } catch (e: any) { valorInvalido = e.message; }
  const totalEsperado = totalEsperadoDaBaixa(f, jurosCent, multaCent);

  const gerarBoleto = async () => {
    const ok = await acao.executar(() => api.post(`/faturas/${f.id}/boleto`));
    if (ok) { acao.anunciar('Boleto registrado.'); boleto.recarregar(); recarregar(); }
  };

  const baixar = async () => {
    if (!confirm(
      `Dar baixa manual de ${emReais(totalEsperado)} nesta fatura?\n\n` +
      'A baixa é o evento de caixa: ela REPARTE o dinheiro na mesma transação — ' +
      'comissão do originador e repasse ao dono da usina. Não há caminho de estorno ' +
      'implementado (Q-ESTORNO-01).')) return;
    const ok = await acao.executar(() => api.post(`/faturas/${f.id}/baixa-manual`, {
      valor_liquidado_centavos: totalEsperado,
      juros_centavos: jurosCent,
      multa_centavos: multaCent,
      observacao: observacao.trim() || null,
      data_liquidacao: new Date().toISOString().slice(0, 10),
    }));
    if (ok) { acao.anunciar('Baixa registrada e split executado.'); boleto.recarregar(); recarregar(); }
  };

  return (
    <div style={{ padding: '12px 4px', display: 'grid', gap: 16 }}>
      {/* ------------------------------------------------------------- boleto */}
      <div>
        <h3><Icone nome="boleto" tamanho={16} /> Boleto</h3>
        {boleto.erro && <Aviso tipo="erro">Falha ao ler o boleto: {boleto.erro}</Aviso>}
        {!boleto.carregando && !boleto.erro && !boleto.dado && (
          <p className="sub" style={{ margin: '0 0 8px' }}>
            Esta fatura não tem boleto. {podeGerarBoleto(f.status, null)
              ? 'Pedir o boleto chama o banco pela porta de cobrança — sem conector ativo a resposta é 412, e sem certificado A1 é 503. As duas são nomeadas.'
              : `Só fatura emitida ganha boleto, e esta está em "${rotulo(f.status)}".`}
          </p>
        )}
        {boleto.dado && (
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div style={{ ...linha, gap: 10 }}>
              <Marca tom={boleto.dado.status === 'liquidado' ? 'ok' : boleto.dado.status === 'erro' ? 'pendente' : 'nao_medido'}>
                {rotulo(boleto.dado.status)}
              </Marca>
              <span className="fraco">nosso número {boleto.dado.nosso_numero ?? '—'}</span>
              <span className="fraco">{emReais(boleto.dado.valor_registrado_centavos)}</span>
              {boleto.dado.tentativas > 0 && <span className="fraco">{boleto.dado.tentativas} tentativa(s)</span>}
            </div>
            {boleto.dado.linha_digitavel && (
              <CampoCopiavel rotuloTexto="Linha digitável" valor={boleto.dado.linha_digitavel} />
            )}
            {boleto.dado.pix_copia_e_cola && (
              <CampoCopiavel rotuloTexto="Pix copia e cola" valor={boleto.dado.pix_copia_e_cola} />
            )}
            {boleto.dado.ultimo_erro && (
              <Aviso tipo="erro">
                Último erro do banco: {boleto.dado.ultimo_erro}
                {/*
                  A FALHA DE REGISTRO COMMITA de proposito (repos/boleto.ts): sem
                  isso a tentativa desapareceria e ninguem saberia que houve.
                */}
              </Aviso>
            )}
          </div>
        )}
        {podeGerarBoleto(f.status, boleto.dado?.status ?? null) && (
          <button className="primario" style={{ marginTop: 8 }}
                  onClick={() => void gerarBoleto()} disabled={acao.ocupado}>
            {acao.ocupado
              ? <Icone nome="carregando" tamanho={15} />
              : <Icone nome="boleto" tamanho={15} peso="bold" />}
            Gerar boleto
          </button>
        )}
      </div>

      {/* -------------------------------------------------------- baixa manual */}
      {podeBaixarManual(f.status) && (
        <div>
          <h3><Icone nome="recebido" tamanho={16} /> Baixa manual</h3>
          <p className="sub" style={{ margin: '0 0 8px' }}>
            Para o dinheiro que entrou sem passar pelo boleto — Pix direto, transferência,
            conciliação na mão. O servidor exige o valor <strong>ao centavo</strong>:
            consumo + concessionária + juros + multa.
          </p>
          <div style={{ ...linha, gap: 12 }}>
            <div>
              <label>Juros (R$)</label>
              <input value={juros} onChange={(e) => setJuros(e.target.value)} style={{ width: 110 }} />
            </div>
            <div>
              <label>Multa (R$)</label>
              <input value={multa} onChange={(e) => setMulta(e.target.value)} style={{ width: 110 }} />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label>Observação</label>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
                     placeholder="quem pagou, por qual meio" />
            </div>
            <div style={{ alignSelf: 'end' }}>
              <button className="primario" onClick={() => void baixar()}
                      disabled={acao.ocupado || valorInvalido !== null}>
                <Icone nome="confirmar" tamanho={15} peso="bold" /> Baixar {emReais(totalEsperado)}
              </button>
            </div>
          </div>
          {valorInvalido && <Aviso tipo="erro">{valorInvalido}</Aviso>}
        </div>
      )}

      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
    </div>
  );
}

/** Linha digitável e Pix existem para serem COPIADOS. Um `<code>` que a pessoa
 *  seleciona à mão erra um dígito e o pagamento vai para outro lugar. */
function CampoCopiavel({ rotuloTexto, valor }: { rotuloTexto: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div style={{ ...linha, gap: 8 }}>
      <span className="fraco" style={{ minWidth: 120 }}>{rotuloTexto}</span>
      <code style={{ wordBreak: 'break-all', flex: '1 1 240px' }}>{valor}</code>
      <button onClick={() => {
        void navigator.clipboard?.writeText(valor);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}>
        {/* O icone TROCA ao copiar, e nao so o texto: e a confirmacao que se ve
            sem ler, e ela importa aqui porque o que foi copiado e uma linha
            digitavel — quem cola sem ter certeza paga o valor errado. */}
        <Icone nome={copiado ? 'ok' : 'copiar'} tamanho={14} peso="bold" />
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}
