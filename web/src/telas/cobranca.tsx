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

import { useState } from 'react';
import { api, ErroDaApi } from '../api.ts';
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
  const [expiraEm, setExpiraEm] = useState('');
  const [sandbox, setSandbox] = useState(true);
  const [ativo, setAtivo] = useState(false);

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
          <strong>E o cofre ainda não existe.</strong> Até ele e o certificado do banco existirem,
          cadastrar aqui registra <em>a intenção e os dados que não são secretos</em>: agência,
          conta, convênio e validade. <strong>Nenhum boleto sai disto ainda</strong> — enquanto
          isso, dá para cobrar por Pix e importar na aba Emissão e cobrança um boleto emitido no
          site do banco.
        </p>
        <DetalheTecnico>
          <p style={{ margin: '0 0 6px' }}>
            A regra 5 do <code>CLAUDE.md</code> proíbe segredo por tenant em coluna e em variável de
            ambiente — o contraexemplo está no banco ao lado.
          </p>
          <p style={{ margin: 0 }}>
            O <code>ADR-0005</code> (onde mora o segredo do tenant) está em <em>proposta</em>, e é
            pré-requisito do adaptador real da Sicoob junto com o certificado A1
            (<code>Q-SICOOB-01</code>).
          </p>
        </DetalheTecnico>
      </div>

      {/* -------------------------------------------------------- o formulario */}
      <div className="cartao">
        <div style={{ ...linha, gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px' }}>
            <Campo rotulo="Referência da credencial (não o segredo)" valor={credencialRef}
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
          <Campo rotulo="Agência" valor={agencia} ao={setAgencia} dica="0000" />
          <Campo rotulo="Conta" porqueDe="banco" valor={conta} ao={setConta} />
          <Campo rotulo="Número do contrato" porqueDe="banco" valor={numeroContrato} ao={setNumeroContrato} />
          <Campo rotulo="Número do convênio" porqueDe="banco" valor={numeroConvenio} ao={setNumeroConvenio} />
          <Campo rotulo="Certificado A1 vence em" porqueDe="banco" valor={expiraEm} ao={setExpiraEm} tipo="date" />
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
      <h2><Icone nome="certificado" tamanho={17} /> O que falta para um boleto ser pagável</h2>
      <p className="sub">
        Nada disto é código nosso faltando: os quatro estão medidos e cada um tem responsável.
      </p>
      <div className="rolagem">
        <table>
          <thead><tr><th>Item</th><th>O que é</th><th style={{ width: 90 }}>Estado</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Certificado do banco</strong></td>
              <td>O certificado e a credencial de teste da Sicoob. Sem eles o sistema recusa
                  emitir, com o motivo escrito, em vez de fingir que emitiu.</td>
              <td><Marca tom="pendente">falta</Marca></td>
            </tr>
            <tr>
              <td><strong>Cofre da senha</strong></td>
              <td>Onde a senha do banco fica guardada. O apelido deste formulário aponta para um
                  cofre que ainda não existe.</td>
              <td><Marca tom="pendente">proposta</Marca></td>
            </tr>
            <tr>
              <td><strong>Aviso de pagamento</strong></td>
              <td>Como o banco avisa o sistema de que o cliente pagou. Hoje toda entrada exige um
                  crachá que um banco não emite.</td>
              <td><Marca tom="pendente">falta</Marca></td>
            </tr>
            <tr>
              <td><strong>Rotina diária</strong></td>
              <td>Nada roda sozinho ainda: nem a fila que tenta emitir de novo, nem a conferência
                  diária que pega o pagamento cujo aviso do banco falhou.</td>
              <td><Marca tom="pendente">falta</Marca></td>
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
          Na ordem da tabela: <code>Q-SICOOB-01</code> (certificado A1 e credencial de sandbox;
          sem eles o adaptador padrão recusa com <strong>503 nomeado</strong>) ·{' '}
          <code>ADR-0005</code> (onde mora o segredo do tenant, em proposta) ·{' '}
          <code>Q-WEBHOOK-01</code> (como a Sicoob se autentica no retorno; hoje toda rota exige
          Bearer do Supabase) · <code>Q-AGENDA-01</code> (sem fila de emissão com retry e sem
          consulta ativa diária). Todos com dono no <code>QUESTOES.md</code>.
        </p>
      </DetalheTecnico>
    </Pagina>
  );
}
