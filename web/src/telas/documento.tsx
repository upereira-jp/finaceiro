// DOCUMENTO: a casca da tela, e o CADASTRO que a folha imprime.
//
// DESDE 14/08/2026 (tarde) ESTE ARQUIVO NAO PINTA MAIS NENHUMA FOLHA. Ele monta
// a pagina, resolve identidade/logo/campos, e entrega tudo a `FaturaUnificada`,
// que e o processo do Documento: le o PDF da Equatorial, confere e imprime. O
// processo ANTERIOR - Previa, lote e a folha montada da NOSSA fatura - saiu
// inteiro; o bloco no pe deste arquivo diz o que saiu, o que ficou e o custo.
//
// O que restou aqui e a aba 3 (`Cadastro de Fatura`) e o que ela consome:
//   1. logo em bytea            -> `PUT /cobranca/logo`, base64 num JSON
//   2. campos CONFIGURAVEIS     -> reordenar, renomear, esconder
//   3. emissor, modelo e campos personalizados -> o que a folha IMPRIME
//   4. QR Pix estatico sem A1   -> `ConferirQr`, a conferencia pela camera
//
// O QUE ESTA TELA NAO FAZ, e e o ponto do desenho: ela nao COMPOE documento. A
// composicao esta em `src/repos/documento.ts`, no servidor, e `GET
// /faturas/:id/documento` continua respondendo porque e contrato com o CRM -
// nenhuma tela daqui a chama mais, e isso nao a torna removivel.
//
// DINHEIRO E DATA JA VEM FORMATADOS do servidor, e a tela NAO os reformata: duas
// formatacoes do mesmo valor e como duas telas passam a discordar. O que chega em
// `linha.valor` vai para a tela como esta.

import { useEffect, useState, type ReactNode } from 'react';
import {
  api, buscarBinario,
  type IdentidadeDeCobranca, type ChavePix, type CampoDoDocumento,
  type QrDoDocumento, type QrDeConferencia,
  type ModeloDeFatura, type CampoPersonalizado,
} from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { useSessao } from '../sessao.tsx';
import {
  Pagina, Aviso, Campo, Tabela, linha, rotulo, Icone, Interruptor, BotaoDeIcone, Escolha } from '../ui.tsx';
