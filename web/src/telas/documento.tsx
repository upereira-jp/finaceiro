// DOCUMENTO: a logo, os campos da fatura e a previa imprimivel.
//
// As cinco decisoes da `Q-DOCFATURA-01` chegam aqui na forma que a pessoa opera:
//   1. logo em bytea            -> `PUT /cobranca/logo`, base64 num JSON
//   2. campos CONFIGURAVEIS     -> reordenar, renomear, esconder
//   3. HTML agora               -> a previa E o documento; `window.print()` gera o PDF
//   4. entrega manual           -> o botao Imprimir. A rota do CRM ja existe e e a MESMA
//   5. QR Pix estatico sem A1   -> a faixa de pagamento, montada pelo servidor
//
// O QUE ESTA TELA NAO FAZ, e e o ponto do desenho: ela nao COMPOE o documento.
// A composicao - quais linhas, em que ordem, com que rotulo, e qual faixa de
// pagamento - esta em `src/repos/documento.ts`, no servidor. Esta tela pinta o que
// `GET /faturas/:id/documento` devolve, e o CRM vai consumir exatamente a mesma
// rota. Se a composicao morasse aqui, publicar para o CRM seria reescrever.
//
// DINHEIRO E DATA JA VEM FORMATADOS do servidor, e a tela NAO os reformata: duas
// formatacoes do mesmo valor e como duas telas passam a discordar. O que chega em
// `linha.valor` vai para a tela como esta.

import { useEffect, useRef, useState } from 'react';
import {
  api, buscarBinario,
  type IdentidadeDeCobranca, type ChavePix, type CampoDoDocumento, type DocumentoDaFatura, type Fatura,
  type QrDoDocumento, type QrDeConferencia, type BlocoComposto, type UnidadeConsumidora,
} from '../api.ts';
import { emLotes, useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Campo, Tabela, linha, rotulo, Icone, Interruptor, BotaoDeIcone, CampoData, Escolha, AjudaDoMes } from '../ui.tsx';
import { competenciaISO, paraCentavos, emReais } from '../dinheiro.ts';
import { mover, paraEnvio, type CampoConfigurado, type StatusFatura } from '../cobranca-regras.ts';
import {
  selecaoDoLote, separarComposicao, frasePreImpressao, STATUS_PADRAO_DO_LOTE, PORQUE_FORA,
  type Composicao, type ResultadoDaComposicao,
} from '../lote-de-documentos.ts';
import { escalaDaPrevia, regraDaPagina, ladoDoQr, PX_POR_MM } from '../layout-regras.ts';
import { useLargura } from '../medir-largura.ts';
import { EditorDeLayout, estiloDoBloco } from './layout-editor.tsx';

/** Os 16 do enum `campo_de_fatura` (migration 19). A tela nao inventa nome de
 *  campo: o banco recusaria, e o erro sairia do lado errado. */
const CAMPOS: Array<{ campo: string; rotulo: string }> = [
  { campo: 'competencia', rotulo: 'Mês de referência' },
  { campo: 'numero_uc', rotulo: 'Unidade consumidora' },
  { campo: 'cliente_nome', rotulo: 'Cliente' },
  { campo: 'cliente_documento', rotulo: 'CPF/CNPJ' },
  { campo: 'distribuidora', rotulo: 'Distribuidora' },
  { campo: 'usina_codigo_geradora', rotulo: 'Usina geradora' },
  { campo: 'geracao_kwh_competencia', rotulo: 'Geração da usina (kWh)' },
  { campo: 'percentual_rateio_aplicado', rotulo: 'Seu rateio (%)' },
  { campo: 'consumo_kwh', rotulo: 'Crédito injetado (kWh)' },
  { campo: 'tarifa_reais_por_kwh', rotulo: 'Tarifa (R$/kWh)' },
  { campo: 'valor_consumo_centavos', rotulo: 'Valor do crédito' },
  { campo: 'valor_tarifas_concessionaria_centavos', rotulo: 'Tarifas da concessionária' },
  { campo: 'valor_juros_multa_centavos', rotulo: 'Juros e multa' },
  { campo: 'valor_total_centavos', rotulo: 'TOTAL A PAGAR' },
  { campo: 'vencimento', rotulo: 'Vencimento' },
  { campo: 'flag_fatura_cheia', rotulo: 'Fatura cheia' },
];

const TETO_DA_LOGO = 512 * 1024;

