// O EDITOR VISUAL DO LAYOUT DA FATURA. Migration 23, `PLANO-layout-visual-2026-08-03.md`.
//
// O QUE ELE ACRESCENTA AO PAINEL DE CAMPOS QUE JA EXISTIA, e por que nao o
// substitui: `campo_do_documento` resolve QUAIS campos e em que ORDEM - uma
// lista linear, sem coordenada e sem largura. Este editor e a MOLDURA: o
// tamanho da folha e onde cada elemento fica nela. As duas coisas convivem, e o
// bloco `tabela_de_campos` e a ponte - ele pinta a lista configurada la.
//
// TODA A GEOMETRIA MORA EM `web/src/layout-regras.ts`, PURA. O runner do `web/`
// nao le JSX, entao regra dentro do componente e inalcancavel por teste (regra
// 8) - e as regras daqui sao justamente as que erram em silencio: um sinal
// trocado faz o bloco fugir do cursor e nada nisso aparece em revisao de codigo.
// Este arquivo tem eventos e pintura; as contas sao de la, com 30 verificacoes.
//
// A FOLHA NA TELA E A MESMA DO PAPEL, SO ESCALADA. Ate 03/08 a previa era
// `max-width: 800px` com padding em pixel e o papel era `@page { margin: 16mm }`
// sem `size` - duas geometrias diferentes, e por isso a previa nao respondia "e
// assim que vai sair?". Agora ela responde.

import { useEffect, useRef, useState } from 'react';
import {
  api, type Bloco, type Folha, type LayoutDoDocumento, type Papel, type TipoDeBloco,
} from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { Aviso, Escolha, Icone, Interruptor, BotaoDeIcone, linha } from '../ui.tsx';
import {
  areaDaFolha, medidasComOrientacao, arrastar, redimensionar, escalaDaPrevia,
  blocoNovo, naGrade, type Aresta, type Retangulo,
} from '../layout-regras.ts';

/*
 * OS SEIS TIPOS. SEM ICONE, e isso e deliberado: `iconografia.ts` e um
 * vocabulario FECHADO e `Record<NomeDeIcone, Icon>` e exaustivo - inventar
 * `etiqueta` ou `imagem` aqui nao compilaria, e acrescenta-los ao vocabulario
 * so para enfeitar seis botoes seria alargar o vocabulario por conveniencia,
 * que e exatamente o que aquele arquivo existe para impedir.
 */
const TIPOS: Array<{ valor: TipoDeBloco; texto: string }> = [
  { valor: 'tabela_de_campos', texto: 'Tabela de campos' },
  { valor: 'campo',            texto: 'Um campo' },
  { valor: 'texto',            texto: 'Texto livre' },
  { valor: 'logo',             texto: 'Logo' },
  { valor: 'pagamento',        texto: 'Faixa de pagamento' },
  { valor: 'linha',            texto: 'Filete separador' },
];

/** Os 16 do enum `campo_de_fatura`. A tela nao inventa nome de campo. */
const CAMPOS_DISPONIVEIS = [
  'competencia', 'vencimento', 'numero_uc', 'distribuidora',
  'cliente_nome', 'cliente_documento', 'usina_codigo_geradora',
  'geracao_kwh_competencia', 'percentual_rateio_aplicado', 'consumo_kwh', 'tarifa_reais_por_kwh',
  'valor_consumo_centavos', 'valor_tarifas_concessionaria_centavos',
  'valor_juros_multa_centavos', 'valor_total_centavos', 'flag_fatura_cheia',
];

const ALCAS: Array<{ aresta: Aresta; estilo: React.CSSProperties }> = [
  { aresta: 'topo-esquerda',  estilo: { left: -4, top: -4, cursor: 'nwse-resize' } },
  { aresta: 'topo',           estilo: { left: '50%', top: -4, cursor: 'ns-resize' } },
  { aresta: 'topo-direita',   estilo: { right: -4, top: -4, cursor: 'nesw-resize' } },
  { aresta: 'esquerda',       estilo: { left: -4, top: '50%', cursor: 'ew-resize' } },
  { aresta: 'direita',        estilo: { right: -4, top: '50%', cursor: 'ew-resize' } },
  { aresta: 'base-esquerda',  estilo: { left: -4, bottom: -4, cursor: 'nesw-resize' } },
  { aresta: 'base',           estilo: { left: '50%', bottom: -4, cursor: 'ns-resize' } },
  { aresta: 'base-direita',   estilo: { right: -4, bottom: -4, cursor: 'nwse-resize' } },
];

const rotuloDoTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.texto ?? t;

