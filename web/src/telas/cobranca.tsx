// COBRANCA: o conector da Sicoob, e o estado do certificado A1.
//
// ESTA TELA E O LUGAR ONDE A REGRA 5 CAI, se cair. Ela pede a credencial de um
// banco, e o caminho natural de quem opera e colar aqui o `client_secret` ou o
// conteudo do `.pfx`. A coluna e `text` e o banco aceitaria em silencio - foi
// exatamente assim que a tabela `tenants` do CRM ficou com cinco tokens em claro
// (`P8` §4), num repositorio que foi publico ate 25/07.
//
// Por isso o campo pede uma REFERENCIA e a trava esta em `cobranca-regras.ts`,
// pura e com 19 verificacoes: qualquer coisa com cara de segredo trava o botao e
// a tela explica o que reconheceu. E deteccao, nao prevencao - do mesmo tipo que
// o `CAT-8` faz para o `rls_auto_enable`.
//
// O QUE ESTA TELA NAO FAZ, E E DELIBERADO: ela nao guarda o segredo em lugar
// nenhum, porque o cofre nao existe ainda. O `ADR-0005` esta em PROPOSTA, e ate
// ele ser aceito a `credencial_ref` aponta para um armazenamento inexistente.
// Cadastrar o conector aqui NAO faz boleto sair - o que sai e um 412 nomeado.
// Dizer isso na tela e a diferenca entre um sistema que parece pronto e um que
// diz onde esta.

import { useEffect, useState } from 'react';
import { api, ErroDaApi, type ConectorCobranca } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { Pagina, Aviso, Campo, Marca, linha, Interruptor, Icone, DetalheTecnico } from '../ui.tsx';
import { dataOuNull } from '../dinheiro.ts';
import {
  motivoDaTravaDoConector, podeSalvarConector, sinalDeSegredo,
  estadoDoCertificado, DIAS_DE_AVISO_DO_CERTIFICADO,
  type MotivoDeTravaDoConector,
} from '../cobranca-regras.ts';

type Certificado = { dias: number | null; expira_em: string | null };

/** O 412 do servidor significa "nao ha conector", e e RESPOSTA - nao falha de
 *  leitura. Confundir os dois e o defeito que a tela de Contratos tinha em
 *  28/07: `catch` que transforma erro em ausencia. Aqui a distincao e explicita e
 *  vale nos dois sentidos: 412 vira `null`, qualquer outro erro SOBE. */
const semConectorEhResposta = async (): Promise<Certificado | null> => {
  try {
    return await api.get<Certificado>('/conector-cobranca/certificado');
  } catch (e) {
    if (e instanceof ErroDaApi && e.status === 412) return null;
    throw e;
  }
};

const EXPLICACAO: Record<MotivoDeTravaDoConector, string> = {
  ocupado: 'Salvando…',
  sem_provedor: 'Escolha o provedor.',
  // Sem backtick: este texto NAO passa por JSX, entao a crase saía literal na
  // tela — apareceu na conferência visual de 30/07.
  sem_credencial_ref: 'A referência da credencial é obrigatória — é a coluna credencial_ref, que é NOT NULL.',
  credencial_ref_parece_segredo: '',   // a tela monta a frase com o sinal reconhecido
};