export function TelaDocumento() {
  const acao = useAcao();
  const ident = useDados<IdentidadeDeCobranca | null>(() => api.get('/cobranca/identidade'));
  const cfg = useDados<CampoDoDocumento[]>(() => api.get('/cobranca/campos'));

  const chaves = useDados<ChavePix[]>(() => api.get('/cobranca/chaves-pix'));
  const [pix, setPix] = useState({ apelido: '', chave: '', tipo: 'cnpj', nome: '', cidade: '' });
  const [padrao, setPadrao] = useState<string>('');
  const [lista, setLista] = useState<CampoConfigurado[] | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // A identidade nao carrega mais a chave, so APONTA para ela (migration 25).
  // O formulario abaixo cadastra chave NOVA e nasce vazio de proposito: ele nao
  // edita a atual, e preenche-lo com ela convidaria a sobrescrever sem querer.
  useEffect(() => {
    if (!ident.dado) return;
    setPadrao(ident.dado.chave_pix_padrao_id ?? '');
  }, [ident.dado?.id, ident.dado?.atualizado_em]);

  // A configuracao VAZIA nao e lista vazia: e "usa o padrao". A tela mostra o
  // padrao marcado como tal, para ninguem achar que perdeu a configuracao.
  useEffect(() => {
    if (cfg.dado == null) return;
    setLista(cfg.dado.length === 0
      ? CAMPOS.filter((c) => c.campo !== 'flag_fatura_cheia').map((c) => ({ ...c, visivel: true }))
      : cfg.dado.map((c) => ({
          campo: c.campo,
          rotulo: c.rotulo ?? CAMPOS.find((x) => x.campo === c.campo)?.rotulo ?? c.campo,
          visivel: c.visivel,
        })));
  }, [cfg.dado]);

  // A logo NAO pode vir num `<img src="/api/...">`: a tag nao carrega o Bearer
  // nem o `x-tenant-id`, e a resposta seria 401. Vem por `buscarBinario` e virá
  // um object URL, revogado na saida - sem isso cada visita vaza um blob.
  useEffect(() => {
    if (!ident.dado?.logo_sha256) { setLogoUrl(null); return; }
    let vivo = true; let url: string | null = null;
    buscarBinario('/cobranca/logo')
      .then((b) => { if (vivo) { url = URL.createObjectURL(b); setLogoUrl(url); } })
      .catch(() => { if (vivo) setLogoUrl(null); });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [ident.dado?.logo_sha256]);

  const cadastrarChave = async () => {
    const ok = await acao.executar(() => api.post('/cobranca/chaves-pix', {
      apelido: pix.apelido || pix.nome, tipo: pix.tipo, chave: pix.chave,
      recebedor_nome: pix.nome, recebedor_cidade: pix.cidade,
    }));
    if (ok) {
      acao.anunciar('Chave cadastrada.');
      setPix({ apelido: '', chave: '', tipo: 'cnpj', nome: '', cidade: '' });
      chaves.recarregar();
    }
  };

  /* Escolher a padrao e um POST proprio, separado do cadastro. Sao dois atos: um
   * acrescenta destino possivel, o outro decide para onde o proximo lote vai
   * cobrar - e juntar os dois num botao so faria cadastrar mudar o destino das
   * faturas que ainda vao ser compostas, sem ninguem ter pedido. */
  /* QUEM EMITE, por extenso (migration 26). Nasce com o que ja esta gravado e
   * NAO vazio como o formulario da chave Pix: ali o campo vazio evita sobrescrever
   * a chave atual sem querer; aqui e o contrario, o valor e um so por tenant e
   * quem abre a tela esta editando o que existe. */
  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  useEffect(() => {
    if (!ident.dado) return;
    setRazaoSocial(ident.dado.razao_social ?? '');
    setCnpj(ident.dado.cnpj ?? '');
  }, [ident.dado?.razao_social, ident.dado?.cnpj]);

  const salvarEmissor = async () => {
    const ok = await acao.executar(() => api.post('/cobranca/identidade', {
      // A chave padrao viaja junto porque o POST e um UPSERT da linha inteira:
      // omiti-la apagaria a escolha de destino ao salvar o nome de quem recebe.
      chave_pix_padrao_id: ident.dado?.chave_pix_padrao_id ?? null,
      razao_social: razaoSocial.trim() || null,
      cnpj: cnpj.trim() || null,
    }));
    if (ok) { acao.anunciar('Emissor salvo.'); ident.recarregar(); }
  };

  const escolherPadrao = async (id: string) => {
    const ok = await acao.executar(() => api.post('/cobranca/identidade', {
      chave_pix_padrao_id: id || null,
    }));
    if (ok) { acao.anunciar('Chave padrão definida.'); ident.recarregar(); }
  };

  const enviarLogo = async (arquivo: File) => {
    if (arquivo.size > TETO_DA_LOGO) {
      acao.executar(async () => {
        throw new Error(`A imagem tem ${Math.round(arquivo.size / 1024)} KB e o teto é 512 KB — `
          + 'o mesmo teto do banco. Reduza antes de enviar.');
      });
      return;
    }
    const base64 = await new Promise<string>((res, rej) => {
      const l = new FileReader();
      l.onload = () => res(String(l.result));
      l.onerror = () => rej(new Error('não foi possível ler o arquivo'));
      l.readAsDataURL(arquivo);
    });
    const ok = await acao.executar(() => api.put('/cobranca/logo', { conteudo_base64: base64 }));
    if (ok) { acao.anunciar('Logo enviada.'); ident.recarregar(); }
  };

  const removerLogo = async () => {
    if (!confirm('Remover a logo? O documento volta a sair sem ela.')) return;
    const ok = await acao.executar(() => api.del('/cobranca/logo'));
    if (ok) { acao.anunciar('Logo removida.'); ident.recarregar(); }
  };

  const salvarCampos = async () => {
    if (!lista) return;
    const ok = await acao.executar(() => api.put('/cobranca/campos', { campos: paraEnvio(lista) }));
    if (ok) { acao.anunciar('Layout salvo.'); cfg.recarregar(); }
  };

  const voltarAoPadrao = async () => {
    if (!confirm('Voltar ao layout padrão? A sua configuração é apagada.')) return;
    const ok = await acao.executar(() => api.put('/cobranca/campos', { campos: [] }));
    if (ok) { acao.anunciar('Layout de volta ao padrão.'); cfg.recarregar(); }
  };

  const semIdentidade = !ident.carregando && !ident.erro && ident.dado == null;

  return (
    <Pagina titulo="Documento"
            sub="A logo, os campos e a prévia. É este documento que o cliente recebe — e a mesma rota que o CRM vai consumir.">

      {ident.erro && <Aviso tipo="erro">Não foi possível ler a identidade: {ident.erro}</Aviso>}
      {semIdentidade && (
        <Aviso tipo="alerta">
          <strong>Nenhuma identidade de cobrança cadastrada.</strong> Salve os dados abaixo primeiro —
          a logo pendura na identidade por chave estrangeira, e é ela que carrega a trilha de auditoria.
        </Aviso>
      )}
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}

      {/* -------------------------------------------------------- quem emite */}
      <div className="cartao" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}><Icone nome="cobranca" tamanho={17} /> Quem emite a fatura</h2>
        <p className="sub">
          Sai no <strong>cabeçalho</strong> e no <strong>rodapé</strong> da folha, e no campo
          <strong> Beneficiário</strong> da faixa de pagamento — é a este nome que o aviso contra o
          golpe do boleto amarra (<em>"confira sempre se o beneficiário é…"</em>). Sem ele cadastrado
          a folha sai <strong>sem a linha</strong>, e não com um travessão: um travessão ali treinaria
          exatamente o comportamento que o aviso quer impedir.
        </p>
        <div className="campos">
          <Campo rotulo="Razão social" valor={razaoSocial} ao={setRazaoSocial}
                 dica="Consórcio G3 Gestão de Energia Solar" />
          <Campo rotulo="CNPJ" valor={cnpj} ao={setCnpj} dica="Com ou sem máscara" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={() => void salvarEmissor()} disabled={acao.ocupado}>
              <Icone nome="confirmar" tamanho={15} peso="bold" /> Salvar emissor
            </button>
          </div>
        </div>
        <p className="sub" style={{ marginBottom: 0 }}>
          O CNPJ é conferido pelo <strong>dígito verificador</strong>, e não só pelo formato: este
          número sai impresso ao lado do aviso que manda o cliente conferir antes de pagar.
        </p>
      </div>

      {/* ------------------------------------------------------------- a logo */}
      <div className="cartao" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}><Icone nome="enviar" tamanho={17} /> Logo</h2>
        <p className="sub">
          <strong>PNG ou JPEG, até 512 KB.</strong> SVG é recusado de propósito: é documento com
          script dentro, e a logo é embutida no HTML do documento. O tipo é reconhecido pelos
          <strong> bytes do arquivo</strong>, não pela extensão — um SVG renomeado não passa.
        </p>
        <div style={{ ...linha, gap: 16 }}>
          {logoUrl
            ? <img src={logoUrl} alt="logo" style={{ maxHeight: 64, maxWidth: 240 }} />
            : <span className="fraco">Nenhuma logo.</span>}
          <input type="file" accept="image/png,image/jpeg" style={{ width: 'auto' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarLogo(f); }} />
          {ident.dado?.logo_sha256 && (
            <>
              <button onClick={() => void removerLogo()} disabled={acao.ocupado}>
                <Icone nome="remover" tamanho={15} /> Remover
              </button>
              <span className="fraco" style={{ fontSize: 12 }}>
                {ident.dado.logo_mime} · {Math.round((ident.dado.logo_bytes ?? 0) / 1024)} KB ·
                sha256 {ident.dado.logo_sha256.slice(0, 12)}…
              </span>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ o Pix do recebedor */}
      <div className="cartao" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}><Icone nome="pix" tamanho={17} /> Recebimento por Pix</h2>
        <p className="sub">
          Enquanto o certificado A1 não existir, a faixa de pagamento é um <strong>QR Pix
          estático</strong> gerado aqui. Chave Pix <strong>não é segredo</strong> — ela identifica o
          destino e sai impressa no documento; quem a tem consegue te pagar, não se autenticar como
          você. <strong>A conciliação é manual:</strong> um Pix estático não carrega identificador por
          fatura, então o dinheiro chega sem dizer de quem é — a baixa é na aba Faturas.
        </p>
        {/* AS CHAVES CADASTRADAS, e a escolha da padrao. O apelido e o que se
            escolhe: a chave em si nao se reconhece de cor, e conferir um CNPJ
            digito a digito na hora de faturar e onde o erro passa. */}
        {(chaves.dado ?? []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Campo rotulo="Chave usada ao compor o lote" valor={padrao}
                   ao={(v) => { setPadrao(v); void escolherPadrao(v); }}
                   opcoes={[{ valor: '', texto: '— nenhuma —' }].concat(
                     (chaves.dado ?? []).filter((c) => c.ativa).map((c) => ({
                       valor: c.id, texto: `${c.apelido} — ${c.chave}`,
                     })))} />
            <p className="sub" style={{ marginBottom: 0 }}>
              A fatura <strong>guarda a chave que usou</strong>: trocar aqui muda o próximo lote e
              não mexe no que já foi composto — a segunda via de uma fatura sai igual à primeira.
            </p>
          </div>
        )}

        <h3 style={{ marginBottom: 4 }}>Cadastrar uma chave</h3>
        <div style={{ ...linha, gap: 12 }}>
          <Campo rotulo="Apelido" valor={pix.apelido} ao={(v) => setPix({ ...pix, apelido: v })} />
          <Campo rotulo="Chave Pix" valor={pix.chave} ao={(v) => setPix({ ...pix, chave: v })} />
          <Campo rotulo="Tipo da chave" valor={pix.tipo} ao={(v) => setPix({ ...pix, tipo: v })}
                 opcoes={['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].map((t) => ({ valor: t, texto: t }))} />
          <Campo rotulo="Nome do recebedor (25)" valor={pix.nome} ao={(v) => setPix({ ...pix, nome: v })} />
          <Campo rotulo="Cidade (15)" valor={pix.cidade} ao={(v) => setPix({ ...pix, cidade: v })} />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={() => void cadastrarChave()} disabled={acao.ocupado}>
              <Icone nome={acao.ocupado ? 'carregando' : 'acrescentar'} tamanho={15} peso="bold" /> Cadastrar
            </button>
          </div>
        </div>
        <p className="sub" style={{ marginBottom: 0 }}>
          Os quatro campos são <strong>tudo ou nada</strong>: o banco recusa Pix pela metade, porque
          um BR Code sem nome de recebedor é aceito por alguns aplicativos e recusado por outros — e
          esse erro apareceria no celular do cliente.
        </p>
      </div>

      {/* -------------------------------------------------------- os campos */}
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div style={{ ...linha }}>
          <h2 style={{ margin: 0 }}><Icone nome="documento" tamanho={17} /> Campos do documento</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => void voltarAoPadrao()} disabled={acao.ocupado}>
              <Icone nome="recarregar" tamanho={15} /> Voltar ao padrão
            </button>
            <button className="primario" onClick={() => void salvarCampos()} disabled={acao.ocupado || !lista}>
              <Icone nome={acao.ocupado ? 'carregando' : 'confirmar'} tamanho={15} peso="bold" /> Salvar layout
            </button>
          </div>
        </div>
        <p className="sub">
          A ordem aqui é a ordem impressa. {cfg.dado?.length === 0 && (
            <><strong>Você ainda não configurou nada</strong> — a lista abaixo é o padrão, e salvar a
            transforma na sua configuração.</>
          )}
        </p>
        {cfg.erro && <Aviso tipo="erro">Falha ao ler o layout: {cfg.erro}</Aviso>}
        <Tabela cabecalho={<><th style={{ width: 90 }}>Ordem</th><th>Campo</th><th>Rótulo impresso</th><th style={{ width: 80 }}>Mostrar</th></>}
                vazio="Carregando…">
          {(lista ?? []).map((c, i) => (
            <tr key={c.campo}>
              <td>
                {/* As setas eram os caracteres ↑ e ↓ dentro de um botao de texto:
                    o desenho mudava com a fonte do sistema e nao tinham nome
                    acessivel nenhum. Agora sao Phosphor com `aria-label`. */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <BotaoDeIcone icone="subir" rotulo={`Subir ${c.rotulo}`}
                                ao={() => setLista(mover(lista!, i, -1))} desabilitado={i === 0} />
                  <BotaoDeIcone icone="descer" rotulo={`Descer ${c.rotulo}`}
                                ao={() => setLista(mover(lista!, i, 1))}
                                desabilitado={i === lista!.length - 1} />
                </div>
              </td>
              <td><code style={{ fontSize: 12 }}>{c.campo}</code></td>
              <td>
                {/* A classe `inline` vai num div e nao no `td`: `display: flex`
                    num td o retira do algoritmo de tabela, e a linha quebra. */}
                <div className="inline">
                  <input value={c.rotulo} aria-label={`Rótulo impresso de ${c.campo}`}
                         onChange={(e) => setLista(lista!.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)))} />
                </div>
              </td>
              <td>
                <Interruptor ligado={c.visivel} rotulo="" rotuloAcessivel={`Mostrar ${c.rotulo}`}
                             ao={(v) => setLista(lista!.map((x, j) => (j === i ? { ...x, visivel: v } : x)))} />
              </td>
            </tr>
          ))}
        </Tabela>
        {lista && lista.length < CAMPOS.length && (
          <div style={{ ...linha, gap: 8, marginTop: 12 }}>
            <span className="fraco" style={{ fontSize: 13 }}>Acrescentar:</span>
            {CAMPOS.filter((c) => !lista.some((x) => x.campo === c.campo)).map((c) => (
              <button key={c.campo} onClick={() => setLista([...lista, { ...c, visivel: true }])}>
                + {c.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* -------------------------------------------- a folha e as posicoes
          DEPOIS dos campos de proposito: o bloco `tabela_de_campos` pinta a
          lista de cima, entao a ordem na tela e a ordem da dependencia -
          escolher o que aparece, e so entao onde. */}
      <EditorDeLayout />

      {/* ANTES da Previa de proposito: a Previa exige fatura, e enquanto nao houver
          uma este painel e o unico caminho para o teste de campo do QR. Poe-lo
          embaixo esconderia a saida atras de um "Nenhuma fatura em ...". */}
      <ConferirQr temIdentidade={!!ident.dado} />

      <Previa logoUrl={logoUrl} />
    </Pagina>
  );
}

// ------------------------------------------------------------------- a previa
//
// A PREVIA E O DOCUMENTO, e nao uma aproximacao dele: ela pinta o retorno de
// `GET /faturas/:id/documento`, que e a mesma rota que o CRM vai consumir. Se as
// duas coisas divergissem, a previa deixaria de ser conferencia.

/**
 * CONFERIR O QR SEM FATURA.
 *
 * MEDIDO EM PRODUCAO em 30/07/2026, e e o motivo de este painel existir: havia
 * **0 contratos, 0 faturas e 39 UCs sem `data_vencimento`**. A Previa abaixo
 * precisa de uma fatura, entao o unico teste que nenhuma das 964 verificacoes
 * substitui — **ler o QR com uma camera** — estava atras de tres bloqueios que
 * dependem de insumo humano que ainda nao chegou: os CPF/CNPJ dos originadores,
 * os 39 contratos e a `data_vencimento` (`Q-SPEC001-02`).
 *
 * A coisa mais barata de conferir era a que menos podia ser conferida.
 *
 * NAO E UM "MODO DE TESTE": chama a MESMA funcao pura que a fatura chama
 * (`pixEstatico` + `svgDoBrCode`), com a identidade REAL do tenant. Um QR
 * desenhado por um caminho paralelo nao provaria nada sobre o de verdade. Nao
 * grava nada — a rota e GET e o repositorio pede `exigir('ler')`.
 */
function ConferirQr({ temIdentidade }: { temIdentidade: boolean }) {
  const [valor, setValor] = useState('123,45');
  const [pedido, setPedido] = useState<number | null>(null);
  const [erroDeLeitura, setErroDeLeitura] = useState<string | null>(null);

  const qr = useDados<QrDeConferencia | null>(
    async () => (pedido == null ? null : api.get<QrDeConferencia>(`/cobranca/qr-de-conferencia?valor_centavos=${pedido}`)),
    [pedido],
  );

  const conferir = () => {
    try {
      setErroDeLeitura(null);
      setPedido(paraCentavos(valor));
    } catch (e) {
      // A regra 1 na porta de entrada: reais viram centavos por TEXTO, e o valor
      // ilegivel para AQUI em vez de virar NaN na query.
      setErroDeLeitura(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="cartao naoimprime" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}><Icone nome="documento" tamanho={17} /> Conferir o QR com a câmera</h2>
      <p className="sub">
        Desenha um QR a partir da sua chave Pix e de um valor que você digita, <strong>sem precisar
        de fatura</strong>. É o teste de campo: as verificações automáticas provam que a matriz é um
        QR válido pelo padrão, e <strong>não</strong> provam que o aplicativo do banco aceita.
      </p>

      {!temIdentidade
        ? <Aviso tipo="alerta">
            Cadastre a identidade de cobrança acima primeiro — chave Pix, nome e cidade do recebedor.
            É de lá que o QR sai.
          </Aviso>
        : <>
            <div style={{ ...linha, alignItems: 'flex-end' }}>
              <Campo rotulo="Valor (R$)" valor={valor} ao={setValor} />
              <button className="primario" onClick={conferir} disabled={qr.carregando}>
                Desenhar o QR
              </button>
            </div>
            {erroDeLeitura && <Aviso tipo="erro">{erroDeLeitura}</Aviso>}
            {qr.erro && <Aviso tipo="erro">{qr.erro}</Aviso>}
            {qr.dado && (
              <>
                <Aviso tipo="alerta">{qr.dado.aviso}</Aviso>
                <Tabela cabecalho={<><th>Confira na tela do banco</th><th>Deve aparecer</th></>}>
                  <tr><td>Recebedor</td><td><strong>{qr.dado.recebedor}</strong></td></tr>
                  <tr><td>Cidade</td><td>{qr.dado.cidade}</td></tr>
                  <tr><td>Valor</td><td><strong>{emReais(qr.dado.valor_centavos)}</strong></td></tr>
                </Tabela>
                <Qr qr={qr.dado.qr} motivo={qr.dado.qr_motivo} rotulo="QR Code de conferência" />
                <p className="sub" style={{ marginTop: 8 }}>
                  Copia e cola, para testar o outro caminho:
                </p>
                <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{qr.dado.brcode}</code>
              </>
            )}
          </>}
    </section>
  );
}

function Previa({ logoUrl }: { logoUrl: string | null }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [faturaId, setFaturaId] = useState('');
  const [emLote, setEmLote] = useState(false);
  /* PADRAO `g3` desde 14/08: o modelo fixo e o destino decidido, e um destino que
   * nasce escondido atras de um interruptor desligado nao e destino. O editor de
   * blocos continua alcancavel enquanto a folha G3 nao tem as sete faixas. */
  const [modelo, setModelo] = useState<ModeloDoDocumento>('g3');

  const faturas = useDados<Fatura[]>(() => api.get(`/faturamento/${competenciaISO(mes)}`), [mes]);
  /*
   * O NUMERO DA UC NAO VEM NA FATURA, e ele e a unica coluna que quem opera
   * reconhece — o mesmo motivo (e o mesmo mapa) da tela de Faturas. Aqui ele
   * serve a duas coisas: o seletor deixa de listar uuid, e a UC que NAO compos
   * no lote pode ser procurada por um numero em vez de por um prefixo de id.
   */
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const numeroDaUc = new Map((ucs.dado ?? []).map((u) => [u.id, u.numero_uc]));
  const rotuloDaFatura = (f: Fatura) =>
    `${numeroDaUc.get(f.unidade_consumidora_id) ?? `fatura ${f.id.slice(0, 8)}`} · ${f.status}`;

  const doc = useDados<DocumentoDaFatura | null>(
    async () => (faturaId ? api.get<DocumentoDaFatura>(`/faturas/${faturaId}/documento`) : null),
    [faturaId],
  );

  return (
    <>
      <div className="cartao naoimprime" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}><Icone nome="imprimir" tamanho={17} /> Prévia</h2>
        <div style={{ ...linha, gap: 12 }}>
          <div>
            <label>Mês de referência</label>
            <CampoData mes valor={mes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }}
                       ao={(v) => { setMes(v); setFaturaId(''); }} /><AjudaDoMes />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <Interruptor ligado={emLote} ao={setEmLote}
                         rotulo={`Imprimir o mês inteiro${faturas.dado ? ` (${faturas.dado.length} fatura(s))` : ''}`} />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <Interruptor ligado={modelo === 'blocos'} ao={(v) => setModelo(v ? 'blocos' : 'g3')}
                         rotulo="Usar o layout configurável em vez do modelo G3" />
          </div>
        </div>

        {faturas.erro && <Aviso tipo="erro">Falha ao ler as faturas: {faturas.erro}</Aviso>}
        {ucs.erro && (
          <Aviso tipo="alerta">
            Falha ao ler as unidades consumidoras: {ucs.erro} — as faturas aparecem pelo
            identificador interno em vez do número da UC.
          </Aviso>
        )}
        {faturas.dado?.length === 0 && (
          <Aviso tipo="alerta">Nenhuma fatura em {mes} — compor o lote é na aba Carteira.</Aviso>
        )}

        {!emLote && (
          <div style={{ ...linha, gap: 12, marginTop: 12 }}>
            <div style={{ flex: '1 1 260px' }}>
              <label>Fatura</label>
              <Escolha valor={faturaId} ao={setFaturaId} rotuloAcessivel="Fatura"
                       primeira="Escolha uma fatura…"
                       opcoes={(faturas.dado ?? []).map((f) => ({
                         valor: f.id, texto: rotuloDaFatura(f),
                       }))} />
            </div>
            <div style={{ alignSelf: 'end' }}>
              <button className="primario" onClick={() => window.print()} disabled={!doc.dado}>
                <Icone nome="imprimir" tamanho={15} peso="bold" /> Imprimir / salvar PDF
              </button>
            </div>
          </div>
        )}
        {!emLote && doc.erro && <Aviso tipo="erro">Falha ao compor o documento: {doc.erro}</Aviso>}
      </div>

      {emLote
        ? <Lote faturas={faturas.dado ?? []} rotuloDaFatura={rotuloDaFatura} logoUrl={logoUrl} mes={mes} modelo={modelo} />
        : doc.dado && <Documento doc={doc.dado} logoUrl={logoUrl} modelo={modelo} />}
    </>
  );
}

/**
 * A IMPRESSAO EM LOTE — o que fechava o caminho da fatura pela ponta manual.
 *
 * O documento sempre pode sair; o que nao havia era sair em MASSA. Com 28
 * faturas na competencia, a previa de uma fatura por vez custa 28 selecoes e 28
 * impressoes, e o modo de falha de um trabalho manual repetido nao e o erro, e a
 * OMISSAO: ninguem percebe a que ficou sem imprimir.
 *
 * TRES COISAS DELIBERADAS, e as tres sao sobre contar:
 *
 *   - COMPOR E UM ATO SEPARADO de imprimir. Sao N requisicoes ao servidor, e
 *     dispara-las ao trocar de aba faria o lote acontecer sem ninguem pedir.
 *     Mesmo desenho do ensaio/valendo do faturamento;
 *   - UMA FALHA NAO DERRUBA AS OUTRAS E NAO SOME. `emLotes` rejeita o conjunto
 *     quando um item rejeita, e ali isso e o certo — aqui nao: 27 papeis de uma
 *     competencia de 28 e exatamente a omissao que este bloco existe para
 *     impedir. Entao cada composicao e capturada e CONTADA;
 *   - O QUE FICA DE FORA APARECE. `selecaoDoLote` separa por status com o motivo
 *     escrito, e incluir e um clique. O servidor nao tem opiniao sobre qual
 *     status imprime (`documento.paraFatura` compoe qualquer uma), entao
 *     descartar em silencio seria a tela inventando regra — regra 10.
 */
function Lote({ faturas, rotuloDaFatura, logoUrl, mes, modelo }: {
  faturas: readonly Fatura[];
  rotuloDaFatura: (f: Fatura) => string;
  logoUrl: string | null;
  mes: string;
  modelo: ModeloDoDocumento;
}) {
  const [incluidos, setIncluidos] = useState<StatusFatura[]>([...STATUS_PADRAO_DO_LOTE]);
  const [composicao, setComposicao] = useState<ResultadoDaComposicao<DocumentoDaFatura> | null>(null);
  const acao = useAcao();

  const selecao = selecaoDoLote(faturas, incluidos);

  // Trocar o mes ou a selecao invalida o que ja foi composto: imprimir uma pilha
  // montada para OUTRO conjunto e a falha silenciosa mais cara possivel aqui.
  useEffect(() => { setComposicao(null); }, [mes, incluidos]);

  const compor = async () => {
    const alvos = selecao.imprimir;
    if (!alvos.length) return;
    const ok = await acao.executar(async () => {
      const rs = await emLotes<Fatura, Composicao<DocumentoDaFatura>>(alvos, async (f) => {
        try {
          return { ok: true, doc: await api.get<DocumentoDaFatura>(`/faturas/${f.id}/documento`) };
        } catch (e: any) {
          return { ok: false, fatura_id: f.id, rotulo: rotuloDaFatura(f), erro: e?.message ?? String(e) };
        }
      });
      setComposicao(separarComposicao(rs));
    });
    if (ok) acao.anunciar(`${alvos.length} documento(s) pedidos ao servidor.`);
  };

  const alternarStatus = (s: StatusFatura) =>
    setIncluidos((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]));

  return (
    <>
      <div className="cartao naoimprime" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}><Icone nome="faturas" tamanho={16} /> O lote de {mes}</h3>

        {selecao.fora.length > 0 && (
          <Tabela cabecalho={<><th>Fora do lote</th><th>Quantas</th><th>Por quê</th><th /></>}>
            {selecao.fora.map((x) => (
              <tr key={x.status}>
                <td><strong>{rotulo(x.status)}</strong></td>
                <td className="num">{x.quantidade}</td>
                <td className="sub">{x.porque}</td>
                <td>
                  <button onClick={() => alternarStatus(x.status)}>
                    <Icone nome="acrescentar" tamanho={14} /> Incluir
                  </button>
                </td>
              </tr>
            ))}
          </Tabela>
        )}
        {incluidos.filter((s) => !STATUS_PADRAO_DO_LOTE.includes(s)).map((s) => (
          <Aviso key={s} tipo="alerta">
            <strong>{rotulo(s)}</strong> está no lote por escolha sua — {PORQUE_FORA[s]}.{' '}
            <button onClick={() => alternarStatus(s)}>Tirar do lote</button>
          </Aviso>
        ))}

        <p className="sub" style={{ marginTop: 12 }}>
          {frasePreImpressao({
            compostos: composicao ? composicao.compostos.length : selecao.imprimir.length,
            falhas: composicao?.falhas.length ?? 0,
            fora: selecao.fora.reduce((t, x) => t + x.quantidade, 0),
            total: selecao.total,
          })}
        </p>

        <div style={{ ...linha, gap: 8 }}>
          <button className={composicao ? '' : 'primario'} onClick={() => void compor()}
                  disabled={acao.ocupado || !selecao.imprimir.length}>
            {acao.ocupado ? <Icone nome="carregando" tamanho={15} /> : <Icone nome="documento" tamanho={15} peso="bold" />}
            {composicao ? 'Compor de novo' : `Compor os ${selecao.imprimir.length} documentos`}
          </button>
          <button className="primario" onClick={() => window.print()}
                  disabled={!composicao?.compostos.length}>
            <Icone nome="imprimir" tamanho={15} peso="bold" />
            Imprimir {composicao?.compostos.length ?? ''} / salvar PDF
          </button>
        </div>

        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}

        {/* A FALHA E NOMEADA POR UC, e nao contada em agregado: "1 documento
            falhou" manda procurar; "UC 000123 falhou: ..." manda consertar. */}
        {composicao && composicao.falhas.length > 0 && (
          <Aviso tipo="erro">
            {composicao.falhas.length} documento(s) NÃO compuseram e <strong>não</strong> estão
            na pilha abaixo:
            <ul style={{ margin: '6px 0 0' }}>
              {composicao.falhas.map((f) => (
                <li key={f.fatura_id}><strong>{f.rotulo}</strong> — {f.erro}</li>
              ))}
            </ul>
          </Aviso>
        )}
      </div>

      {composicao && composicao.compostos.length > 0 && (
        <Documentos docs={composicao.compostos} logoUrl={logoUrl} modelo={modelo} />
      )}
    </>
  );
}