export function EditorDeLayout() {
  const acao = useAcao();
  const dados = useDados<LayoutDoDocumento>(() => api.get('/cobranca/layout'));

  const [folha, setFolha] = useState<Folha | null>(null);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  const palco = useRef<HTMLDivElement>(null);
  const [larguraPx, setLarguraPx] = useState(0);

  useEffect(() => {
    if (dados.dado && !folha) { setFolha(dados.dado.folha); setBlocos(dados.dado.blocos); }
  }, [dados.dado, folha]);

  /*
   * A LARGURA DISPONIVEL VEM DO DOM, e por isso e estado e nao calculo.
   *
   * `escalaDaPrevia` trata o zero (antes do primeiro layout do navegador) como
   * escala 1 em vez de 0 ou NaN - a `W7d` prende isso. Sem aquele tratamento, o
   * primeiro quadro renderizaria a folha com `scale(0)` e o editor abriria
   * vazio, o que parece defeito de dado e nao de tempo.
   */
  useEffect(() => {
    const medir = () => setLarguraPx(palco.current?.clientWidth ?? 0);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [dados.dado]);

  if (dados.erro) return <Aviso tipo="erro">Falha ao ler o layout: {dados.erro}</Aviso>;
  if (!dados.dado || !folha) return <p className="fraco">Carregando o layout…</p>;

  const medidas = medidasComOrientacao(dados.dado.papeis[folha.papel], folha.orientacao);
  const area = areaDaFolha(dados.dado.papeis[folha.papel], folha);
  const escala = escalaDaPrevia(larguraPx, medidas.largura_mm);
  const PX_POR_MM = (96 / 25.4) * escala;

  const bloco = blocos.find((b) => b.id === selecionado) ?? null;
  const trocar = (id: string, mudanca: Partial<Bloco>) =>
    setBlocos((bs) => bs.map((b) => (b.id === id ? { ...b, ...mudanca } : b)));

  /*
   * O ARRASTO. `setPointerCapture` e o que faz o gesto sobreviver ao ponteiro
   * sair do bloco - sem ele, mover rapido "solta" o bloco no meio do caminho, e
   * o sintoma parece travamento em vez de captura faltando.
   *
   * O delta e convertido de pixel para MILIMETRO aqui, e so aqui: dividir pela
   * escala em qualquer outro lugar faria o bloco andar mais rapido que o cursor
   * quando a previa estivesse reduzida.
   */
  const iniciarGesto = (
    e: React.PointerEvent, id: string, aresta: Aresta | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelecionado(id);
    const alvo = blocos.find((b) => b.id === id);
    if (!alvo) return;
    const origem = { x: e.clientX, y: e.clientY };
    const inicial = { x_mm: alvo.x_mm, y_mm: alvo.y_mm, largura_mm: alvo.largura_mm, altura_mm: alvo.altura_mm };
    (e.target as Element).setPointerCapture(e.pointerId);

    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - origem.x) / PX_POR_MM;
      const dy = (ev.clientY - origem.y) / PX_POR_MM;
      trocar(id, aresta ? redimensionar(inicial, aresta, dx, dy, area) : arrastar(inicial, dx, dy, area));
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  const acrescentar = (tipo: TipoDeBloco) => {
    const g = blocoNovo(tipo, area);
    const id = `novo-${Date.now()}-${blocos.length}`;
    setBlocos([...blocos, {
      id, tipo, campo: tipo === 'campo' ? 'valor_total_centavos' : null,
      texto: tipo === 'texto' ? 'Texto' : null,
      x_mm: g.x_mm, y_mm: g.y_mm, largura_mm: g.largura_mm, altura_mm: g.altura_mm,
      alinhamento: 'esquerda', tamanho_pt: 10, peso: 'normal',
      borda: false, fundo: false,
      // Nasce por CIMA do que ja existe: um bloco novo invisivel atras de outro
      // pareceria que o botao nao funcionou.
      z: blocos.reduce((m, b) => Math.max(m, b.z), 0) + 1,
    }]);
    setSelecionado(id);
  };

  const salvar = async () => {
    const r = await acao.executar(() => api.put('/cobranca/layout', { folha, blocos }));
    if (r) {
      setAvisos(((r as any).avisos ?? []).map((a: any) => a.detalhe as string));
      dados.recarregar();
    }
  };

  const voltarAoPadrao = async () => {
    if (!confirm('Voltar ao layout padrão? Os blocos que você posicionou são apagados.')) return;
    const r = await acao.executar(() => api.put('/cobranca/layout', { folha, blocos: [] }));
    if (r) { setAvisos([]); setSelecionado(null); dados.recarregar(); window.location.reload(); }
  };

  return (
    <div className="cartao" style={{ marginBottom: 20 }}>
      <div style={{ ...linha }}>
        <h2 style={{ margin: 0 }}><Icone nome="documento" tamanho={17} /> Onde cada coisa fica na folha</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => void voltarAoPadrao()} disabled={acao.ocupado}>
            <Icone nome="recarregar" tamanho={15} /> Voltar ao padrão
          </button>
          <button className="primario" onClick={() => void salvar()} disabled={acao.ocupado}>
            <Icone nome={acao.ocupado ? 'carregando' : 'confirmar'} tamanho={15} peso="bold" /> Salvar a folha
          </button>
        </div>
      </div>
      <p className="sub">
        Escolha o papel e arraste os elementos. <strong>A folha aqui tem o tamanho real do papel</strong> —
        o que você vê é o que sai na impressora. {dados.dado.blocos.length === 0 && (
          <>Você ainda não posicionou nada: <strong>este é o layout padrão</strong>, e salvar o transforma no seu.</>
        )}
      </p>

      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {avisos.length > 0 && (
        <Aviso tipo="alerta">
          Salvo, e há o que olhar: {avisos.join(' · ')}
        </Aviso>
      )}

      {/* ------------------------------------------------------- a folha */}
      <div style={{ ...linha, marginBottom: 12 }}>
        <label style={{ fontSize: 13 }}>Papel</label>
        <Escolha valor={folha.papel} rotuloAcessivel="Tamanho do papel"
                 ao={(v) => setFolha({ ...folha, papel: v as Papel })}
                 opcoes={Object.entries(dados.dado.papeis).map(([k, p]) => ({ valor: k, texto: p.rotulo }))} />
        <Escolha valor={folha.orientacao} rotuloAcessivel="Orientação"
                 ao={(v) => setFolha({ ...folha, orientacao: v as Folha['orientacao'] })}
                 opcoes={[{ valor: 'retrato', texto: 'Retrato' }, { valor: 'paisagem', texto: 'Paisagem' }]} />
        <span className="fraco" style={{ fontSize: 13 }}>Margens (mm)</span>
        {([['margem_topo_mm', 'topo'], ['margem_direita_mm', 'direita'],
           ['margem_baixo_mm', 'baixo'], ['margem_esquerda_mm', 'esquerda']] as const).map(([k, r]) => (
          <input key={k} type="number" step="0.5" min="0" max="100" value={folha[k]} aria-label={`Margem ${r}`}
                 style={{ width: 74 }}
                 onChange={(e) => setFolha({ ...folha, [k]: naGrade(Number(e.target.value)) })} />
        ))}
      </div>

      <div style={{ ...linha, marginBottom: 12 }}>
        <span className="fraco" style={{ fontSize: 13 }}>Acrescentar:</span>
        {TIPOS.map((t) => (
          <button key={t.valor} onClick={() => acrescentar(t.valor)}>+ {t.texto}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* O PALCO. `height` reservado pela folha escalada: sem isso a caixa
            colapsa, porque `transform` nao ocupa espaco no fluxo. */}
        <div ref={palco} style={{ flex: '1 1 420px', minWidth: 280,
                                  height: medidas.altura_mm * PX_POR_MM + 2, overflow: 'hidden' }}>
          <div className="folha-palco" style={{ ['--escala' as any]: escala }}>
            <div className="folha" style={{
              ['--folha-w' as any]: `${medidas.largura_mm}mm`,
              ['--folha-h' as any]: `${medidas.altura_mm}mm`,
            }} onPointerDown={() => setSelecionado(null)}>
              <div className="margem-guia" style={{
                left: `${area.x_mm}mm`, top: `${area.y_mm}mm`,
                width: `${area.largura_mm}mm`, height: `${area.altura_mm}mm`,
              }} />
              {blocos.map((b) => (
                <div key={b.id} className={`bloco${b.borda ? ' bloco-borda' : ''}${b.fundo ? ' bloco-fundo' : ''}`}
                     onPointerDown={(e) => iniciarGesto(e, b.id, null)}
                     style={{
                       left: `${b.x_mm}mm`, top: `${b.y_mm}mm`,
                       width: `${b.largura_mm}mm`, height: `${b.altura_mm}mm`,
                       zIndex: b.z + 1, cursor: 'move',
                       outline: b.id === selecionado ? '2px solid var(--acento)' : '1px dashed var(--borda)',
                       fontSize: `${b.tamanho_pt}pt`,
                       fontWeight: b.peso === 'forte' ? 700 : 400,
                       textAlign: b.alinhamento === 'esquerda' ? 'left' : b.alinhamento === 'centro' ? 'center' : 'right',
                       display: 'flex', alignItems: 'center', padding: '1mm',
                     }}>
                  <span style={{ pointerEvents: 'none', width: '100%', opacity: .75 }}>
                    {b.tipo === 'texto' ? b.texto : b.tipo === 'campo' ? b.campo : rotuloDoTipo(b.tipo)}
                  </span>
                  {b.id === selecionado && ALCAS.map((a) => (
                    <span key={a.aresta} role="presentation"
                          onPointerDown={(e) => iniciarGesto(e, b.id, a.aresta)}
                          style={{
                            position: 'absolute', width: 9, height: 9, background: 'var(--acento)',
                            borderRadius: 2, ...a.estilo,
                          }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------------------------- o painel do bloco */}
        <div style={{ flex: '0 0 300px', minWidth: 260 }}>
          {!bloco && <p className="fraco" style={{ fontSize: 13 }}>Clique num elemento da folha para ajustá-lo.</p>}
          {bloco && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ ...linha }}>
                <strong>{rotuloDoTipo(bloco.tipo)}</strong>
                <BotaoDeIcone icone="remover" rotulo={`Remover ${rotuloDoTipo(bloco.tipo)}`}
                              ao={() => { setBlocos(blocos.filter((b) => b.id !== bloco.id)); setSelecionado(null); }} />
              </div>

              {bloco.tipo === 'campo' && (
                <Escolha valor={bloco.campo ?? ''} rotuloAcessivel="Campo"
                         ao={(v) => trocar(bloco.id, { campo: v })}
                         opcoes={CAMPOS_DISPONIVEIS.map((c) => ({ valor: c, texto: c }))} />
              )}
              {bloco.tipo === 'texto' && (
                <textarea value={bloco.texto ?? ''} aria-label="Texto do bloco" rows={3}
                          onChange={(e) => trocar(bloco.id, { texto: e.target.value })} />
              )}

              {/* AS COORDENADAS EM NUMERO, e nao so por arrasto. Alinhar dois
                  blocos pelo olho e impossivel; digitar 16 nos dois e trivial. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([['x_mm', 'X (mm)'], ['y_mm', 'Y (mm)'],
                   ['largura_mm', 'Largura'], ['altura_mm', 'Altura']] as const).map(([k, r]) => (
                  <label key={k} style={{ fontSize: 12 }}>{r}
                    <input type="number" step="0.5" value={bloco[k]} aria-label={r}
                           onChange={(e) => trocar(bloco.id, { [k]: naGrade(Number(e.target.value)) } as Partial<Bloco>)} />
                  </label>
                ))}
              </div>

              <Escolha valor={bloco.alinhamento} rotuloAcessivel="Alinhamento"
                       ao={(v) => trocar(bloco.id, { alinhamento: v as Bloco['alinhamento'] })}
                       opcoes={[{ valor: 'esquerda', texto: 'À esquerda' },
                                { valor: 'centro', texto: 'Centralizado' },
                                { valor: 'direita', texto: 'À direita' }]} />
              <label style={{ fontSize: 12 }}>Tamanho (pt)
                <input type="number" min={6} max={72} value={bloco.tamanho_pt} aria-label="Tamanho em pontos"
                       onChange={(e) => trocar(bloco.id, { tamanho_pt: Number(e.target.value) })} />
              </label>
              <Interruptor ligado={bloco.peso === 'forte'} rotulo="Negrito" rotuloAcessivel="Negrito"
                           ao={(v) => trocar(bloco.id, { peso: v ? 'forte' : 'normal' })} />
              <Interruptor ligado={bloco.borda} rotulo="Borda" rotuloAcessivel="Borda"
                           ao={(v) => trocar(bloco.id, { borda: v })} />
              <Interruptor ligado={bloco.fundo} rotulo="Fundo cinza" rotuloAcessivel="Fundo cinza"
                           ao={(v) => trocar(bloco.id, { fundo: v })} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A geometria de um bloco em `mm`, para quem so pinta. Usada pela Previa. */
export const estiloDoBloco = (b: {
  x_mm: number; y_mm: number; largura_mm: number; altura_mm: number;
  tamanho_pt: number; peso: string; alinhamento: string; z: number;
}): React.CSSProperties => ({
  left: `${b.x_mm}mm`, top: `${b.y_mm}mm`,
  width: `${b.largura_mm}mm`, height: `${b.altura_mm}mm`,
  fontSize: `${b.tamanho_pt}pt`,
  fontWeight: b.peso === 'forte' ? 700 : 400,
  textAlign: b.alinhamento === 'esquerda' ? 'left' : b.alinhamento === 'centro' ? 'center' : 'right',
  zIndex: b.z + 1,
});

export type { Retangulo };
