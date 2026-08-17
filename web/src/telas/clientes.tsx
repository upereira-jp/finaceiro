// CLIENTES — e desde 17/08/2026 esta é a tela que fecha a camada `documento`.
//
// O QUE MUDOU, e por quê. Até aqui a aba LISTAVA e CADASTRAVA, e não EDITAVA: o
// CPF/CNPJ de quem já estava na carteira só entrava por `npm run documentos`, um
// script rodado de um Codespace, contra produção, por quem tem o repositório
// clonado e o `.env` na mão. Quem opera não tem nada disso — e a `PENDENCIAS.md`
// §2.a mede o resultado: **0 de 29**.
//
// E a ausência não é cosmética. Ela trava as duas pontas do dinheiro:
//
//   R9      `podeAtivarContrato` recusa levar contrato para `ativo` sem documento
//           VALIDADO. Sem contrato ativo a triagem recusa por
//           `sem_contrato_vigente` — os 29 contratos a digitar viram 29 rascunhos
//           e 29 recusas 422;
//   boleto  `PagadorSemDocumento` (422) para a emissão antes de falar com o banco.
//
// O IMPORTADOR EM LOTE CONTINUA EXISTINDO, e continua sendo o caminho certo para
// 29 linhas de uma vez, com conferência de colisão antes de escrever qualquer
// coisa (`Q-CLIENTEDUP-01`). O que esta tela acrescenta é o caminho de UMA linha:
// o cliente que ligou agora, o CPF que veio errado, o cadastro feito à mão.
//
// A DISTINÇÃO QUE A TELA MOSTRA É A R8, e ela é contraintuitiva o bastante para
// estar aqui: documento vindo do CRM entra com `documento_validado = FALSE` mesmo
// passando no dígito verificador. Uma coluna "Documento" com um CPF escrito nela
// diria que está resolvido; não está — e o que destrava o contrato é a coluna ao
// lado. As regras estão em `clientes-regras.ts`, puras e com 34 verificações.

import { useState } from 'react';
import { api, type Cliente } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, Filtro, ThOrd, Marca, Icone, BotaoDeIcone,
  useOrdenacao, ordenar, contem,
} from '../ui.tsx';
import {
  situacaoDoDocumento, contarDocumentos, formatarDocumento, tipoPeloComprimento,
  motivoDaTravaDoDocumento, podeGravarDocumento,
  ROTULO_DA_SITUACAO_DO_DOCUMENTO, TOM_DA_SITUACAO_DO_DOCUMENTO,
  type MotivoDeTravaDoDocumento,
} from '../clientes-regras.ts';

/** As duas situações de cliente, para o filtro e para a pílula. */
const SITUACOES = [
  { valor: '', texto: 'Todas as situações' },
  { valor: 'ativo', texto: 'Ativos' },
  { valor: 'inativo', texto: 'Inativos' },
];

const EXPLICACAO_DA_TRAVA: Record<MotivoDeTravaDoDocumento, string> = {
  ocupado: 'Gravando…',
  sem_mudanca: 'Digite o CPF ou o CNPJ.',
  comprimento: 'CPF tem 11 e CNPJ tem 14 caracteres.',
};