/**
 * O documento em si. `id="documento"` e o alvo do CSS de impressao do `estilo.ts`.
 *
 * REESCRITO EM 03/08 COM A MIGRATION 23, e a mudanca e de natureza e nao de
 * aparencia: antes esta funcao ESCOLHIA o desenho - logo a esquerda, "FATURA" a
 * direita, tabela no meio, pagamento embaixo, tudo em JSX fixo. Agora ela pinta
 * `doc.layout`, que vem posicionado do servidor.
 *
 * O QUE ISSO CONSERTA, alem de atender ao pedido: o `valor_total_centavos` saia
 * em negrito 18px por causa de duas linhas DESTE arquivo, e essa decisao nao
 * viajava no payload. O CRM consome a mesma rota e nao roda React - ele
 * receberia a mesma fatura sem o negrito, e nenhum dos dois lados pareceria
 * errado. Agora peso, tamanho e alinhamento sao dado do bloco.
 */
/**
 * UM documento — a previa de uma fatura so. Continua sendo o caminho normal.
 *
 * E um caso de `Documentos` com uma folha, e nao um componente irmao: o dia em
 * que o desenho da folha divergir entre "uma" e "o mes inteiro" e o dia em que a
 * previa deixa de provar o que sai da impressora.
 */
/**
 * QUAL DOS DOIS DOCUMENTOS. `g3` e o destino decidido pela `Q-DOCFATURA-01` em
 * 12/08 e e o PADRAO desde 14/08; `blocos` e a composicao posicionada da
 * migration 23, que continua viva porque a folha G3 ainda nao tem duas das sete
 * faixas — retira-la hoje deixaria o sistema sem documento nenhum.
 *
 * A escolha e da TELA e nao do tenant, de proposito: nao e configuracao, e uma
 * travessia. Gravar isso no banco daria a ela cara de permanencia.
 */