export function TelaCobranca() {
  const cert = useDados<Certificado | null>(semConectorEhResposta);
  const acao = useAcao();

  const [credencialRef, setCredencialRef] = useState('');
  const [numeroContrato, setNumeroContrato] = useState('');
  const [numeroConvenio, setNumeroConvenio] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [numeroCliente, setNumeroCliente] = useState('');
  const [codigoModalidade, setCodigoModalidade] = useState('');
  const [numeroContratoCobranca, setNumeroContratoCobranca] = useState('');
  const [numeroContaCorrente, setNumeroContaCorrente] = useState('');
  const [expiraEm, setExpiraEm] = useState('');
  const [sandbox, setSandbox] = useState(true);
  const [ativo, setAtivo] = useState(false);

  /*
   * ==========================================================================
   * O FORMULARIO NASCE COM O QUE ESTA GRAVADO, e ate 08/09/2026 nascia VAZIO.
   *
   * `POST /conector-cobranca` e um upsert que preenche campo a campo com
   * `?? null`, e `ativo` volta a `false` por omissao. Com o formulario vazio e
   * sem nenhum `GET` que mostrasse o gravado, abrir esta tela para corrigir UM
   * campo e clicar em «Salvar» **apagava todo o resto e DESLIGAVA o conector** —
   * com a tela dizendo "salvo".
   *
   * Em producao ele esta LIGADO desde 01/09, com numero do cliente, modalidade,
   * conta corrente, agencia e a validade do certificado. Um clique zerava tudo.
   *
   * `?? ''` e nao `?? valor-padrao`: o que nao esta gravado aparece em branco, e
   * em branco continua significando "nao gravado". Inventar default aqui faria a
   * tela gravar dado que ninguem digitou.
   */
  const [prefilled, setPrefilled] = useState(false);
  const atual = useDados<ConectorCobranca | null>(() => api.get('/conector-cobranca'));
  useEffect(() => {
    if (prefilled || !atual.dado) return;
    const c = atual.dado;
    setPrefilled(true);
    setCredencialRef(c.credencial_ref ?? '');
    setNumeroContrato(c.numero_contrato ?? '');
    setNumeroConvenio(c.numero_convenio ?? '');
    setAgencia(c.agencia ?? '');
    setConta(c.conta ?? '');
    setNumeroCliente(c.numero_cliente == null ? '' : String(c.numero_cliente));
    setCodigoModalidade(c.codigo_modalidade == null ? '' : String(c.codigo_modalidade));
    setNumeroContratoCobranca(c.numero_contrato_cobranca == null ? '' : String(c.numero_contrato_cobranca));
    setNumeroContaCorrente(c.numero_conta_corrente == null ? '' : String(c.numero_conta_corrente));
    setExpiraEm(c.certificado_expira_em ? String(c.certificado_expira_em).slice(0, 10) : '');
    setSandbox(c.sandbox);
    setAtivo(c.ativo);
  }, [atual.dado, prefilled]);

  // O provedor NAO e escolha: `boleto.cadastrarConector` grava 'sicoob' fixo no
  // create. O campo existe na coluna porque um segundo banco nao mudaria o resto
  // do desenho — e enquanto for um, a tela nao finge que ha opcao.
  const estado = { credencialRef, provedor: 'sicoob', ocupado: acao.ocupado };
  const motivo = motivoDaTravaDoConector(estado);
  const sinal = sinalDeSegredo(credencialRef);

  // `cert.dado === null` com `erro === null` e a resposta "nao ha conector".
  // Enquanto carrega, nao afirmamos nem uma coisa nem outra.
  const temConector = cert.dado != null;
  const situacao = cert.carregando || cert.erro
    ? null
    : estadoDoCertificado({ temConector, dias: cert.dado?.dias ?? null });

  const salvar = async () => {
    const ok = await acao.executar(() => api.post('/conector-cobranca', {
      credencial_ref: credencialRef.trim(),
      numero_contrato: numeroContrato.trim() || null,
      numero_convenio: numeroConvenio.trim() || null,
      agencia: agencia.trim() || null,
      conta: conta.trim() || null,
      numero_cliente: numeroCliente.trim() || null,
      codigo_modalidade: codigoModalidade.trim() || null,
      numero_contrato_cobranca: numeroContratoCobranca.trim() || null,
      numero_conta_corrente: numeroContaCorrente.trim() || null,
      certificado_expira_em: dataOuNull(expiraEm),
      sandbox,
      ativo,
    }));
    if (ok) { acao.anunciar('Conector salvo.'); cert.recarregar(); }
  };

  return (
    <Pagina titulo="Conector Sicoob"
            sub="A credencial do banco — pela referência, nunca pelo segredo. Cobrar um cliente é na aba Emissão e cobrança; aqui só se cadastra por onde o boleto sairia.">

      {/* ------------------------------------------------ o estado de hoje */}
      {cert.erro && (
        <Aviso tipo="erro">
          Não foi possível ler o estado do conector: {cert.erro} — o que aparece abaixo
          é <strong>desconhecido</strong>, não "não configurado".
        </Aviso>
      )}

      {situacao === 'sem_conector' && (
        <Aviso tipo="alerta">
          <strong>Nenhum conector de cobrança cadastrado.</strong> Enquanto for assim, pedir boleto
          para uma fatura devolve <code>412 CobrancaNaoHabilitada</code> — a fatura continua válida
          e cobrável por outro meio; o que não existe é o boleto.
        </Aviso>
      )}
      {situacao === 'nao_medido' && (
        <Aviso tipo="alerta">
          Conector cadastrado, <strong>sem data de validade do certificado</strong>. Isso não é "está
          tudo bem": o <code>PRD</code> §6 registra que A1 vencido derruba a emissão <em>sem erro
          óbvio</em>, e sem a data não há como avisar antes.
        </Aviso>
      )}
      {situacao === 'vencido' && (
        <Aviso tipo="erro">
          <strong>Certificado A1 vencido</strong>{cert.dado?.expira_em && ` em ${cert.dado.expira_em.slice(0, 10)}`}.
          A emissão vai falhar, e o modo de falha é silencioso.
        </Aviso>
      )}
      {situacao === 'vence_em_breve' && (
        <Aviso tipo="alerta">
          Certificado A1 vence em <strong>{cert.dado?.dias} dia(s)</strong>. O aviso começa a
          {' '}{DIAS_DE_AVISO_DO_CERTIFICADO} dias porque é o prazo típico de emissão de um A1 novo.
        </Aviso>
      )}
      {situacao === 'ok' && (
        <Aviso tipo="ok">
          Conector ativo, certificado com <strong>{cert.dado?.dias} dia(s)</strong> de validade.
        </Aviso>
      )}

      {/* ---------------------------------------- o que esta tela nao resolve */}
      <div className="cartao secao">
        <h2 style={{ marginTop: 0 }}>Antes de preencher: onde mora o segredo</h2>
        <p className="sub" style={{ marginBottom: 8 }}>
          O campo abaixo guarda um <strong>apelido</strong> que aponta para o cofre onde a senha e o
          certificado do banco ficam guardados. Ele <strong>não</strong> guarda a senha em si —
          nunca cole aqui certificado, senha ou token.
        </p>
        <p className="sub" style={{ marginBottom: 0 }}>
          <strong>O cofre já existe</strong>, desde 27/08/2026, e o sistema já sabe conversar com o
          Sicoob. O que ainda falta para sair boleto por aqui está <strong>fora do sistema</strong>:
          o cadastro do aplicativo no portal do banco, a autorização dele no aplicativo do celular,
          e os três números de identidade abaixo, que vêm da cooperativa. Enquanto isso, dá para
          cobrar por Pix e importar na aba Emissão e cobrança um boleto emitido no site do banco.
        </p>
        <DetalheTecnico>
          <p style={{ margin: '0 0 6px' }}>
            A regra 5 do <code>CLAUDE.md</code> proíbe segredo por tenant em coluna e em variável de
            ambiente — o contraexemplo está no banco ao lado.
          </p>
          <p style={{ margin: 0 }}>
            O <code>ADR-0005</code> (onde mora o segredo do tenant) foi implementado na{' '}
            <strong>migration 35</strong>: o segredo vive em <code>vault.secrets</code>, a role de
            runtime <em>não</em> alcança o schema <code>vault</code>, e quem atravessa é a função{' '}
            <code>app.resolver_credencial_cobranca</code> — que confere o tenant e grava trilha na
            mesma transação da leitura (regra 9).
          </p>
        </DetalheTecnico>
      </div>

      {/* -------------------------------------------------------- o formulario */}
      <div className="cartao">
        <div style={{ ...linha, gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px' }}>
            <Campo rotulo="Referência da credencial (não o segredo)" porqueDe="banco" valor={credencialRef}
                   ao={setCredencialRef} dica="ex.: sicoob/g3-solar/prod" />
          </div>
          <Campo rotulo="Provedor" valor="Sicoob" ao={() => {}} />
        </div>

        {sinal && (
          <Aviso tipo="erro">
            <strong>Isto parece ser o segredo, e não o apelido dele</strong> — foi reconhecido
            como <em>{sinal}</em>. Não cole aqui certificado, senha nem token: o valor ficaria
            legível no banco de dados. <strong>Guarde o segredo no cofre e ponha aqui só o apelido
            dele.</strong>
            <DetalheTecnico>
              <p style={{ margin: 0 }}>
                A coluna é <code>text</code> e o valor ficaria em claro — violação da regra 5, que
                se conserta com <strong>rotação de credencial</strong> e não com um{' '}
                <code>UPDATE</code>.
              </p>
            </DetalheTecnico>
          </Aviso>
        )}

        <div style={{ ...linha, gap: 12, marginTop: 12 }}>
          <Campo rotulo="Agência" porqueDe="banco" valor={agencia} ao={setAgencia} dica="0000" />
          <Campo rotulo="Conta" porqueDe="banco" valor={conta} ao={setConta} />
          <Campo rotulo="Número do contrato" porqueDe="banco" valor={numeroContrato} ao={setNumeroContrato} />
          <Campo rotulo="Número do convênio" porqueDe="banco" valor={numeroConvenio} ao={setNumeroConvenio} />
          <Campo rotulo="Certificado A1 vence em" porqueDe="banco" valor={expiraEm} ao={setExpiraEm} tipo="date" />
        </div>

        {/*
          A IDENTIDADE DO COOPERADO, e ela e uma SECAO PROPRIA de proposito.
          Posta na mesma linha de "agencia" e "conta", qualquer pessoa
          preencheria por semelhanca de nome - e "numero do contrato" (nosso
          apontamento) NAO e "numeroContratoCobranca" (o do banco). O
          `SICOOB-contrato-medido` §4 registra que os tres nao se derivam de
          nada que ja esta nesta tela, e a separacao visual e o que impede a
          deducao errada de parecer razoavel.
        */}
        <div className="secao" style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Identidade do cooperado na API</h3>
          <p className="sub" style={{ marginTop: 0, marginBottom: 10 }}>
            Estes três vêm da <strong>cooperativa</strong>, com o contrato de cobrança — não são a
            agência, a conta nem o número do contrato acima, e <strong>não se derivam</strong>{' '}
            deles. Sem os três, o conector não liga: o banco recusa pela constraint e a emissão
            recusa nomeando qual falta.
          </p>
          <div style={{ ...linha, gap: 12 }}>
            <Campo rotulo="numeroCliente" porqueDe="banco" valor={numeroCliente}
                   ao={setNumeroCliente} dica="só dígitos" />
            <Campo rotulo="codigoModalidade" porqueDe="banco" valor={codigoModalidade}
                   ao={setCodigoModalidade} dica="1 = simples com registro" />
            <Campo rotulo="numeroContratoCobranca" porqueDe="banco" valor={numeroContratoCobranca}
                   ao={setNumeroContratoCobranca} />
            <Campo rotulo="numeroContaCorrente (opcional)" porqueDe="banco" valor={numeroContaCorrente}
                   ao={setNumeroContaCorrente} />
          </div>
          <DetalheTecnico>
            <p style={{ margin: 0 }}>
              Vão para a API como <strong>número</strong>, não texto — por isso só dígitos, e por
              isso zero à esquerda não é guardado: <code>0025</code> e <code>25</code> são o mesmo
              número JSON. O que não for inteiro positivo é recusado com <code>422</code> em vez de
              virar <code>null</code> em silêncio.
            </p>
          </DetalheTecnico>
        </div>

        <div style={{ ...linha, gap: 20, marginTop: 12 }}>
          {/*
            OS DOIS INTERRUPTORES SUBSTITUIRAM CHECKBOX NATIVO em 30/07, e aqui
            isso nao e so acabamento: sao os dois campos que decidem se a emissao
            aponta para o sandbox ou para a producao, e se o conector e usado. Um
            checkbox nativo de 13px, do tamanho de um caractere, e um alvo pequeno
            para uma consequencia grande. O `role="switch"` e o `aria-checked`
            continuam sendo os de verdade — ver `Interruptor` no ui.tsx.
          */}
          <Interruptor ligado={sandbox} ao={setSandbox} rotulo="Sandbox" />
          <Interruptor ligado={ativo} ao={setAtivo} rotulo="Ativo" />
          <span className="fraco" style={{ fontSize: 13 }}>
            {/*
              O default do servidor e `sandbox: true, ativo: false`, e a tela
              repete o default em vez de escolher outro: um conector que nasce
              ativo e apontando para producao e o tipo de default que emite
              cobranca de verdade por engano.
            */}
            O servidor nasce em <code>sandbox</code> e <strong>inativo</strong> de propósito —
            só o conector ativo é usado pela emissão.
          </span>
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="primario" onClick={() => void salvar()} disabled={!podeSalvarConector(estado)}>
            <Icone nome={acao.ocupado ? 'carregando' : 'cobranca'} tamanho={15} peso="bold" />
            Salvar conector
          </button>
          {motivo && motivo !== 'credencial_ref_parece_segredo' && (
            <span className="fraco" style={{ marginLeft: 10, fontSize: 13 }}>{EXPLICACAO[motivo]}</span>
          )}
        </div>

        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {/* --------------------------------- o que falta para o boleto sair mesmo */}
      {/*
        ⚠️ ESTA TABELA DIZIA QUATRO COISAS FALSAS ate 08/09/2026, e ela e a tela
        que responde «posso emitir boleto?».

        As quatro linhas marcavam «falta» ou «proposta» para: o certificado do
        banco, o cofre da senha, o aviso de pagamento e a rotina diaria. Medido
        no dia:

          certificado    A1 no cofre desde 01/09, valido ate 17/08/2027 — o
                         proprio timer diario mede e registrou «342 dias, ok»;
          cofre          migration 35, aplicada em 27/08 — e ESTA MESMA TELA ja
                         dizia isso quinze linhas acima, na faixa verde;
          aviso          `POST /liquidacoes/webhook-sicoob/:tenant` existe desde
                         28/08, com `auth: 'webhook'` e verificacao de origem;
          rotina         quatro timers ativos (`ciclo`, `fila`, `consulta`,
                         `certificado`), rodando desde 28/08.

        O CUSTO NAO E DE LEITURA: quem for decidir se pode liberar as primeiras
        faturas lia que faltavam quatro coisas que nao faltam — e procurava no
        lugar errado o que realmente falta.
      */}
      <h2><Icone nome="certificado" tamanho={17} /> O que o boleto precisa, e o que já está pronto</h2>
      <p className="sub">
        Os quatro degraus entre «a fatura existe» e «o cliente paga um boleto nosso». Nenhum é
        código faltando — e desde 01/09 nenhum deles está pendente.
      </p>
      <div className="rolagem">
        <table>
          <thead><tr><th>Item</th><th>O que é</th><th style={{ width: 90 }}>Estado</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Certificado do banco</strong></td>
              <td>O certificado que identifica a empresa na Sicoob. Sem ele o sistema recusa
                  emitir, com o motivo escrito, em vez de fingir que emitiu.</td>
              <td><Marca tom="ok">no cofre</Marca></td>
            </tr>
            <tr>
              <td><strong>Cofre da senha</strong></td>
              <td>Onde a senha do certificado fica guardada, cifrada. Nem esta tela nem o banco de
                  dados da aplicação enxergam o conteúdo.</td>
              <td><Marca tom="ok">pronto</Marca></td>
            </tr>
            <tr>
              <td><strong>Aviso de pagamento</strong></td>
              <td>Como o banco avisa o sistema de que o cliente pagou. O endereço existe e é
                  autenticado pela origem, não por senha.</td>
              <td><Marca tom="ok">pronto</Marca></td>
            </tr>
            <tr>
              <td><strong>Rotina diária</strong></td>
              <td>A fila que tenta emitir de novo, a conferência diária que pega o pagamento cujo
                  aviso falhou, e o alerta de vencimento do certificado.</td>
              <td><Marca tom="ok">rodando</Marca></td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* OS CODIGOS DESCERAM PARA CA em 21/08/2026. A primeira coluna era
          `Q-SICOOB-01`, `ADR-0005`, `Q-WEBHOOK-01`, `Q-AGENDA-01` — rastreio
          interno ocupando a coluna que deveria dizer O QUE falta. Quem acompanha
          o projeto continua com os ponteiros, a um clique. */}
      <DetalheTecnico>
        <p style={{ margin: 0 }}>
          Os quatro fecharam entre 27/08 e 01/09/2026, e esta tabela só foi corrigida em 08/09 —
          ela ficou dizendo «falta» sobre coisas prontas. Na ordem: <code>Q-SICOOB-01</code> (A1
          ICP-Brasil no cofre, aplicativo ATIVO no Portal Developers, mTLS <code>200</code>) ·{' '}
          <code>ADR-0005</code> (migration 35, com a resolvedora provada de ponta a ponta:
          a role de runtime não enxerga o <code>vault</code> e ainda assim recebe o certificado) ·{' '}
          <code>Q-WEBHOOK-01</code> (<code>auth: &apos;webhook&apos;</code> com verificação de
          origem, <code>ADR-0006</code>) · <code>Q-AGENDA-01</code> (quatro timers do systemd).
          <br />O que <strong>continua</strong> aberto e não aparece nesta tabela porque não é
          degrau daqui: o dígito da conta corrente não está medido (entrou com DV), e a primeira
          emissão é que vai dizer.
        </p>
      </DetalheTecnico>
    </Pagina>
  );
}