export function TelaClientes() {
  /*
   * O ESCOPO E DA CARTEIRA ATIVA, e e ele que decide o que a rota devolve.
   *
   * `carteira_ativa` (padrao) = so quem tem UC na etapa `Desconto Ativo` do
   * funil `Rateio` - 29 em producao. `todos` = o cadastro inteiro, 86, e existe
   * para que cliente criado a mao nao fique inalcancavel.
   */
  const [escopo, setEscopo] = useState<'carteira_ativa' | 'todos'>('carteira_ativa');
  const lista = useDados<Cliente[]>(
    () => api.get(`/clientes?limite=500${escopo === 'todos' ? '&escopo=todos' : ''}`),
    [escopo],
  );
  const acao = useAcao();
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');

  const [busca, setBusca] = useState('');
  /*
   * O FILTRO DE SITUACAO ABRE VAZIO DE NOVO, e agora isso esta certo.
   *
   * Ele passou a "Ativos" mais cedo em 04/08 para tirar da tela as 41 vitimas
   * de merge. Depois o recorte subiu para o SERVIDOR - a rota devolve so a
   * carteira ativa -, e nenhuma vitima de merge chega mais ate aqui. Manter o
   * filtro pre-aplicado esconderia, dentro das 29, uma que alguem tivesse
   * desativado a mao: duas peneiras empilhadas para o mesmo proposito, e a
   * segunda invisivel.
   */
  const [situacao, setSituacao] = useState('');
  /* O FILTRO DE PENDENCIA EXISTE POR CAUSA DA DIGITACAO, e e o mesmo argumento
   * da aba Unidades: sao 29 clientes para preencher, e "mostrar so os que
   * faltam" e a diferenca entre conferir uma lista que encolhe e cacar linha por
   * linha numa lista que nao muda. */
  const [pendencia, setPendencia] = useState('');
  const { ordem, alternar } = useOrdenacao('nome');

  /** O que está sendo digitado, por cliente. Fora do `map` para sobreviver ao
   *  re-render que a gravação provoca. */
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  /** Quem está com o painel de contato aberto. Um por vez: telefone e e-mail são
   *  o caso raro, e quatro campos por linha em 29 linhas é um formulário gigante
   *  disfarçado de lista — a lição que a aba Unidades já registrou. */
  const [aberto, setAberto] = useState<string | null>(null);

  const todos = lista.dado ?? [];
  const visiveis = ordenar(
    todos.filter((c) =>
      (contem(c.nome, busca) || contem(c.documento, busca)) &&
      (!situacao || (situacao === 'ativo') === c.ativo) &&
      (!pendencia || situacaoDoDocumento(c) === pendencia)),
    ordem,
    {
      nome: (c) => c.nome,
      documento: (c) => c.documento,
      documento_estado: (c) => situacaoDoDocumento(c),
      situacao: (c) => (c.ativo ? 0 : 1),
    },
  );

  const contagem = contarDocumentos(todos);

  async function criar() {
    // `documento_bruto` e opcional no cliente (o indice e parcial), ao contrario
    // de originador e dono de usina, onde a coluna e NOT NULL.
    const ok = await acao.executar(() => api.post('/clientes', {
      nome: nome.trim(), documento_bruto: doc.trim() || undefined, documento_origem: 'coleta_local',
    }));
    if (ok) { setNome(''); setDoc(''); acao.anunciar('Cliente cadastrado.'); lista.recarregar(); }
  }

  /**
   * GRAVA O DOCUMENTO DE UM CLIENTE. `PATCH /clientes/:id`, que já existia — o
   * que faltava era a tela.
   *
   * `documento_origem: 'coleta_local'` NÃO É DETALHE, é o campo que faz a
   * gravação valer: `classificar()` só marca `documento_validado = true` quando a
   * origem é local E o dígito fecha (R8). Mandar a semente do CRM de volta com
   * origem `crm_semente` gravaria o mesmo texto e continuaria não destravando
   * contrato nenhum. Quem digita aqui está confirmando, e é isso que a origem diz.
   *
   * VAZIO APAGA, de propósito: um documento gravado na pessoa errada tem de poder
   * sair. `classificar('')` devolve os quatro campos nulos, e não uma string vazia.
   */
  async function salvarDocumento(c: Cliente) {
    const texto = edicao[c.id];
    if (texto === undefined) return;
    const ok = await acao.executar(() => api.patch(`/clientes/${c.id}`, {
      documento_bruto: texto.trim(), documento_origem: 'coleta_local',
    }));
    if (ok) {
      acao.anunciar(texto.trim()
        ? `Documento de ${c.nome} gravado.`
        : `Documento de ${c.nome} removido.`);
      setEdicao((e) => { const { [c.id]: _, ...resto } = e; return resto; });
      lista.recarregar();
    }
  }

  async function salvarContato(c: Cliente, telefone: string, email: string) {
    const ok = await acao.executar(() => api.patch(`/clientes/${c.id}`, {
      telefone: telefone.trim() || null, email: email.trim() || null,
    }));
    if (ok) { acao.anunciar(`Contato de ${c.nome} gravado.`); setAberto(null); lista.recarregar(); }
  }

  return (
    <Pagina titulo="Clientes"
            sub="A carteira ativa: quem tem unidade consumidora na etapa Desconto Ativo do funil Rateio. O CPF/CNPJ se digita aqui — sem ele validado o contrato não ativa (R9) e o boleto não sai.">

      {/* ------------------------------------------------ o que ainda falta */}
      {contagem.sem_documento > 0 && (
        <Aviso tipo="erro">
          <strong>{contagem.sem_documento} de {contagem.total} sem CPF/CNPJ.</strong> Sem ele o
          contrato não pode ir para <code>ativo</code> (R9), a triagem recusa por{' '}
          <code>sem_contrato_vigente</code> e o boleto para em{' '}
          <code>PagadorSemDocumento</code> antes de falar com o banco. Digite na coluna Documento —
          ou, para a carteira inteira de uma vez, use <code>npm run documentos</code>, que confere
          colisão de documento repetido antes de escrever qualquer linha.
        </Aviso>
      )}
      {contagem.nao_validados > 0 && (
        <Aviso tipo="alerta">
          <strong>{contagem.nao_validados} com documento preenchido que ainda não vale.</strong>{' '}
          Documento vindo do CRM entra como <em>semente</em> e não conta, mesmo com o dígito
          correto — lá o campo é livre, e dígito certo não prova que o documento é daquela pessoa
          (R8). <strong>Reenviar o mesmo número por aqui é o ato que o valida</strong>: basta
          conferir e gravar.
        </Aviso>
      )}

      <div className="cartao secao">
        <div className="campos">
          <Campo rotulo="Nome" valor={nome} ao={setNome} />
          <Campo rotulo="Documento (CPF ou CNPJ)" valor={doc} ao={setDoc} dica="Opcional" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={criar} disabled={acao.ocupado || !nome.trim()}>
              <Icone nome="acrescentar" tamanho={15} peso="bold" /> Cadastrar
            </button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {lista.erro && <Aviso tipo="erro">{lista.erro}</Aviso>}

      <Ferramentas contagem={todos.length
        ? `${visiveis.length} de ${todos.length}${escopo === 'carteira_ativa' ? ' na carteira ativa' : ' no cadastro'} · ${contagem.validados} com documento validado`
        : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por nome ou documento…" />
        <Filtro valor={situacao} ao={setSituacao} rotulo="Filtrar por situação" opcoes={SITUACOES} />
        {/* As opcoes saem do vocabulario FECHADO de `clientes-regras`, e nao de
            uma lista escrita aqui: um estado novo sem opcao de filtro ficaria
            invisivel. E o mesmo motivo pelo qual a aba Unidades passou a derivar
            as dela do `Record`. */}
        <Filtro valor={pendencia} ao={setPendencia} rotulo="Filtrar por documento"
                opcoes={[{ valor: '', texto: 'Todos os documentos' },
                         ...(Object.keys(ROTULO_DA_SITUACAO_DO_DOCUMENTO) as
                              Array<keyof typeof ROTULO_DA_SITUACAO_DO_DOCUMENTO>)
                           .map((k) => ({ valor: k, texto: ROTULO_DA_SITUACAO_DO_DOCUMENTO[k] }))]} />
        {/* O ESCOPO E O RECORTE DO SERVIDOR, e nao mais um filtro de tela: trocar
            aqui muda a CONSULTA. Fica ao lado dos outros para quem opera nao ter
            de saber a diferenca - e o rotulo diz o que cada um traz. */}
        <Filtro valor={escopo} ao={(v) => setEscopo(v as 'carteira_ativa' | 'todos')}
                rotulo="Escopo da lista"
                opcoes={[{ valor: 'carteira_ativa', texto: 'Carteira ativa' },
                         { valor: 'todos', texto: 'Todo o cadastro' }]} />
        {(busca || situacao || pendencia) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); setPendencia(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="nome" ordem={ordem} ao={alternar}>Nome</ThOrd>
                <ThOrd chave="documento" ordem={ordem} ao={alternar}>Documento</ThOrd>
                <ThOrd chave="documento_estado" ordem={ordem} ao={alternar}>Vale para o contrato</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                <th>Contato</th>
              </>}
              vazio={todos.length
                ? 'Nenhum cliente corresponde à busca ou aos filtros.'
                : <>Nenhum cliente — rode <code>npm run ciclo -- --valendo</code> para espelhar do CRM.</>}>
        {visiveis.map((c) => (
          <LinhaDeCliente
            key={c.id} c={c}
            texto={edicao[c.id]}
            aoDigitar={(v) => setEdicao({ ...edicao, [c.id]: v })}
            aoGravar={() => void salvarDocumento(c)}
            ocupado={acao.ocupado}
            aberto={aberto === c.id}
            abrir={() => setAberto(aberto === c.id ? null : c.id)}
            aoGravarContato={(t, e) => void salvarContato(c, t, e)}
          />
        ))}
      </Tabela>

      <p className="sub" style={{ marginTop: 12 }}>
        <strong>Vale para o contrato</strong> é a R9 e não a presença do campo: só documento
        coletado localmente e com dígito conferido destrava a transição para <code>ativo</code>.
        Documento com dígito errado <strong>grava assim mesmo</strong> — o sistema nasce sobre
        cadastro incompleto, e travar na porta impediria a própria migração. O que ele bloqueia é
        o contrato, mais adiante, onde a decisão tem consequência.
      </p>
    </Pagina>
  );
}

// --------------------------------------------------------------- a linha

function LinhaDeCliente(p: {
  c: Cliente;
  texto: string | undefined;
  aoDigitar: (v: string) => void;
  aoGravar: () => void;
  ocupado: boolean;
  aberto: boolean;
  abrir: () => void;
  aoGravarContato: (telefone: string, email: string) => void;
}) {
  const { c } = p;
  const estado = situacaoDoDocumento(c);
  /* O CAMPO MOSTRA O QUE ESTA GRAVADO ENQUANTO NINGUEM DIGITOU, e mascarado: um
   * CPF em 11 digitos corridos e conferido caractere a caractere por quem le, e
   * e ai que o erro passa. Assim que alguem digita, o texto e da pessoa - a
   * mascara nao briga com o cursor. */
  const valor = p.texto ?? formatarDocumento(c.documento);
  const trava = motivoDaTravaDoDocumento({ texto: valor, atual: c.documento, ocupado: p.ocupado });
  const tipo = tipoPeloComprimento(valor);

  return (
    <>
      <tr>
        <td>{c.nome}</td>
        <td style={{ minWidth: 210 }}>
          <div className="inline">
            <input value={valor} className="mono"
                   aria-label={`CPF ou CNPJ de ${c.nome}`}
                   onChange={(e) => p.aoDigitar(e.target.value)}
                   placeholder="000.000.000-00" style={{ width: 150 }} />
            <BotaoDeIcone icone="confirmar" rotulo={`Gravar o documento de ${c.nome}`}
                          ao={p.aoGravar}
                          desabilitado={!podeGravarDocumento({
                            texto: valor, atual: c.documento, ocupado: p.ocupado })} />
          </div>
          {/* A dica so aparece quando ha o que dizer: um rodape fixo em 29 linhas
              vira ruido que ninguem le, inclusive quando importa. */}
          {trava === 'comprimento' && (
            <span className="fraco" style={{ fontSize: 12 }}>
              {EXPLICACAO_DA_TRAVA.comprimento}
            </span>
          )}
          {trava === null && tipo && p.texto !== undefined && (
            <span className="fraco" style={{ fontSize: 12 }}>{tipo.toUpperCase()} — grave para validar.</span>
          )}
        </td>
        <td>
          <Marca tom={TOM_DA_SITUACAO_DO_DOCUMENTO[estado]}>
            {ROTULO_DA_SITUACAO_DO_DOCUMENTO[estado]}
          </Marca>
        </td>
        <td><Marca tom={c.ativo ? 'ok' : 'pendente'}>{c.ativo ? 'Ativo' : 'Inativo'}</Marca></td>
        <td>
          <button onClick={p.abrir} aria-expanded={p.aberto}>
            <Icone nome="clientes" tamanho={14} />
            {p.aberto ? 'Fechar' : 'Telefone e e-mail'}
          </button>
        </td>
      </tr>
      {p.aberto && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--fundo-recuo)' }}>
            <Contato c={c} ocupado={p.ocupado} aoGravar={p.aoGravarContato} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * TELEFONE E E-MAIL, no painel recuado.
 *
 * Eles NÃO travam nada — não há regra do sistema que dependa deles — e é por isso
 * que não estão na linha: quatro campos editáveis em 29 linhas desenham um
 * formulário gigante disfarçado de lista, que foi a lição registrada na aba
 * Unidades em 30/07. Estão aqui porque o cadastro espelhado do CRM chega
 * incompleto e alguém precisa poder corrigir sem `curl`.
 */
function Contato({ c, ocupado, aoGravar }: {
  c: Cliente; ocupado: boolean; aoGravar: (telefone: string, email: string) => void;
}) {
  const [telefone, setTelefone] = useState(c.telefone ?? '');
  const [email, setEmail] = useState(c.email ?? '');
  return (
    <div style={{ padding: '12px 4px', display: 'grid', gap: 10 }}>
      <div className="campos">
        <Campo rotulo="Telefone" valor={telefone} ao={setTelefone} dica="Como o CRM traz, ou corrigido" />
        <Campo rotulo="E-mail" valor={email} ao={setEmail} dica="Gravado em minúsculas" />
        <div style={{ alignSelf: 'end' }}>
          <button className="primario" disabled={ocupado} onClick={() => aoGravar(telefone, email)}>
            <Icone nome="confirmar" tamanho={15} peso="bold" /> Gravar contato
          </button>
        </div>
      </div>
      <span className="fraco" style={{ fontSize: 13 }}>
        Nenhum dos dois é exigido para faturar. O que a emissão exige é o CPF/CNPJ, na linha acima,
        e o endereço do pagador, que é da <strong>unidade consumidora</strong> e se preenche na aba
        Unidades.
      </span>
    </div>
  );
}