export type ModeloDoDocumento = 'g3' | 'blocos';

function Documento({ doc, logoUrl, modelo = 'g3' }: {
  doc: DocumentoDaFatura; logoUrl: string | null; modelo?: ModeloDoDocumento;
}) {
  return <Documentos docs={[doc]} logoUrl={logoUrl} modelo={modelo} />;
}

/**
 * N documentos numa pilha imprimivel — a impressao em LOTE (06/08/2026).
 *
 * `id="documento"` MUDOU DE ELEMENTO, e essa e a mudanca de verdade: ele era a
 * propria folha e agora e o RECIPIENTE das folhas. O `estilo.ts` mudou junto
 * (`#documento.folha` -> `#documento .folha`), e os dois so fazem sentido
 * juntos - `id` e unico por documento, entao a pilha nao teria como existir com
 * o desenho antigo.
 *
 * A REGRA `@page` SAI UMA VEZ, e nao uma por folha. Ela e do TENANT (o papel
 * gravado na aba Documento), nao da fatura: 28 copias identicas da mesma regra
 * nao mudariam a impressao, mas fariam parecer que o papel pode variar dentro
 * de um lote - e ele nao pode.
 */
function Documentos({ docs, logoUrl, modelo = 'g3' }: {
  docs: readonly DocumentoDaFatura[]; logoUrl: string | null; modelo?: ModeloDoDocumento;
}) {
  const primeiro = docs[0];
  if (!primeiro) return null;
  /* O MODELO G3 E A4 SEMPRE, e nao o papel gravado pelo tenant: ele e desenhado
   * em milimetro de A4, e imprimi-lo em A5 nao o encolheria — cortaria. */
  const papelCss = modelo === 'g3' ? 'A4' : (PAPEL_CSS[primeiro.layout.folha.papel] ?? 'A4');
  const orientacao = modelo === 'g3' ? 'retrato' : primeiro.layout.folha.orientacao;

  return (
    <>
      {/* A REGRA `@page`, INJETADA. `size` nao aceita `var()`, entao ela nao pode
          morar no `estilo.ts` com o resto - e sem ela o navegador usaria o papel
          padrao do SISTEMA de quem imprime, que foi o defeito que a migration 23
          nomeou: a mesma fatura saindo com geometria diferente em duas maquinas. */}
      <style>{regraDaPagina(papelCss, orientacao)}</style>

      <div id="documento">
        {docs.map((d) => (modelo === 'g3'
          ? <FolhaModeloG3 key={d.fatura_id} doc={d} logoUrl={logoUrl} />
          : <Folha key={d.fatura_id} doc={d} logoUrl={logoUrl} />))}
      </div>
    </>
  );
}

