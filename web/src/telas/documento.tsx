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

import { useEffect, useState } from 'react';
import {
  api, buscarBinario,
  type IdentidadeDeCobranca, type CampoDoDocumento, type DocumentoDaFatura, type Fatura,
  type QrDoDocumento,
} from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Campo, Tabela, linha, Icone, Interruptor, BotaoDeIcone, CampoData, Escolha,
} from '../ui.tsx';
import { competenciaISO } from '../dinheiro.ts';
import { mover, paraEnvio, type CampoConfigurado } from '../cobranca-regras.ts';

/** Os 16 do enum `campo_de_fatura` (migration 19). A tela nao inventa nome de
 *  campo: o banco recusaria, e o erro sairia do lado errado. */
const CAMPOS: Array<{ campo: string; rotulo: string }> = [
  { campo: 'competencia', rotulo: 'Competência' },
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

  const [pix, setPix] = useState({ chave: '', tipo: '', nome: '', cidade: '' });
  const [lista, setLista] = useState<CampoConfigurado[] | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Preenche os campos do Pix uma vez, quando a identidade chega.
  useEffect(() => {
    if (!ident.dado) return;
    setPix({
      chave: ident.dado.pix_chave ?? '', tipo: ident.dado.pix_tipo_chave ?? '',
      nome: ident.dado.pix_recebedor_nome ?? '', cidade: ident.dado.pix_recebedor_cidade ?? '',
    });
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

  const salvarPix = async () => {
    const ok = await acao.executar(() => api.post('/cobranca/identidade', {
      pix_chave: pix.chave, pix_tipo_chave: pix.tipo || null,
      pix_recebedor_nome: pix.nome, pix_recebedor_cidade: pix.cidade,
    }));
    if (ok) { acao.anunciar('Identidade salva.'); ident.recarregar(); }
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
        <div style={{ ...linha, gap: 12 }}>
          <Campo rotulo="Chave Pix" valor={pix.chave} ao={(v) => setPix({ ...pix, chave: v })} />
          <Campo rotulo="Tipo da chave" valor={pix.tipo} ao={(v) => setPix({ ...pix, tipo: v })}
                 opcoes={['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].map((t) => ({ valor: t, texto: t }))} />
          <Campo rotulo="Nome do recebedor (25)" valor={pix.nome} ao={(v) => setPix({ ...pix, nome: v })} />
          <Campo rotulo="Cidade (15)" valor={pix.cidade} ao={(v) => setPix({ ...pix, cidade: v })} />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={() => void salvarPix()} disabled={acao.ocupado}>
              <Icone nome={acao.ocupado ? 'carregando' : 'confirmar'} tamanho={15} peso="bold" /> Salvar
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

      <Previa logoUrl={logoUrl} />
    </Pagina>
  );
}

// ------------------------------------------------------------------- a previa
//
// A PREVIA E O DOCUMENTO, e nao uma aproximacao dele: ela pinta o retorno de
// `GET /faturas/:id/documento`, que e a mesma rota que o CRM vai consumir. Se as
// duas coisas divergissem, a previa deixaria de ser conferencia.

function Previa({ logoUrl }: { logoUrl: string | null }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [faturaId, setFaturaId] = useState('');

  const faturas = useDados<Fatura[]>(() => api.get(`/faturamento/${competenciaISO(mes)}`), [mes]);
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
            <label>Competência</label>
            <CampoData mes valor={mes} rotuloAcessivel="Competência" style={{ width: 'auto' }}
                       ao={(v) => { setMes(v); setFaturaId(''); }} />
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <label>Fatura</label>
            <Escolha valor={faturaId} ao={setFaturaId} rotuloAcessivel="Fatura"
                     primeira="Escolha uma fatura…"
                     opcoes={(faturas.dado ?? []).map((f) => ({
                       valor: f.id,
                       texto: `${String(f.competencia).slice(0, 7)} · ${f.status} · ${f.id.slice(0, 8)}`,
                     }))} />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={() => window.print()} disabled={!doc.dado}>
              <Icone nome="imprimir" tamanho={15} peso="bold" /> Imprimir / salvar PDF
            </button>
          </div>
        </div>
        {faturas.erro && <Aviso tipo="erro">Falha ao ler as faturas: {faturas.erro}</Aviso>}
        {faturas.dado?.length === 0 && (
          <Aviso tipo="alerta">Nenhuma fatura em {mes} — compor o lote é na aba Carteira.</Aviso>
        )}
        {doc.erro && <Aviso tipo="erro">Falha ao compor o documento: {doc.erro}</Aviso>}
      </div>

      {doc.dado && <Documento doc={doc.dado} logoUrl={logoUrl} />}
    </>
  );
}

/** O documento em si. `id="documento"` e o alvo do CSS de impressao do `ui.tsx`. */
function Documento({ doc, logoUrl }: { doc: DocumentoDaFatura; logoUrl: string | null }) {
  return (
    <div id="documento" className="documento">
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ maxHeight: 56, maxWidth: 200 }} />}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>FATURA</div>
          <div className="fraco">competência {doc.competencia.slice(0, 7).split('-').reverse().join('/')}</div>
        </div>
      </header>

      <table style={{ width: '100%' }}>
        <tbody>
          {doc.linhas.map((l) => (
            <tr key={l.campo}>
              <td style={{ width: '55%' }}>{l.rotulo}</td>
              <td className="num" style={{
                fontWeight: l.campo === 'valor_total_centavos' ? 700 : 400,
                fontSize: l.campo === 'valor_total_centavos' ? 18 : undefined,
              }}>
                {/* O valor vem PRONTO do servidor. "—" e ausencia de dado, nunca zero. */}
                {l.ausente ? <span className="fraco">{l.valor}</span> : l.valor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <FaixaDePagamento pagamento={doc.pagamento} />
    </div>
  );
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
 */
function Qr({ qr, motivo, rotulo }: { qr: QrDoDocumento | null; motivo?: string; rotulo: string }) {
  if (!qr) {
    // Sem desenho, o codigo copiavel continua ao lado. Dizer o motivo e melhor que
    // um quadrado vazio - foi a mesma escolha de 29/07, agora no caso residual.
    return motivo
      ? <p className="sub naoimprime" style={{ marginTop: 8 }}>O desenho do QR não pôde ser gerado: {motivo}</p>
      : null;
  }
  return (
    <figure style={{ margin: '12px 0 0', display: 'flex', gap: 16, alignItems: 'center' }}>
      <div
        aria-label={rotulo}
        style={{ width: 180, height: 180, flex: '0 0 auto' }}
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

function FaixaDePagamento({ pagamento }: { pagamento: DocumentoDaFatura['pagamento'] }) {
  if (pagamento.tipo === 'boleto') {
    return (
      <div style={{ marginTop: 24, borderTop: '2px dashed var(--borda)', paddingTop: 16 }}>
        <div className="fraco" style={{ fontSize: 12 }}>PAGUE COM O BOLETO</div>
        <code style={{ fontSize: 15, wordBreak: 'break-all' }}>{pagamento.linha_digitavel ?? '—'}</code>
        {pagamento.pix_copia_e_cola && (
          <>
            <div className="fraco" style={{ fontSize: 12, marginTop: 12 }}>OU PIX (copia e cola)</div>
            <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{pagamento.pix_copia_e_cola}</code>
            <Qr qr={pagamento.qr} motivo={pagamento.qr_motivo} rotulo="QR Code do Pix do boleto" />
          </>
        )}
      </div>
    );
  }

  if (pagamento.tipo === 'pix') {
    return (
      <div style={{ marginTop: 24, borderTop: '2px dashed var(--borda)', paddingTop: 16 }}>
        <div className="fraco" style={{ fontSize: 12 }}>PAGUE COM PIX — aponte a câmera ou copie o código</div>
        <Qr qr={pagamento.qr} motivo={pagamento.qr_motivo} rotulo="QR Code do Pix" />
        <code style={{ fontSize: 11, wordBreak: 'break-all', display: 'block', marginTop: 12 }}>
          {pagamento.brcode}
        </code>
        {/*
          O QUE CONTINUA VERDADE DEPOIS DE O DESENHO EXISTIR: o Pix estatico nao
          carrega `txid` por fatura, entao o dinheiro chega sem dizer de quem e. O
          desenho nao muda isso, e a frase fica.
        */}
        <p className="sub naoimprime" style={{ marginTop: 8, marginBottom: 0 }}>
          Conciliação <strong>manual</strong>: um Pix estático não carrega identificador por fatura,
          então a baixa é dada na aba Faturas. Isso não muda com o QR.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24, borderTop: '2px dashed var(--borda)', paddingTop: 16 }}>
      <div className="fraco" style={{ fontSize: 12 }}>SEM FAIXA DE PAGAMENTO</div>
      <p className="sub" style={{ marginBottom: 0 }}>{pagamento.motivo}</p>
    </div>
  );
}
