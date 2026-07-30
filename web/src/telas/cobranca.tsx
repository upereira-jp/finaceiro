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
import { Pagina, Aviso, Campo, Marca, linha } from '../ui.tsx';
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
  sem_credencial_ref: 'A referência da credencial é obrigatória — é a coluna `credencial_ref`, que é NOT NULL.',
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
    <Pagina titulo="Cobrança"
            sub="Onde o conector da Sicoob é cadastrado — pela referência da credencial, nunca pelo segredo.">

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
      <div className="cartao" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Antes de preencher: onde mora o segredo</h2>
        <p className="sub" style={{ marginBottom: 8 }}>
          O campo abaixo guarda uma <strong>referência</strong> — um apelido que aponta para o
          cofre onde o certificado e o <code>client_secret</code> ficam cifrados. Ele{' '}
          <strong>não</strong> guarda o segredo: a regra 5 do <code>CLAUDE.md</code> proíbe segredo
          por tenant em coluna e em variável de ambiente, e o contraexemplo está no banco ao lado.
        </p>
        <p className="sub" style={{ marginBottom: 0 }}>
          <strong>E o cofre ainda não existe.</strong> O <code>ADR-0005</code> — onde mora o segredo
          do tenant — está em <em>proposta</em>, e é pré-requisito do adaptador real da Sicoob junto
          com o certificado A1 (<code>Q-SICOOB-01</code>). Até os dois existirem, cadastrar aqui
          registra <em>a intenção e os dados não-secretos</em>: agência, conta, convênio e validade.
          Nenhum boleto sai disto.
        </p>
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
            <strong>Isto parece ser o segredo, e não uma referência</strong> — foi reconhecido
            como <em>{sinal}</em>. Não cole aqui certificado, <code>client_secret</code> nem token:
            a coluna é <code>text</code> e o valor ficaria em claro no banco, o que é violação da
            regra 5 e se conserta com <strong>rotação de credencial</strong>, não com um
            {' '}<code>UPDATE</code>. Guarde o segredo no cofre e ponha aqui só o apelido dele.
          </Aviso>
        )}

        <div style={{ ...linha, gap: 12, marginTop: 12 }}>
          <Campo rotulo="Agência" valor={agencia} ao={setAgencia} dica="0000" />
          <Campo rotulo="Conta" valor={conta} ao={setConta} />
          <Campo rotulo="Número do contrato" valor={numeroContrato} ao={setNumeroContrato} />
          <Campo rotulo="Número do convênio" valor={numeroConvenio} ao={setNumeroConvenio} />
          <Campo rotulo="Certificado A1 vence em" valor={expiraEm} ao={setExpiraEm} tipo="date" />
        </div>

        <div style={{ ...linha, gap: 20, marginTop: 12 }}>
          <label style={{ ...linha, gap: 6, marginBottom: 0 }}>
            <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)}
                   style={{ width: 'auto' }} />
            Sandbox
          </label>
          <label style={{ ...linha, gap: 6, marginBottom: 0 }}>
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)}
                   style={{ width: 'auto' }} />
            Ativo
          </label>
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
      <h2>O que falta para um boleto ser pagável</h2>
      <p className="sub">
        Nada disto é código nosso faltando — está medido e tem dono nomeado no <code>QUESTOES.md</code>.
      </p>
      <div className="rolagem">
        <table>
          <thead><tr><th>Item</th><th>O que é</th><th style={{ width: 90 }}>Estado</th></tr></thead>
          <tbody>
            <tr>
              <td><code>Q-SICOOB-01</code></td>
              <td>Certificado A1 e credencial de sandbox. Sem eles o adaptador padrão recusa
                  com <strong>503 nomeado</strong> em vez de fingir que emitiu.</td>
              <td><Marca tom="pendente">falta</Marca></td>
            </tr>
            <tr>
              <td><code>ADR-0005</code></td>
              <td>Onde o segredo do tenant mora. A <code>credencial_ref</code> deste formulário
                  aponta para um cofre que ainda não existe.</td>
              <td><Marca tom="pendente">proposta</Marca></td>
            </tr>
            <tr>
              <td><code>Q-WEBHOOK-01</code></td>
              <td>Como a Sicoob se autentica para avisar que o cliente pagou — hoje toda rota
                  exige Bearer do Supabase, que um banco não emite.</td>
              <td><Marca tom="pendente">falta</Marca></td>
            </tr>
            <tr>
              <td><code>Q-AGENDA-01</code></td>
              <td>Não existe processo periódico: nem fila de emissão com retry, nem a consulta
                  ativa diária que captura o pagamento cujo webhook falhou.</td>
              <td><Marca tom="pendente">falta</Marca></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
