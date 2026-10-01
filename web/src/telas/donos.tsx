// DONOS DE USINA — para quem vai o repasse, 70% do consumo.
//
// AUD-08: nulo em 3 de 3 usinas em producao. Nao impede faturar (a cobranca ao
// cliente nao depende disso), mas a R12 bloqueia o SPLIT inteiro quando a fatura
// for paga - e ai o repasse acumula sem destino. E por isso a tela existe antes
// da primeira liquidacao, e nao depois.

import { useState } from 'react';
import { api, type DonoUsina, type Usina } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, Busca, Ferramentas, Filtro, ThOrd, Marca, Icone, DetalheTecnico,
  useOrdenacao, ordenar, contem, BotaoDeCriar, PainelDeCriar,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';

export function TelaDonos() {
  const donos = useDados<DonoUsina[]>(() => api.get('/donos-usina'));
  const semDono = useDados<Usina[]>(() => api.get('/usinas-sem-dono'));
  const acao = useAcao();
  const [f, setF] = useState({ nome: '', natureza: 'pf', documento_bruto: '', chave_pix: '', email: '' });
  const p = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const { ordem, alternar } = useOrdenacao('nome');
  /* LISTAR ANTES DE CRIAR (30/09/2026, etapa 4a): o formulario abria a tela,
     vazio, acima da lista. «Novo dono» abre o painel logo abaixo do titulo. */
  const [criando, setCriando] = useState(false);

  const todos = donos.dado ?? [];
  const visiveis = ordenar(
    todos.filter((d) =>
      (contem(d.nome, busca) || contem(d.documento, busca) || contem(d.chave_pix, busca)) &&
      (!situacao || (situacao === 'ativo') === d.ativo)),
    ordem,
    {
      nome: (d) => d.nome,
      documento: (d) => d.documento,
      pix: (d) => d.chave_pix ?? d.banco,
      situacao: (d) => (d.ativo ? 0 : 1),
    },
  );

  async function criar() {
    const ok = await acao.executar(() => api.post('/donos-usina', {
      nome: f.nome.trim(), natureza: f.natureza, documento_bruto: f.documento_bruto.trim(),
      chave_pix: f.chave_pix.trim() || null, email: f.email.trim() || null,
    }));
    if (ok) {
      setF({ nome: '', natureza: 'pf', documento_bruto: '', chave_pix: '', email: '' });
      acao.anunciar('Dono cadastrado — agora vincule-o à usina na tela Usinas.');
      donos.recarregar(); semDono.recarregar();
      setCriando(false);
    }
  }

  return (
    <Pagina titulo="Donos de usina"
            sub="O maior fluxo de dinheiro do sistema. Exige chave Pix ou conta completa — conferido no cadastro, porque no pagamento já é tarde."
            acao={<BotaoDeCriar controla="novo-dono" aberto={criando} ao={() => { acao.limpar(); setCriando(!criando); }}>
              Novo dono
            </BotaoDeCriar>}>
      {criando && (
        <PainelDeCriar id="novo-dono" titulo="Novo dono de usina" aoFechar={() => setCriando(false)}>
          <div className="campos">
            <Campo rotulo="Nome" porqueDe="dono-usina" valor={f.nome} ao={p('nome')} />
            <Campo rotulo="Natureza" porqueDe="dono-usina" valor={f.natureza} ao={p('natureza')}
                   opcoes={[{ valor: 'pf', texto: 'Pessoa física' }, { valor: 'pj', texto: 'Pessoa jurídica' }]} />
            <Campo rotulo="Documento" porqueDe="dono-usina" valor={f.documento_bruto} ao={p('documento_bruto')} dica="CPF ou CNPJ" />
            <Campo rotulo="Chave Pix" porqueDe="dono-usina" valor={f.chave_pix} ao={p('chave_pix')} />
            <Campo rotulo="E-mail" porqueDe="dono-usina" valor={f.email} ao={p('email')} />
          </div>
          <p className="nota-do-painel">
            Depois de cadastrar, vincule o dono à usina dele na tela Usinas — é o vínculo que faz a
            parte dele ser repassada.
          </p>
          {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
          <div className="painel-criar-pe">
            <button className="primario" onClick={criar}
                    disabled={acao.ocupado || !f.nome.trim() || !f.documento_bruto.trim()}>
              <Icone nome="acrescentar" tamanho={15} peso="bold" /> Cadastrar
            </button>
            <button type="button" onClick={() => setCriando(false)}>Cancelar</button>
          </div>
        </PainelDeCriar>
      )}
      <RetornoDoAto texto={!criando && acao.sucesso ? (
        <>{acao.sucesso} <Ligacao para="/usinas?pendencia=sem_dono">Abrir Usinas</Ligacao></>
      ) : null} />

      {/*
        ÂMBAR E NÃO VERMELHO (30/09/2026, etapa 4a). Usina sem dono é cadastro a
        completar, e não falha: dá para cobrar os clientes dela, e o que trava é
        o repasse quando o dinheiro entrar. A frase agora diz os dois passos e
        leva ao segundo; o código da regra foi para o «detalhe técnico».
      */}
      {(semDono.dado?.length ?? 0) > 0 && (
        <Aviso tipo="alerta">
          <strong>
            {semDono.dado!.length === 1 ? '1 usina sem dono' : `${semDono.dado!.length} usinas sem dono`}:{' '}
            {semDono.dado!.map((u) => u.codigo_geradora).join(', ')}.
          </strong>{' '}
          Dá para cobrar os clientes dela{semDono.dado!.length === 1 ? '' : 's'}; o que trava é o repasse
          ao dono quando o dinheiro entrar. Cadastre o dono aqui, em «Novo dono», e depois{' '}
          <Ligacao para="/usinas?pendencia=sem_dono">vincule-o à usina em Usinas</Ligacao>.
          <DetalheTecnico>
            <p style={{ margin: 0 }}>
              A R12 bloqueia a repartição inteira da liquidação de usina sem dono (AUD-08).
            </p>
          </DetalheTecnico>
        </Aviso>
      )}

      {donos.erro && <Aviso tipo="erro">{donos.erro}</Aviso>}

      <Ferramentas contagem={todos.length ? `${visiveis.length} de ${todos.length}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por nome, documento ou Pix…" />
        <Filtro valor={situacao} ao={setSituacao} rotulo="Filtrar por situação"
                opcoes={[{ valor: '', texto: 'Todas as situações' },
                         { valor: 'ativo', texto: 'Ativos' },
                         { valor: 'inativo', texto: 'Inativos' }]} />
        {(busca || situacao) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="nome" ordem={ordem} ao={alternar}>Nome</ThOrd>
                <ThOrd chave="documento" ordem={ordem} ao={alternar}>Documento</ThOrd>
                <ThOrd chave="pix" ordem={ordem} ao={alternar}>Pix</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                <th>Ações</th>
              </>}
              vazio={todos.length
                ? 'Nenhum dono corresponde à busca ou aos filtros.'
                : 'Nenhum dono cadastrado ainda. Use «Novo dono», no alto.'}>
        {visiveis.map((d) => (
          <LinhaDoDono key={d.id} d={d} aoSalvar={() => donos.recarregar()} />
        ))}
      </Tabela>
    </Pagina>
  );
}

/* ======================================================= corrigir um dono
 *
 * `PATCH /donos-usina/:id` existe desde 28/07/2026 e ate 08/09 nao tinha **nem
 * tela nem script** — nao existe `npm run donos`. Cadastrar era possivel;
 * corrigir, nao.
 *
 * O QUE ISSO SIGNIFICA EM DINHEIRO: a chave Pix e para onde vao **70%** do que o
 * cliente paga (`regra_repasse`, as quatro usinas). Uma chave digitada errada no
 * cadastro so seria descoberta no primeiro repasse — e ate hoje o unico conserto
 * era `curl` com token, ou apagar e recriar, que perde a trilha.
 *
 * `editar` no servidor e PATCH de verdade: so escreve o que vem, campo a campo.
 * Entao mandar apenas o que mudou nao apaga o resto — ao contrario do conector
 * de cobranca, que e upsert e cuja armadilha foi fechada no mesmo dia.
 */
function LinhaDoDono({ d, aoSalvar }: { d: DonoUsina; aoSalvar: () => void }) {
  const acao = useAcao();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(d.nome);
  const [pix, setPix] = useState(d.chave_pix ?? '');

  const salvar = async () => {
    const mudou: Record<string, unknown> = {};
    if (nome.trim() && nome.trim() !== d.nome) mudou.nome = nome.trim();
    if (pix.trim() !== (d.chave_pix ?? '')) mudou.chave_pix = pix.trim() || null;
    if (Object.keys(mudou).length === 0) { setEditando(false); return; }
    const ok = await acao.executar(() => api.patch(`/donos-usina/${d.id}`, mudou));
    if (ok) { setEditando(false); aoSalvar(); }
  };

  return (
    <>
      <tr>
        <td>{d.nome} <span className="fraco">· {d.natureza.toUpperCase()}</span></td>
        <td className="fraco">{d.documento}</td>
        <td className="fraco">{d.chave_pix ?? d.banco ?? '—'}</td>
        <td className="c-sit"><Marca tom={d.ativo ? 'ok' : 'neutro'}>{d.ativo ? 'Ativo' : 'Inativo'}</Marca></td>
        <td>
          <button type="button" onClick={() => setEditando(!editando)}>
            <Icone nome="confirmar" tamanho={14} /> {editando ? 'Fechar' : 'Corrigir'}
          </button>
        </td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={5}>
            <div className="campos">
              <Campo rotulo="Nome ou razão social" valor={nome} ao={setNome} />
              <Campo rotulo="Chave Pix" valor={pix} ao={setPix}
                     dica="É para onde vai a parte do dono" />
            </div>
            <p className="sub">
              <strong>A chave Pix é para onde vai a parte do dono da usina</strong> — hoje 70% do
              que o cliente paga. Confira caractere a caractere: uma chave errada só aparece no
              primeiro repasse, e aí o dinheiro já saiu.
              {' '}O documento não se corrige aqui: ele identifica a pessoa, e trocá-lo é outro
              cadastro.
            </p>
            {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
            <button className="primario" onClick={() => void salvar()} disabled={acao.ocupado}>
              <Icone nome="confirmar" tamanho={15} peso="bold" /> Salvar a correção
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