import { paraCentavos, emReais } from '../dinheiro.ts';
import { mover, paraEnvio, type CampoConfigurado } from '../cobranca-regras.ts';
import { ladoDoQr } from '../layout-regras.ts';
import { FaturaUnificada } from './fatura-unificada.tsx';

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
  /* O TENANT E A CHAVE DO RASCUNHO. O seletor da barra troca de empresa SEM
   * recarregar a pagina, entao um rascunho sem tenant faria a fatura de uma
   * empresa reaparecer dentro de outra. */
  const { tenantId } = useSessao();
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
  const [emissor, setEmissor] = useState({
    razao_social: '', cnpj: '', telefone: '', endereco: '', email: '', site: '',
  });
  useEffect(() => {
    if (!ident.dado) return;
    setEmissor({
      razao_social: ident.dado.razao_social ?? '', cnpj: ident.dado.cnpj ?? '',
      telefone: ident.dado.telefone ?? '', endereco: ident.dado.endereco ?? '',
      email: ident.dado.email ?? '', site: ident.dado.site ?? '',
    });
  }, [ident.dado?.razao_social, ident.dado?.cnpj, ident.dado?.telefone,
      ident.dado?.endereco, ident.dado?.email, ident.dado?.site]);

  /*
   * O QUE VIAJA E SO O QUE ESTE FORMULARIO EDITA — e ate 14/08 viajava a linha
   * inteira, com um defeito medido no meio.
   *
   * `salvarIdentidade` era um upsert do registro inteiro e `texto(undefined)`
   * devolvia `null`. Como o seletor de chave Pix chama a MESMA rota mandando um
   * campo so, **escolher a chave padrao apagava razao social e CNPJ**, em
   * silencio — e a folha voltava a sair sem a linha do emissor e sem o aviso
   * contra o golpe do boleto, que era o bloqueio numero 1 da retomada.
   *
   * O conserto de verdade esta no repositorio (campo ausente != campo nulo). Aqui
   * a mudanca e a consequencia: este formulario para de mandar `chave_pix_padrao_id`
   * "para nao apagar", porque nao ha mais o que apagar.
   */
  const salvarEmissor = async () => {
    const ok = await acao.executar(() => api.post('/cobranca/identidade', {
      razao_social: emissor.razao_social.trim() || null,
      cnpj: emissor.cnpj.trim() || null,
      telefone: emissor.telefone.trim() || null,
      endereco: emissor.endereco.trim() || null,
      email: emissor.email.trim() || null,
      site: emissor.site.trim() || null,
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
            sub="Sobe a fatura da Equatorial, confere os dados e emite a fatura unificada. É este documento que o cliente recebe — e a mesma rota que o CRM vai consumir.">

      {ident.erro && <Aviso tipo="erro">Não foi possível ler a identidade: {ident.erro}</Aviso>}
      {semIdentidade && (
        <Aviso tipo="alerta">
          <strong>Nenhuma identidade de cobrança cadastrada.</strong> Salve os dados no fim desta aba
          primeiro — a logo pendura na identidade por chave estrangeira, e é ela que carrega a trilha
          de auditoria.
        </Aviso>
      )}
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}

      {/* ============================ AS TRES ABAS DA TELA DEFINITIVA (14/08/2026)
          Portadas de `g3_fatura_unificada`. Elas sao AGORA o processo do Documento:
          a leitura do PDF da Equatorial substitui a digitacao campo a campo, e a
          folha do cliente sai da fatura da distribuidora, nao da nossa.

          O CADASTRO DESCE PARA O PE DA ABA 1, e nao sai. A referencia e de um
          tenant so e traz emissor, logo e Pix no codigo; aqui cada um deles e uma
          linha em banco com trilha de auditoria, e eles continuam sendo o que a
          folha imprime. O que mudou e a ordem: primeiro o trabalho, depois a
          configuracao que ele consome.

          E DESDE 14/08 (TARDE) ELAS SAO A UNICA COISA AQUI. O processo ANTERIOR
          desta aba - a Previa, a impressao em LOTE e a folha `FolhaModeloG3`,
          montada a partir da NOSSA fatura - saiu inteiro, por decisao do dono:
          *"quero apenas o que roda na referencia"*. Ver o bloco no pe deste
          arquivo para o que saiu, o que ficou de proposito e o que isso custou. */}
      <FaturaUnificada
        logoUrl={logoUrl}
        tenantId={tenantId ?? null}
        cadastro={<Cadastro>

      {/* -------------------------------------------------------- quem emite */}
      <div className="cartao secao">
        <h2 style={{ marginTop: 0 }}><Icone nome="cobranca" tamanho={17} /> Quem emite a fatura</h2>
        <p className="sub">
          Sai no <strong>cabeçalho</strong> e no <strong>rodapé</strong> da folha, e no campo
          <strong> Beneficiário</strong> da faixa de pagamento — é a este nome que o aviso contra o
          golpe do boleto amarra (<em>"confira sempre se o beneficiário é…"</em>). Sem ele cadastrado
          a folha sai <strong>sem a linha</strong>, e não com um travessão: um travessão ali treinaria
          exatamente o comportamento que o aviso quer impedir.
        </p>
        <div className="campos">
          <Campo rotulo="Razão social" valor={emissor.razao_social}
                 ao={(v) => setEmissor({ ...emissor, razao_social: v })}
                 dica="Consórcio G3 Gestão de Energia Solar" />
          <Campo rotulo="CNPJ" valor={emissor.cnpj} ao={(v) => setEmissor({ ...emissor, cnpj: v })}
                 dica="Com ou sem máscara" />
        </div>

        {/* ------------------------------------------------- o contato do rodapé
            AS QUATRO COLUNAS NASCERAM EM 14/08 (migration 28), e a razão está
            medida: `ContatoDoEmissor` existia no domínio desde a manhã do mesmo
            dia, com teste, e NENHUM chamador de produção o preenchia — a rota de
            composição chamava `comporFolhas` com quatro argumentos e o quinto
            caía no default. O rodapé da folha 2 saía com a linha do emissor e
            mais nada, e não havia de onde tirar o resto. */}
        <h3 style={{ marginTop: 18 }}>Contato impresso no rodapé da folha 2</h3>
        <div className="campos">
          <Campo rotulo="Telefone" valor={emissor.telefone}
                 ao={(v) => setEmissor({ ...emissor, telefone: v })} dica="62 3190-2020" />
          <Campo rotulo="E-mail" valor={emissor.email}
                 ao={(v) => setEmissor({ ...emissor, email: v })} dica="sac@empresa.com.br" />
          <Campo rotulo="Site" valor={emissor.site}
                 ao={(v) => setEmissor({ ...emissor, site: v })} dica="www.empresa.com.br" />
        </div>
        <div style={{ marginTop: 12 }}>
          <Campo rotulo="Endereço" valor={emissor.endereco}
                 ao={(v) => setEmissor({ ...emissor, endereco: v })}
                 dica="Rua T-55, nº 930, Sala 910, Setor Bueno, Goiânia/GO" />
        </div>
        <div style={{ ...linha, marginTop: 14 }}>
          <button className="primario" onClick={() => void salvarEmissor()} disabled={acao.ocupado}>
            <Icone nome="confirmar" tamanho={15} peso="bold" /> Salvar emissor
          </button>
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
          O CNPJ é conferido pelo <strong>dígito verificador</strong>, e não só pelo formato: este
          número sai impresso ao lado do aviso que manda o cliente conferir antes de pagar. Campo
          vazio <strong>some</strong> da folha — nunca vira travessão.
        </p>
      </div>

      {/* ------------------------------------------------------------- a logo */}
      <div className="cartao secao">
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
      <div className="cartao secao">
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
      <div className="cartao secao">
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

      {/* O teste de campo do QR fica junto do cadastro do Pix, que e o que ele
          confere — e nao mais antes da Previa: a Previa saiu para a aba 2. */}
      {/* --------------------------------- o MODELO e os campos personalizados */}
      <ModeloDaFatura />
      <CamposPersonalizados />

      <ConferirQr temIdentidade={!!ident.dado} />

        </Cadastro>}
      />
    </Pagina>
  );
}

/**
 * O CADASTRO, dobrado.
 *
 * Sao quatro cartoes que se mexe uma vez por tenant e depois nunca mais, e eles
 * ocupavam a tela inteira acima do trabalho do dia. Dobrados, continuam a um
 * clique e param de competir com a conferencia dos campos.
 *
 * `<details>` NATIVO e nao um estado de React: ele abre sem JavaScript, o teclado
 * ja chega nele e o navegador ja anuncia expandido/recolhido para leitor de tela.
 */
function Cadastro({ children }: { children: ReactNode }) {
  return (
    <div className="naoimprime">
      <p className="sub">
        Configuração por tenant. O que está aqui é o que a folha <strong>imprime</strong> — no
        cabeçalho, no rodapé, na faixa de pagamento e na grade do cliente. Mexe-se uma vez, não a
        cada fatura.
      </p>
      {children}
    </div>
  );
}

/**
 * ============================================================================
 * O MODELO DE FATURA — o TEMPLATE (migration 28).
 *
 * O QUE ELE RESOLVE, e o defeito era o mesmo que a migration 26 já tinha
 * corrigido uma vez. Cinco textos que saem impressos na fatura de QUALQUER
 * tenant estavam escritos no código do domínio:
 *
 *   "Energia Solar por Assinatura"                          a assinatura do topo
 *   "Não pague a conta da Equatorial" + o corpo             a faixa laranja
 *   "…multa de 2% e juros de 1% ao mês"                     o rodapé da folha 2
 *   "EMITIDO PELA COOPERATIVA CONTRATANTE…"                 o pé da caixa de pagamento
 *   "COOPERATIVA CONTRATANTE 5004 SICOOB UNICENTRO BR"      idem
 *
 * As duas últimas carregam o CÓDIGO 5004 e o nome de uma cooperativa específica.
 * É exatamente o que a migration 26 tirou do emissor, com estas palavras:
 * *"escrever o CNPJ da G3 no fonte poria o CNPJ dela na fatura de outro tenant"*.
 * Aqui poria o banco de outro tenant, sob a assinatura de um banco que nunca viu
 * o documento.
 *
 * O RODAPÉ LEGAL NASCE VAZIO, e vazio faz a faixa SUMIR. Copiar as duas linhas
 * do Sicoob para dentro do banco transformaria um literal errado num dado errado
 * — que é pior, porque o literal ao menos dava para achar por grep.
 */
function ModeloDaFatura() {
  const acao = useAcao();
  const modelos = useDados<ModeloDeFatura[]>(() => api.get('/cobranca/modelos'));
  const [m, setM] = useState<ModeloDeFatura | null>(null);

  useEffect(() => {
    if (!modelos.dado) return;
    setM(modelos.dado.find((x) => x.padrao) ?? modelos.dado[0] ?? null);
  }, [modelos.dado]);

  const mudar = (k: keyof ModeloDeFatura) => (v: string) =>
    setM((s) => (s ? { ...s, [k]: v } : s));

  const salvar = async () => {
    if (!m) return;
    const ok = await acao.executar(() => api.put(`/cobranca/modelos/${m.id}`, {
      nome: m.nome, descricao: m.descricao, assinatura: m.assinatura,
      aviso_titulo: m.aviso_titulo, aviso_corpo: m.aviso_corpo,
      percentual_desconto_padrao: m.percentual_desconto_padrao,
      fator_emissao_padrao: m.fator_emissao_padrao,
      multa_percentual: m.multa_percentual, juros_mes_percentual: m.juros_mes_percentual,
      rodape_legal: m.rodape_legal, nota_do_fator: m.nota_do_fator,
    }));
    if (ok) { acao.anunciar('Modelo salvo.'); modelos.recarregar(); }
  };

  const criar = async () => {
    const nome = window.prompt('Nome do modelo novo (é por ele que se escolhe):');
    if (!nome?.trim()) return;
    const ok = await acao.executar(() => api.post('/cobranca/modelos', { nome: nome.trim() }));
    if (ok) { acao.anunciar('Modelo criado.'); modelos.recarregar(); }
  };

  const escolherPadrao = async (id: string) => {
    const ok = await acao.executar(() => api.post(`/cobranca/modelos/${id}/padrao`, {}));
    if (ok) { acao.anunciar('Modelo padrão definido.'); modelos.recarregar(); }
  };

  return (
    <div className="cartao secao">
      <div style={{ ...linha }}>
        <h2 style={{ margin: 0 }}><Icone nome="documento" tamanho={17} /> Modelo da fatura</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => void criar()} disabled={acao.ocupado}>
            <Icone nome="acrescentar" tamanho={15} /> Novo modelo
          </button>
          <button className="primario" onClick={() => void salvar()} disabled={acao.ocupado || !m}>
            <Icone nome={acao.ocupado ? 'carregando' : 'confirmar'} tamanho={15} peso="bold" /> Salvar modelo
          </button>
        </div>
      </div>
      <p className="sub">
        O modelo é <strong>como a folha lê</strong>: a assinatura do topo, o texto do aviso laranja,
        os parâmetros padrão de emissão e o rodapé legal do banco. Quem <strong>emite</strong> é o
        cartão acima, e é um por empresa; de modelo há vários, porque a mesma empresa fatura de mais
        de um jeito.
      </p>

      {modelos.erro && <Aviso tipo="erro">Falha ao ler os modelos: {modelos.erro}</Aviso>}
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}

      {(modelos.dado ?? []).length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <Campo rotulo="Modelo em uso" valor={m?.id ?? ''}
                 ao={(v) => {
                   const escolhido = (modelos.dado ?? []).find((x) => x.id === v);
                   if (escolhido) setM(escolhido);
                 }}
                 opcoes={(modelos.dado ?? []).map((x) => ({
                   valor: x.id, texto: `${x.nome}${x.padrao ? ' — padrão' : ''}`,
                 }))} />
          {m && !m.padrao && (
            <button style={{ marginTop: 8 }} onClick={() => void escolherPadrao(m.id)}
                    disabled={acao.ocupado}>
              <Icone nome="confirmar" tamanho={15} /> Usar este como padrão
            </button>
          )}
        </div>
      )}

      {!m ? <p className="sub">Carregando…</p> : (
        <>
          <div className="campos">
            <Campo rotulo="Nome do modelo" valor={m.nome} ao={mudar('nome')} />
            <Campo rotulo="Assinatura do topo" valor={m.assinatura} ao={mudar('assinatura')}
                   dica="Energia Solar por Assinatura" />
          </div>

          <h3 style={{ marginTop: 18 }}>Aviso em destaque</h3>
          <div className="campos">
            <Campo rotulo="Título" valor={m.aviso_titulo} ao={mudar('aviso_titulo')} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label>Corpo</label>
            <textarea className="fu-area" rows={2} value={m.aviso_corpo}
                      aria-label="Corpo do aviso em destaque"
                      onChange={(e) => mudar('aviso_corpo')(e.target.value)} />
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            É a única faixa da folha que precisa ser lida <strong>antes</strong> do valor, e o texto
            é específico da distribuidora — <em>"Não pague a conta da Equatorial"</em> não serve a
            quem fatura contra outra concessionária.
          </p>

          <h3 style={{ marginTop: 18 }}>Padrões de emissão</h3>
          <div className="campos">
            <Campo rotulo="Desconto padrão (%)" valor={m.percentual_desconto_padrao}
                   ao={mudar('percentual_desconto_padrao')} dica="20" />
            <Campo rotulo="Fator CO₂ (kg/kWh)" valor={m.fator_emissao_padrao}
                   ao={mudar('fator_emissao_padrao')} dica="0,029" />
            <Campo rotulo="Multa após vencer (%)" valor={m.multa_percentual}
                   ao={mudar('multa_percentual')} dica="2" />
            <Campo rotulo="Juros ao mês (%)" valor={m.juros_mes_percentual}
                   ao={mudar('juros_mes_percentual')} dica="1" />
          </div>
          <div style={{ marginTop: 12 }}>
            <Campo rotulo="Fonte do fator de CO₂ (nota impressa)" valor={m.nota_do_fator}
                   ao={mudar('nota_do_fator')} />
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            O desconto tem teto de <strong>50%</strong>, e o número tem origem: é o máximo do
            controle da referência. Acima de 100% a energia com desconto fica negativa e a folha
            imprimiria um <em>"valor total a pagar"</em> negativo com os três cartões normais em
            cima dele — medido em 14/08.
          </p>

          <h3 style={{ marginTop: 18 }}>Rodapé legal do banco</h3>
          <textarea className="fu-area" rows={3} value={m.rodape_legal.join('\n')}
                    aria-label="Rodapé legal do banco, uma linha por linha impressa"
                    placeholder={'EMITIDO PELA COOPERATIVA CONTRATANTE SEM RESPONSABILIDADE DO BANCOOB\n'
                               + 'COOPERATIVA CONTRATANTE 5004 SICOOB UNICENTRO BR'}
                    onChange={(e) => setM({ ...m, rodape_legal: e.target.value.split('\n') })} />
          <p className="sub" style={{ marginTop: 8, marginBottom: 0 }}>
            Uma linha por linha impressa no pé da caixa de pagamento. <strong>Vazio faz a faixa
            sumir</strong>, e é o padrão de propósito: texto de banco só é verdade quando há
            convênio, e afirmá-lo sem convênio põe a assinatura de um banco num documento que ele
            nunca viu. O texto acinzentado é o do Sicoob, para quem tiver o convênio.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * ============================================================================
 * OS CAMPOS PERSONALIZADOS — o que o TENANT inventa.
 *
 * `campo_do_documento` configura os 16 campos do enum `campo_de_fatura`: ordem,
 * rótulo e visibilidade. O que ele NÃO permite é o tenant inventar um campo, e
 * não permite por construção — o enum é fechado e um valor novo nele é uma
 * migration.
 *
 * Isso está certo para os 16: eles nomeiam colunas da `fatura`, e um nome que a
 * tela inventasse seria recusado pelo banco, com o erro saindo do lado errado. E
 * está errado para o resto: "Contrato nº", "Vendedor", "Placa da usina" são dados
 * do tenant que não existem em coluna nenhuma nossa e nunca vão existir.
 *
 * A CHAVE É UM SLUG E NÃO O RÓTULO, e a distinção é o que faz o campo sobreviver
 * a uma renomeação: o rótulo muda ("Vendedor" vira "Consultor responsável") e o
 * valor de uma fatura já registrada continua tendo de achar o campo dele.
 */
function CamposPersonalizados() {
  const acao = useAcao();
  const lista = useDados<CampoPersonalizado[]>(() => api.get('/cobranca/campos-personalizados'));
  const [campos, setCampos] = useState<CampoPersonalizado[] | null>(null);

  useEffect(() => { if (lista.dado) setCampos(lista.dado); }, [lista.dado]);

  const mudar = (i: number, mudanca: Partial<CampoPersonalizado>) =>
    setCampos((s) => (s ? s.map((c, j) => (j === i ? { ...c, ...mudanca } : c)) : s));

  const salvar = async () => {
    if (!campos) return;
    const ok = await acao.executar(() => api.put('/cobranca/campos-personalizados', {
      campos: campos.map((c, i) => ({
        chave: c.chave, rotulo: c.rotulo, origem: c.origem,
        valor: c.origem === 'fixo' ? c.valor : null,
        ordem: i, visivel: c.visivel,
      })),
    }));
    if (ok) { acao.anunciar('Campos personalizados salvos.'); lista.recarregar(); }
  };

  const acrescentar = () => setCampos([...(campos ?? []), {
    id: `novo-${(campos ?? []).length}`, chave: '', rotulo: '',
    origem: 'fixo', valor: '', ordem: (campos ?? []).length, visivel: true,
  }]);

  return (
    <div className="cartao secao">
      <div style={{ ...linha }}>
        <h2 style={{ margin: 0 }}><Icone nome="acrescentar" tamanho={17} /> Campos personalizados</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={acrescentar} disabled={acao.ocupado}>
            <Icone nome="acrescentar" tamanho={15} /> Acrescentar campo
          </button>
          <button className="primario" onClick={() => void salvar()} disabled={acao.ocupado || !campos}>
            <Icone nome={acao.ocupado ? 'carregando' : 'confirmar'} tamanho={15} peso="bold" /> Salvar campos
          </button>
        </div>
      </div>
      <p className="sub">
        Saem na <strong>grade do cliente</strong> da folha 1, depois dos oito campos que vêm da
        fatura da distribuidora. <strong>Fixo</strong> sai igual em toda fatura;
        <strong> variável</strong> é digitado a cada uma, na aba <em>1 · Leitura e cálculo</em>.
        Campo sem valor <strong>não sai</strong> — um rótulo com nada embaixo é a mesma classe do
        travessão que este sistema recusa.
      </p>

      {lista.erro && <Aviso tipo="erro">Falha ao ler os campos: {lista.erro}</Aviso>}
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}

      <Tabela cabecalho={<>
                <th style={{ width: 150 }}>Chave</th>
                <th>Rótulo impresso</th>
                <th style={{ width: 130 }}>Origem</th>
                <th>Valor fixo</th>
                <th style={{ width: 80 }}>Mostrar</th>
                <th style={{ width: 44 }} />
              </>}
              vazio="Nenhum campo personalizado. O botão acima acrescenta o primeiro.">
        {(campos ?? []).map((c, i) => (
          <tr key={c.id}>
            <td>
              <div className="inline">
                <input value={c.chave} aria-label={`Chave do campo ${i + 1}`}
                       placeholder="contrato_n" style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12 }}
                       onChange={(e) => mudar(i, { chave: e.target.value })} />
              </div>
            </td>
            <td>
              <div className="inline">
                <input value={c.rotulo} aria-label={`Rótulo do campo ${i + 1}`}
                       placeholder="Contrato nº"
                       onChange={(e) => mudar(i, { rotulo: e.target.value })} />
              </div>
            </td>
            <td>
              <div className="inline">
                <Escolha valor={c.origem} rotuloAcessivel={`Origem do campo ${i + 1}`}
                         ao={(v) => mudar(i, { origem: v as 'fixo' | 'variavel' })}
                         opcoes={[{ valor: 'fixo', texto: 'Fixo' },
                                  { valor: 'variavel', texto: 'Por fatura' }]} />
              </div>
            </td>
            <td>
              <div className="inline">
                <input value={c.origem === 'fixo' ? c.valor ?? '' : ''}
                       aria-label={`Valor fixo do campo ${i + 1}`}
                       disabled={c.origem !== 'fixo'}
                       placeholder={c.origem === 'fixo' ? 'O que sai impresso' : 'digitado por fatura'}
                       onChange={(e) => mudar(i, { valor: e.target.value })} />
              </div>
            </td>
            <td>
              <Interruptor ligado={c.visivel} rotulo="" rotuloAcessivel={`Mostrar ${c.rotulo || c.chave}`}
                           ao={(v) => mudar(i, { visivel: v })} />
            </td>
            <td>
              <BotaoDeIcone icone="remover" rotulo={`Remover ${c.rotulo || c.chave}`}
                            ao={() => setCampos((s) => (s ?? []).filter((_, j) => j !== i))} />
            </td>
          </tr>
        ))}
      </Tabela>
      <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
        A <strong>chave</strong> é minúscula, sem acento e sem espaço, começando por letra. Ela não
        é o rótulo: o rótulo muda e a chave é o que liga o valor de uma fatura já registrada ao campo
        que o imprime.
      </p>
    </div>
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

/* ==========================================================================
 * O QUE SAIU DAQUI EM 14/08/2026 (tarde), E POR QUE O REGISTRO FICA
 *
 * Decisao do dono: *"remova resquicios da versao anterior dessa aba - quero
 * apenas o que roda em g3-fatura-unificada.vercel.app"*. Saiu o processo
 * ANTERIOR do Documento, inteiro:
 *
 *   Previa            escolher UMA fatura JA EMITIDA no sistema e imprimi-la
 *   Lote              o interruptor "imprimir o mes inteiro", com selecao,
 *                     separacao entre composto e fora, e frase pre-impressao
 *   Documento(s)      o empilhador de folhas
 *   FolhaModeloG3     a folha montada a partir da NOSSA fatura
 *   FaixaDePagamento  a caixa de pagamento daquela folha
 *   QrDaFaixa         o QR dentro dela
 *   lote-de-documentos.ts + web/tests/documento-em-lote.ts
 *
 * A DIFERENCA ENTRE OS DOIS PROCESSOS NAO ERA DE DESENHO, ERA DE FONTE. A
 * folha que saiu era composta do que o financeiro calculou (contrato, geracao,
 * tarifa). A que fica sai do PDF da Equatorial lido por modelo de visao. Duas
 * respostas para "quanto o cliente paga", e o dono escolheu a da referencia.
 *
 * O QUE ISSO CUSTOU, E ESTA NOMEADO PARA QUEM VIER: a impressao em LOTE nao
 * existe mais na interface. Ela era o item 9 do "caminho para a primeira
 * fatura" do README e a `RESUMO-SESSAO-22` a chamava de ultima milha - com 28
 * faturas na competencia, o fluxo de hoje e 28 leituras de PDF, uma por vez.
 * Se o mes inteiro voltar a ser necessario, isto aqui e o que foi apagado, e
 * `git show 66a03f3~1 -- web/src/telas/documento.tsx` traz o codigo.
 *
 * O QUE **NAO** SAIU, E DE PROPOSITO:
 *
 *   GET /faturas/:id/documento   e contrato com o CRM (ver o cabecalho deste
 *                                arquivo), e contrato nao se apaga por uma tela
 *                                deixar de chamar. A rota responde igual.
 *   src/repos/documento.ts       carrega identidade, logo e chave Pix, que sao
 *                                a aba 3 - so a parte de lote ficou sem chamador
 *   src/dominio/folha-g3.ts      `folha-unificada.ts` importa `linhaDoEmissor` e
 *                                `mascararDocumento` dele. Nao e resquicio: e
 *                                base da folha que FICOU
 *   Qr                           `ConferirQr` (a camera do celular) e o unico
 *                                consumidor, e ele e da aba 3
 * ========================================================================== */
