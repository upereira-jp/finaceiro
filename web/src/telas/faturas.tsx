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
import {
  api, type Fatura, type Boleto, type UnidadeConsumidora,
  type BoletoLido, type ConferenciaDoBoletoImportado,
} from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Marca, rotulo, linha, useOrdenacao, ordenar, ThOrd,
  Icone, CampoData, Carregando, AjudaDoMes } from '../ui.tsx';
import { competenciaISO, emReais, paraCentavos } from '../dinheiro.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';
import { lerBase64, mimeDo, reenviavel, naMensagem } from '../arquivo.ts';
import {
  podeEmitirFatura, podeGerarBoleto, podeBaixarManual, podeImportarBoleto,
  motivoDaTravaDaImportacao, podeImportarAgora, DIGITOS_DA_LINHA,
  totalEsperadoDaBaixa, tomDoStatusDaFatura, conferirTarifas,
  type MotivoDeTravaDaImportacao,
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
    // A tarifa que falta entra na PERGUNTA, e nao so no aviso da tela: o aviso
    // fica acima da tabela e some quando alguem rola. Este texto e o ultimo lugar
    // antes do ato que obriga a cancelar para desfazer.
    const t = conferirTarifas(lista, (id) => numeroDaUc.get(id));
    if (!confirm(
      `Emitir ${rascunhos} fatura(s) de ${mes} de uma vez?\n\n` +
      'Emitir é o ato que fecha o valor: depois dele a fatura não muda mais de valor, ' +
      'e é a partir daí que ela pode virar boleto.' +
      (t.semTarifa === 0 ? '' :
        `\n\n⚠ ${t.semTarifa} de ${t.rascunhos} sairão SEM tarifa da concessionária — ` +
        'cobrando só o crédito injetado. Lançar as tarifas (`npm run tarifas`) só é ' +
        'possível em rascunho; depois de emitida a correção é cancelar e recompor.'))) return;
    const ok = await acao.executar(() => api.post(`/faturamento/${competenciaISO(mes)}/emitir`));
    if (ok) { acao.anunciar(`${rascunhos} fatura(s) emitida(s).`); recarregar(); }
  };

  const exportar = () => {
    const csv = paraCsv<Fatura>([
      { titulo: 'UC', de: (f) => numeroDaUc.get(f.unidade_consumidora_id) ?? f.unidade_consumidora_id },
      { titulo: 'Mes de referencia', de: (f) => String(f.competencia).slice(0, 7) },
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
  const tarifas = conferirTarifas(lista, (id) => numeroDaUc.get(id));

  return (
    <Pagina titulo="Emissão e cobrança"
            sub="O mês de referência inteiro, linha por linha. Emitir fecha o valor; o boleto vem depois; a baixa é o único gatilho do split. A folha que o cliente recebe se monta na aba Fatura unificada.">
      <div className="cartao secao">
        <div style={{ ...linha, gap: 12 }}>
          <div>
            <label>Mês de referência</label>
            <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }} /><AjudaDoMes />
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

        {/*
          A TARIFA DA CONCESSIONARIA QUE NAO FOI LANCADA — `Q-TARIFA-CONC-01`.

          Isto conta, e nao decide: uma competência pode legitimamente não levar
          tarifa da distribuidora, e essa pergunta tem dono e não é esta tela. O
          que não pode continuar é a ausência ser INVISÍVEL — `valor_total_centavos`
          é coluna gerada, a parcela ausente vale zero, e a fatura sai menor sem
          erro, sem log e sem recusa.
        */}
        {tarifas.semTarifa > 0 && (
          <Aviso tipo="alerta">
            <strong>{tarifas.semTarifa} de {tarifas.rascunhos} rascunho(s) sem tarifa da
            concessionária</strong> — sairiam cobrando <strong>só o crédito injetado</strong>.
            A ordem é <strong>compor → <code>npm run tarifas</code> → emitir</strong>: lançar as
            tarifas só é possível em rascunho, e depois de emitida a correção é cancelar e
            recompor, com motivo na trilha.
            <br />
            <span className="fraco" style={{ fontSize: 12 }}>
              UC: {tarifas.ucsSemTarifa.slice(0, 12).join(', ')}
              {tarifas.ucsSemTarifa.length > 12 ? `, +${tarifas.ucsSemTarifa.length - 12}` : ''}
              {' · '}Se esta competência realmente não leva tarifa da distribuidora, emitir está
              certo — é a pergunta (a) da <code>Q-TARIFA-CONC-01</code>.
            </span>
          </Aviso>
        )}
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
                ? <Carregando texto="Lendo o mês…" />
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
              {/*
                A ORIGEM AO LADO DO STATUS, e nao escondida no detalhe: "registrado"
                sozinho nao diz se o titulo esta na carteira de cobranca do banco
                por conta nossa ou porque uma pessoa o emitiu no portal. Quem
                precisa conferir um boleto no internet banking precisa saber qual
                dos dois - e a baixa pela API nao vale para o importado.
              */}
              {boleto.dado.origem === 'importado' && (
                <Marca tom="nao_medido" icone="baixar">emitido no banco</Marca>
              )}
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

      {/* ------------------------------------- o boleto emitido no banco (17/08) */}
      {podeImportarBoleto(f.status, boleto.dado?.status ?? null) && (
        <ImportarBoleto fatura={f} aoImportar={() => { boleto.recarregar(); recarregar(); }} />
      )}

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

// -------------------------------------------- IMPORTAR O BOLETO DO BANCO (17/08)
//
// POR QUE ESTE BLOCO EXISTE, e por que ele fica AQUI e não na aba Documento.
//
// "Gerar boleto" logo acima chama a Sicoob pela porta de cobrança, e a porta
// depende do certificado A1 — a única pendência do projeto, e compra externa. Sem
// ele a resposta é 503 nomeado, e a operação faz o que já fazia: emite o boleto à
// mão no internet banking da cooperativa e manda o PDF ao cliente. Esse boleto é
// real. O sistema é que não sabia dele — a fatura dizia "sem boleto", o documento
// saía cobrando por Pix estático (que não concilia) e a conferência aritmética
// nunca rodava.
//
// A ABA CERTA É ESTA porque é a única onde um boleto pertence a UMA fatura. A aba
// Documento também lê boleto por imagem, e é outro ato: lá o boleto entra numa
// FOLHA que se compõe e se imprime, sem tocar a carteira — o registro de lá é
// `registro_de_fatura_unificada`, não `boleto`. Aqui o boleto vira estado da
// fatura: aparece no painel, entra no documento composto e é o que a baixa cobra.
//
// A CONFERÊNCIA É DO SERVIDOR, e a tela nunca a refaz. Os quatro dígitos
// verificadores, a remontagem dos 44 e a leitura do valor e do vencimento de
// dentro deles moram em `src/dominio/`. A tela conta dígitos — só isso — e mostra
// o que `POST /faturas/:id/boleto/conferir` respondeu.

const EXPLICACAO_DA_TRAVA: Record<MotivoDeTravaDaImportacao, string> = {
  ocupado: 'Trabalhando…',
  sem_linha: 'Cole a linha digitável do boleto, ou envie o PDF acima.',
  digitos_de_menos: '',   // a tela monta a frase com a contagem
  nao_conferida: 'Conferindo com o servidor…',
  recusada: 'O boleto não passou na conferência — o aviso acima diz por quê.',
};

function ImportarBoleto({ fatura, aoImportar }: { fatura: Fatura; aoImportar: () => void }) {
  const acao = useAcao();
  const [linhaDigitavel, setLinhaDigitavel] = useState('');
  const [nossoNumero, setNossoNumero] = useState('');
  const [pix, setPix] = useState('');
  const [lendo, setLendo] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [conferencia, setConferencia] = useState<ConferenciaDoBoletoImportado | null>(null);
  const [conferindo, setConferindo] = useState(false);

  const digitos = linhaDigitavel.replace(/\D/g, '');
  /*
   * A CONFERÊNCIA VALE PARA A LINHA QUE A PRODUZIU, e não para a que está no
   * campo agora. Sem esta comparação, corrigir um dígito depois de uma
   * conferência boa deixaria o botão aceso sobre um resultado velho — que é
   * exatamente o modo de falha que `nao_conferida` existe para fechar.
   */
  const conferida = conferencia && conferencia.digitos === digitos ? conferencia.aceita : null;
  const estado = { linha: linhaDigitavel, ocupado: acao.ocupado || lendo || conferindo, conferida };
  const motivo = motivoDaTravaDaImportacao(estado);

  /** O PDF do boleto, lido pelo mesmo extrator da aba Documento. É chamada PAGA
   *  ao modelo de visão, e por isso é opt-in: quem tem a linha à mão digita. */
  async function enviarPdf(f: File) {
    setLendo(true);
    setStatus(`Lendo ${f.name}…`);
    try {
      const lido = await api.post<BoletoLido>('/faturas/ler-boleto', {
        conteudo_base64: await lerBase64(f), tipo: mimeDo(f),
      });
      setLinhaDigitavel(lido.linha_digitavel);
      setNossoNumero(lido.nosso_numero);
      setPix(lido.pix_copia_e_cola);
      setConferencia(null);
      const n = lido.linha_digitavel.replace(/\D/g, '').length;
      setStatus(n === DIGITOS_DA_LINHA
        ? 'Boleto lido. Confira abaixo antes de importar.'
        : `Boleto lido, mas a linha saiu com ${n} dígitos — corrija abaixo.`);
    } catch (e) {
      setStatus(`Não foi possível ler: ${naMensagem(e)} Digite a linha à mão.`);
    } finally { setLendo(false); }
  }

  /** Pergunta ao servidor, sem gravar nada. É o caminho de relatório. */
  async function conferir() {
    setConferindo(true);
    try {
      setConferencia(await api.post<ConferenciaDoBoletoImportado>(
        `/faturas/${fatura.id}/boleto/conferir`,
        { linha_digitavel: linhaDigitavel, nosso_numero: nossoNumero, pix_copia_e_cola: pix },
      ));
    } catch (e) {
      setStatus(`Não foi possível conferir: ${naMensagem(e)}`);
      setConferencia(null);
    } finally { setConferindo(false); }
  }

  async function importar() {
    const ok = await acao.executar(() => api.post(`/faturas/${fatura.id}/boleto/importar`, {
      linha_digitavel: linhaDigitavel, nosso_numero: nossoNumero, pix_copia_e_cola: pix,
    }));
    if (ok) {
      acao.anunciar('Boleto importado. Ele é o que o documento desta fatura vai imprimir.');
      setLinhaDigitavel(''); setNossoNumero(''); setPix('');
      setConferencia(null); setStatus(null);
      aoImportar();
    }
  }

  return (
    <div>
      <h3><Icone nome="baixar" tamanho={16} /> Importar boleto emitido no banco</h3>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        Para o boleto que <strong>já existe</strong> — emitido à mão no portal da cooperativa
        enquanto o certificado A1 não chega. Nada aqui fala com a Sicoob: o título já está
        registrado lá, e o que entra é a transcrição dele. Depois de importado ele aparece no
        painel acima e é o que o documento desta fatura imprime, no lugar do Pix estático.
      </p>

      {/* O `input[type=file]` NU, e não um `<label>` disfarçado de botão: o
          `estilo.ts` já desenha o `::file-selector-button` do sistema, e um
          segundo desenho para o mesmo controle é a divergência que aparece
          quando o tema muda e só um dos dois acompanha. */}
      <div style={{ ...linha, gap: 12, marginBottom: 10 }}>
        <input type="file" accept="application/pdf,image/*" disabled={lendo}
               aria-label={`Enviar o PDF do boleto da fatura ${fatura.id.slice(0, 8)}`}
               onChange={(e) => reenviavel(e, (f) => void enviarPdf(f))} />
        <span className="fraco" style={{ fontSize: 13 }}>
          {lendo
            ? 'Lendo o arquivo…'
            : 'Opcional — a leitura por imagem é uma chamada paga. Com a linha à mão, digite.'}
        </span>
      </div>
      {status && <p className="sub" style={{ margin: '0 0 8px' }}>{status}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <label htmlFor={`linha-${fatura.id}`}>Linha digitável</label>
          <input id={`linha-${fatura.id}`} className="mono" value={linhaDigitavel}
                 onChange={(e) => setLinhaDigitavel(e.target.value)}
                 onBlur={() => { if (digitos.length === DIGITOS_DA_LINHA) void conferir(); }}
                 placeholder="75691.50043 01727.686907 00000.130013 1 15410000059669" />
          <span className="fraco" style={{ fontSize: 12 }}>
            {digitos.length === 0
              ? `${DIGITOS_DA_LINHA} dígitos — os pontos e espaços não contam.`
              : `${digitos.length} de ${DIGITOS_DA_LINHA} dígitos.`}
            {' '}O código de barras, o valor e o vencimento são <strong>derivados</strong> dela.
          </span>
        </div>
        <div style={{ ...linha, gap: 12 }}>
          <div style={{ flex: '0 0 180px' }}>
            <label htmlFor={`nn-${fatura.id}`}>Nosso número</label>
            <input id={`nn-${fatura.id}`} value={nossoNumero}
                   onChange={(e) => setNossoNumero(e.target.value)} placeholder="1-3" />
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <label htmlFor={`pix-${fatura.id}`}>Pix copia e cola do boleto</label>
            <input id={`pix-${fatura.id}`} className="mono" value={pix}
                   onChange={(e) => setPix(e.target.value)}
                   onBlur={() => { if (digitos.length === DIGITOS_DA_LINHA) void conferir(); }}
                   placeholder="00020101021126… — opcional" />
          </div>
        </div>
      </div>

      {/* ---------------------------------------- o que o servidor respondeu */}
      {conferencia && conferencia.digitos === digitos && (
        conferencia.aceita ? (
          <Aviso tipo="ok">
            Confere. O boleto cobra <strong>{emReais(conferencia.valor_centavos)}</strong>
            {conferencia.vencimento && <> e vence em{' '}
              <strong>{conferencia.vencimento.split('-').reverse().join('/')}</strong></>}
            {' '}— os dois lidos de dentro do código de barras, e os dois batem com esta fatura.
          </Aviso>
        ) : (
          <Aviso tipo="erro">
            {conferencia.frases.map((f, i) => <div key={i}>{f}</div>)}
          </Aviso>
        )
      )}

      <div style={{ marginTop: 10 }}>
        <button className="primario" onClick={() => void importar()}
                disabled={!podeImportarAgora(estado)}>
          <Icone nome={acao.ocupado ? 'carregando' : 'confirmar'} tamanho={15} peso="bold" />
          Importar boleto
        </button>
        {motivo && (
          <span className="fraco" style={{ marginLeft: 10, fontSize: 13 }}>
            {motivo === 'digitos_de_menos'
              ? `Faltam ${DIGITOS_DA_LINHA - digitos.length} dígito(s) para a linha ficar completa.`
              : EXPLICACAO_DA_TRAVA[motivo]}
          </span>
        )}
        {motivo === 'nao_conferida' && !conferindo && (
          <button style={{ marginLeft: 8 }} onClick={() => void conferir()}>
            <Icone nome="buscar" tamanho={14} /> Conferir
          </button>
        )}
      </div>

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