/** Uma folha e o que vem junto dela na tela. `folha-item` e o nivel em que duas
 *  paginas sao IRMAS no DOM, e por isso e nele que o corte de pagina do
 *  `estilo.ts` casa — dentro, cada folha tem o seu proprio palco de escala. */
function Folha({ doc, logoUrl }: { doc: DocumentoDaFatura; logoUrl: string | null }) {
  const { medidas, area, blocos, problemas } = doc.layout;
  // `ResizeObserver`, nao efeito com `clientWidth` - ver `medir-largura.ts`.
  const [palco, larguraPx] = useLargura<HTMLDivElement>();
  const escala = escalaDaPrevia(larguraPx, medidas.largura_mm);

  return (
    <div className="folha-item">
      {problemas.length > 0 && (
        // `naoimprime` num <div> em volta, e nao no Aviso: o componente nao
        // aceita `className`, e alargar a assinatura dele para um caso so
        // deixaria a proxima pessoa achar que Aviso e generico.
        <div className="naoimprime">
          <Aviso tipo="alerta">
            O layout tem {problemas.length} ponto(s) a olhar: {problemas.map((p) => p.detalhe).join(' · ')}
          </Aviso>
        </div>
      )}

      {/* `folha-recorte` existe para o zoom da tela nao deixar um vao branco
          embaixo - e o `estilo.ts` o DESFAZ na impressao, senao ele cortaria a
          folha em tamanho real. Antes isso nao aparecia porque a folha era o
          `position: absolute` e escapava do pai. */}
      <div ref={palco} className="folha-recorte"
           style={{ height: medidas.altura_mm * PX_POR_MM * escala + 2, overflow: 'hidden' }}>
        <div className="folha-palco" style={{ ['--escala' as any]: escala }}>
          <div className="folha" style={{
            ['--folha-w' as any]: `${medidas.largura_mm}mm`,
            ['--folha-h' as any]: `${medidas.altura_mm}mm`,
          }}>
            <div className="margem-guia naoimprime" style={{
              left: `${area.x_mm}mm`, top: `${area.y_mm}mm`,
              width: `${area.largura_mm}mm`, height: `${area.altura_mm}mm`,
            }} />
            {blocos.map((b) => (
              <div key={b.id}
                   className={`bloco${b.borda ? ' bloco-borda' : ''}${b.fundo ? ' bloco-fundo' : ''}`}
                   style={{ ...estiloDoBloco(b), padding: '1mm' }}>
                <ConteudoDoBloco b={b} doc={doc} logoUrl={logoUrl} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA 1 DO MODELO G3 — o destino da `Q-DOCFATURA-01`, na tela.
 *
 * ELA NAO COMPOE NADA, e essa e a mesma regra da tela inteira: rotulo, dinheiro,
 * data e CPF mascarado chegam prontos de `folha-g3.ts`, no servidor. O que este
 * componente faz e pintar — e o CRM, que consome a mesma rota e nao roda React,
 * pinta o mesmo conteudo do jeito dele.
 *
 * A GEOMETRIA E A4 FIXO e nao le o papel do tenant, ao contrario da `Folha` de
 * cima. Um modelo fixo que aceitasse papel variavel nao seria fixo.
 *
 * O QUE FALTA APARECE NA TELA E NUNCA NO PAPEL. Duas das sete faixas nao entraram
 * — os tres cartoes e o detalhamento dos repasses —, e a folha carrega a lista com
 * o motivo. Imprimi-la entregaria ao cliente a nossa lista de pendencias; escondе-la
 * faria a folha parecer pronta. Entao ela sai na tela, fora da folha.
 */
function FolhaModeloG3({ doc, logoUrl }: { doc: DocumentoDaFatura; logoUrl: string | null }) {
  const f = doc.folha;
  const [palco, larguraPx] = useLargura<HTMLDivElement>();
  const escala = escalaDaPrevia(larguraPx, 210);

  return (
    <div className="folha-item">
      {f.faixas_ausentes.length > 0 && (
        <div className="g3-pendente naoimprime">
          <b>Esta folha ainda nao esta completa — {f.faixas_ausentes.length} faixa(s) fora.</b>
          <ul>
            {f.faixas_ausentes.map((a) => (
              <li key={a.faixa}><strong>{a.faixa}:</strong> {a.motivo} <em>({a.questao})</em></li>
            ))}
          </ul>
        </div>
      )}

      <div ref={palco} className="folha-recorte"
           style={{ height: 297 * PX_POR_MM * escala + 2, overflow: 'hidden' }}>
        <div className="folha-palco" style={{ ['--escala' as any]: escala }}>
          <div className="g3">
            <div className="g3-topo">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4pt' }}>
                {/* SEM LOGO O ESPACO FICA VAZIO, e nao com o nome escrito: o nome
                    JA sai a direita, e imprimi-lo dos dois lados do mesmo cabecalho
                    e a redundancia que o modelo G3 nao tem. Ausencia de logo e
                    ausencia de logo - a marca continua dita, uma vez. */}
                {logoUrl && <img src={logoUrl} alt="" />}
                <div className="g3-assinatura">{f.cabecalho.assinatura}</div>
              </div>
              {/* AUSENTE E AUSENTE: sem razao social cadastrada a linha some, e nao
                  vira travessao — e a ela que o aviso anti-golpe amarra. */}
              {f.cabecalho.emissor && <div className="g3-emissor">{f.cabecalho.emissor}</div>}
            </div>

            <div className="g3-cliente">
              <div className="g3-cliente-topo">
                <div>
                  <div className="g3-rot">Nome / razão social</div>
                  <div className="g3-nome">{f.cliente.nome}</div>
                </div>
                <div>
                  <div className="g3-rot">CPF / CNPJ</div>
                  <div className="g3-doc">{f.cliente.documento}</div>
                </div>
              </div>
              <div className="g3-meta">
                {f.cliente.meta.map((m) => (
                  <div key={m.rotulo}>
                    <div className="g3-rot">{m.rotulo}</div>
                    <div className="g3-meta-val">{m.valor}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="g3-total">
              <div style={{ minWidth: 0 }}>
                <div className="g3-total-rot">{f.total.rotulo}</div>
                <div className="g3-total-det">{f.total.detalhe}</div>
              </div>
              <div style={{ flex: 'none' }}>
                <div className="g3-total-val">{f.total.valor}</div>
                <div className="g3-total-sub">Vencimento {f.total.vencimento}</div>
                <div className="g3-total-sub fraca">{f.total.nota}</div>
              </div>
            </div>

            <div className="g3-aviso">
              {/* O triangulo desenhado a mao e nao vindo do pacote de icones: o
                  pacote e da INTERFACE, e um icone de tela dentro do papel traria
                  peso e tamanho pensados para outro meio. */}
              <svg viewBox="0 0 24 24" fill="none" stroke="#14213D" strokeWidth="1.3"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3.6L21.4 20H2.6L12 3.6z" />
                <path d="M12 9.6v4.6" /><path d="M12 17.1h.01" />
              </svg>
              <div>
                <div className="g3-aviso-tit">{f.aviso.titulo}</div>
                <div className="g3-aviso-corpo">{f.aviso.corpo}</div>
              </div>
            </div>

            {/* A TABELA DE VALORES, e ela e o que faltava para a folha G3 cobrir
                tudo o que o layout posicionado cobre. Os outros quatro tipos de
                bloco dele — logo, texto, linha e pagamento — ja estao nas faixas
                acima. Obedece `campo_do_documento`: ordem, rotulo e visibilidade
                continuam do tenant, porque CONTEUDO e POSICAO sao coisas
                diferentes e so a segunda o modelo fixo substitui. */}
            {f.detalhamento.linhas.length > 0 && (
              <div className="g3-tabela">
                <div className="g3-tabela-tit">{f.detalhamento.titulo}</div>
                {f.detalhamento.linhas.map((l) => (
                  <div key={l.campo} className="g3-tabela-linha">
                    <span className="g3-tabela-rot">{l.rotulo}</span>
                    <span className={`g3-tabela-val${l.ausente ? ' ausente' : ''}`}>{l.valor}</span>
                  </div>
                ))}
              </div>
            )}

            <FaixaDePagamento doc={doc} />

            <div className="g3-rodape">
              <span>{f.rodape.emissor ?? ''}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{f.rodape.paginacao}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** O `size` do `@page` por papel. Espelha `PAPEIS[].css` do servidor - e a razao
 *  de nao duplicar as MEDIDAS esta em `web/src/layout-regras.ts`; aqui o que se
 *  duplica e o nome CSS, que e uma palavra do proprio CSS e nao um dado nosso. */
const PAPEL_CSS: Record<string, string> = {
  a4: 'A4', a5: 'A5', carta: 'Letter', oficio: '216mm 330mm',
};

/** O que cada tipo de bloco pinta. A geometria ja veio de fora. */
function ConteudoDoBloco(
  { b, doc, logoUrl }: { b: BlocoComposto; doc: DocumentoDaFatura; logoUrl: string | null },
) {
  if (b.tipo === 'linha') {
    return <div style={{ width: '100%', borderTop: '1px solid currentColor', opacity: .35 }} />;
  }
  if (b.tipo === 'logo') {
    return logoUrl
      ? <img src={logoUrl} alt="" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
      : null;
  }
  if (b.tipo === 'texto') return <span style={{ whiteSpace: 'pre-wrap' }}>{b.texto}</span>;

  if (b.tipo === 'campo') {
    // O valor vem PRONTO do servidor. "—" e ausencia de dado, nunca zero.
    return (
      <span style={{ width: '100%' }}>
        {b.rotulo ? <span className="fraco" style={{ marginRight: 6 }}>{b.rotulo}</span> : null}
        {b.ausente ? <span className="fraco">{b.valor}</span> : b.valor}
      </span>
    );
  }
  if (b.tipo === 'tabela_de_campos') {
    return (
      <table>
        <tbody>
          {(b.linhas ?? []).map((l) => (
            <tr key={l.campo}>
              <td style={{ width: '55%' }}>{l.rotulo}</td>
              <td className="num">
                {l.ausente ? <span className="fraco">{l.valor}</span> : l.valor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  // A FAIXA RECEBE O DOCUMENTO INTEIRO, e nao so `doc.pagamento`: o modelo G3 poe
  // vencimento e valor DENTRO da caixa de pagamento, ao lado do nosso numero, e os
  // dois moram no topo do documento - nao na faixa.
  if (b.tipo === 'pagamento') return <FaixaDePagamento doc={doc} />;
  return null;
}

/**
 * O QUADRADO. O SVG vem PRONTO do servidor - ver `src/dominio/qrcode.ts` e a
 * decisao 4 da `Q-DOCFATURA-01`: o CRM consome a mesma rota e nao roda React, e um
 * QR desenhado aqui obrigaria o CRM a portar o codificador.
 *
 * `dangerouslySetInnerHTML` E DELIBERADO E E O PONTO ESTREITO, entao vale dizer por
 * que e seguro aqui: o `d` do caminho e montado a partir de INDICES DA MATRIZ, e
 * nenhum dado de fatura, cliente ou chave Pix atravessa a string. A verificacao
 * `Q13c` de `tests/qrcode.ts` prende isso - o atributo nao aceita caractere fora de
 * `[Mhvz0-9 -]`. Se alguem um dia interpolar texto no SVG, aquele teste cai antes.
 *
 * A CAIXA NAO DECLARA TAMANHO, ELA LE O DO DESENHO (`ladoDoQr`). Ate 09/08/2026 ela
 * dizia `180x180` e o SVG vinha com 220 - o desenho vazava 40 px e o texto seguinte
 * era pintado por cima dele. Ver o comentario de `ladoDoQr` para o que foi medido.
 */
function Qr({ qr, motivo, rotulo }: { qr: QrDoDocumento | null; motivo?: string; rotulo: string }) {
  if (!qr) {
    // Sem desenho, o codigo copiavel continua ao lado. Dizer o motivo e melhor que
    // um quadrado vazio - foi a mesma escolha de 29/07, agora no caso residual.
    return motivo
      ? <p className="sub naoimprime" style={{ marginTop: 8 }}>O desenho do QR não pôde ser gerado: {motivo}</p>
      : null;
  }
  const lado = ladoDoQr(qr.svg);
  return (
    <figure style={{ margin: '12px 0 0', display: 'flex', gap: 16, alignItems: 'center' }}>
      <div
        aria-label={rotulo}
        /* `display: flex` tira a folga de linha de base que um SVG em linha deixa
         * embaixo - sem ela a caixa fica alguns pixels mais alta que o desenho. */
        style={{ flex: '0 0 auto', display: 'flex', width: lado ?? undefined, height: lado ?? undefined }}
        dangerouslySetInnerHTML={{ __html: qr.svg }}
      />
      <figcaption className="sub" style={{ margin: 0 }}>
        Aponte a câmera do aplicativo do banco.
        <br />
        <span className="fraco" style={{ fontSize: 11 }}>
          QR versão {qr.versao}, correção {qr.nivel}, {qr.modulos}×{qr.modulos} módulos
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * A FAIXA DE PAGAMENTO NO DESENHO DO MODELO G3 (12/08/2026).
 *
 * DE ONDE VEIO: `github.com/lealvbl-stack/g3_fatura_unificada`, a caixa de
 * pagamento da folha 2. E o primeiro pedaco daquele modelo a entrar, e entrou
 * sozinho por um motivo: **e o unico que nao depende do leitor da Equatorial.**
 * Beneficiario, nosso numero, vencimento, valor, QR e linha digitavel ja existem
 * no payload hoje. Os paineis de economia, desconto, CO2 e historico nao existem
 * e nao foram inventados - ver `PLANO-documento-modelo-g3-2026-08-12.md` §4.
 *
 * O QUE O DESENHO MUDA, e nao e enfeite: a faixa antiga era um filete tracejado
 * com dois codigos empilhados, e as duas formas de pagar disputavam a mesma
 * coluna. Aqui elas sao **duas vias lado a lado**, com a caixa fechada por borda
 * - que e como um documento de cobranca se le: primeiro para quem, quanto e ate
 * quando; depois por qual caminho.
 *
 * DUAS COISAS DO MODELO ORIGINAL **NAO** ENTRARAM, e as duas sao decisao aberta:
 * o codigo de barras (nao temos codificador - `Q-DOCG3-06`) e a Barlow Semi
 * Condensed, que no modelo carrega todo numero grande (`Q-DOCG3-05`). A estrutura,
 * a hierarquia e as cores sao as do modelo; a fonte e a do sistema.
 *
 * O RODAPE LEGAL SO APARECE NO BOLETO. No modelo ele e texto fixo do Bancoob/
 * Sicoob, e ele so e verdade quando o titulo foi registrado la - imprimi-lo sob um
 * Pix estatico nosso seria dizer que o banco responde por um documento que ele
 * nunca viu.
 */
function FaixaDePagamento({ doc }: { doc: DocumentoDaFatura }) {
  const { pagamento } = doc;

  if (pagamento.tipo === 'nenhuma') {
    return (
      <div className="faixa-pgto">
        <div className="faixa-pgto-topo"><span>Pagamento</span></div>
        <div className="faixa-pgto-via">
          <div className="faixa-pgto-rot">Sem faixa de pagamento</div>
          <div className="faixa-pgto-nota">{pagamento.motivo}</div>
        </div>
      </div>
    );
  }

  const boleto = pagamento.tipo === 'boleto';
  // O Pix do BOLETO e o do banco (tem `txid`); o outro e o nosso estatico. As duas
  // vias so aparecem quando ha as duas - um `1fr 1fr` fixo deixaria meia caixa
  // vazia na fatura que so tem Pix, que e a maioria enquanto o A1 nao existe.
  const temPix = boleto ? !!pagamento.pix_copia_e_cola : true;
  const temBoleto = boleto;
  const vias = [temPix, temBoleto].filter(Boolean).length;

  return (
    <div className="faixa-pgto">
      <div className="faixa-pgto-topo">
        <span>Pagamento</span>
        <span style={{ letterSpacing: '.06em', fontSize: '7pt' }}>
          {boleto ? 'Boleto registrado' : 'Pix'}
        </span>
      </div>

      {/* QUEM, QUANTO E ATE QUANDO. O nosso numero so existe no boleto; no Pix o
          lugar dele fica com o apelido da chave, que e o que identifica o destino
          quando ha mais de uma cadastrada. */}
      <div className="faixa-pgto-campos">
        {/* O BENEFICIARIO, E ELE DEIXOU DE FALTAR NO BOLETO em 14/08. Ate ali
            `identidade_de_cobranca` nao tinha razao social nem CNPJ, entao no
            caminho do boleto nao havia nome de quem recebe em lugar nenhum do
            schema, e o campo era omitido. A migration 26 criou as duas colunas e
            fechou a `Q-DOCG3-08`. O Pix ja tinha, pela `chave_pix.recebedor_nome`
            — o campo 59 do BR Code.

            CONTINUA SO APARECENDO QUANDO EXISTE, e essa parte nao mudou: imprimir
            "—" sob o rotulo seria pior que omitir. No modelo G3 este e o campo do
            aviso anti-golpe (*"confira sempre se o beneficiario e..."*), e um
            travessao ali ensina o cliente a aceitar fatura sem beneficiario. */}
        {pagamento.tipo === 'pix' && (
          <div>
            <div className="faixa-pgto-rot">Beneficiário</div>
            <div className="faixa-pgto-val">{pagamento.recebedor_nome}</div>
          </div>
        )}
        {boleto && pagamento.beneficiario && (
          <div>
            <div className="faixa-pgto-rot">Beneficiário</div>
            <div className="faixa-pgto-val">{pagamento.beneficiario}</div>
          </div>
        )}
        {boleto && (
          <div>
            <div className="faixa-pgto-rot">Nosso número</div>
            <div className="faixa-pgto-val">{pagamento.nosso_numero ?? '—'}</div>
          </div>
        )}
        <div>
          <div className="faixa-pgto-rot">Vencimento</div>
          {/* JA VEM FORMATADO, e a tela nao o reformata - a regra da primeira tela
              deste arquivo. `doc.vencimento` continua ISO ao lado, e e ele que um
              consumidor que queira reordenar por data deve usar. */}
          <div className="faixa-pgto-val">{pagamento.vencimento_br}</div>
        </div>
        <div>
          <div className="faixa-pgto-rot">Valor do documento</div>
          {/* "—" quando o total e nulo (coluna gerada, aceita nulo) - nunca zero. A
              decisao e do servidor, e a tela so pinta o que ele escreveu. */}
          <div className="faixa-pgto-total">{pagamento.valor_br}</div>
        </div>
      </div>

      <div className="faixa-pgto-vias"
           style={{ gridTemplateColumns: `repeat(${vias || 1}, minmax(0, 1fr))` }}>
        {temPix && (
          <div className="faixa-pgto-via">
            <div className="faixa-pgto-rot" style={{ textAlign: 'center' }}>Pague com Pix</div>
            <QrDaFaixa qr={pagamento.qr} motivo={pagamento.qr_motivo}
                       rotulo={boleto ? 'QR Code do Pix do boleto' : 'QR Code do Pix'} />
            <div className="faixa-pgto-nota" style={{ textAlign: 'center' }}>
              Aponte a câmera do aplicativo do seu banco
            </div>
            <div className="faixa-pgto-codigo">
              {boleto ? pagamento.pix_copia_e_cola : pagamento.brcode}
            </div>
          </div>
        )}

        {temBoleto && (
          <div className="faixa-pgto-via">
            <div className="faixa-pgto-rot" style={{ textAlign: 'center' }}>Pague com boleto</div>
            {/* O CODIGO DE BARRAS FALTA E ELE E DITO, nao desenhado por aproximacao:
                o modelo G3 usa JsBarcode e nos nao temos codificador de barras
                (`Q-DOCG3-06`). A linha digitavel paga em qualquer banco e por
                digitacao, entao a fatura sai completa - o que falta e a leitura
                otica. Um retangulo listrado no lugar seria pior que a ausencia. */}
            {/* EM GRUPOS, e nao os 47 digitos corridos: e assim que o boleto do
                banco imprime, e e o agrupamento que torna a linha conferivel a
                olho. Cai no cru quando nao sao 47 - a formatacao vem do servidor
                (`linhaDigitavelFormatada`), como todo o resto desta faixa. */}
            <div className="faixa-pgto-linha" style={{ marginTop: 'auto' }}>
              {pagamento.linha_digitavel_br ?? pagamento.linha_digitavel ?? '—'}
            </div>
            <div className="faixa-pgto-nota" style={{ textAlign: 'center', marginBottom: 'auto' }}>
              Pagável em qualquer banco até o vencimento
            </div>
          </div>
        )}
      </div>

      {boleto
        ? (
          <div className="faixa-pgto-rodape">
            <div>EMITIDO PELA COOPERATIVA CONTRATANTE SEM RESPONSABILIDADE DO BANCOOB</div>
          </div>
        )
        : (
          /* O QUE CONTINUA VERDADE DEPOIS DE O DESENHO EXISTIR: o Pix estatico nao
             carrega `txid` por fatura, entao o dinheiro chega sem dizer de quem e.
             A frase ficava fora do papel (`naoimprime`) na faixa antiga e continua:
             e instrucao para quem OPERA, nao para quem paga. */
          <div className="faixa-pgto-rodape naoimprime">
            Conciliação <strong>manual</strong>: um Pix estático não carrega identificador por
            fatura, então a baixa é dada na aba Faturas. Isso não muda com o QR.
          </div>
        )}
    </div>
  );
}

/**
 * O QR DENTRO DA FAIXA — a mesma matriz do servidor, na medida do papel.
 *
 * Separado do `Qr` de cima porque as duas caixas resolvem problemas opostos, e
 * juntar as duas num componente com bandeira faria a proxima pessoa achar que ha
 * uma regra so. No painel de conferencia a caixa LE o desenho (`ladoDoQr`) porque
 * nao ha papel e o tamanho natural e o certo. Aqui a caixa e milimetro de folha:
 * quem cede e o desenho, e ele cede sem perder nada por ser vetor.
 */
function QrDaFaixa({ qr, motivo, rotulo }: { qr: QrDoDocumento | null; motivo?: string; rotulo: string }) {
  if (!qr) {
    return motivo
      ? <div className="faixa-pgto-nota">O desenho do QR não pôde ser gerado: {motivo}</div>
      : null;
  }
  return (
    <div className="faixa-pgto-qr" aria-label={rotulo}
         dangerouslySetInnerHTML={{ __html: qr.svg }} />
  );
}
