// «FALTAM N CONTAS DE <MÊS>» — o que o passo 1 conta, unidade por unidade.
//
// ============================================================================
// POR QUE ESTE BLOCO EXISTE (01/10/2026, etapa 7a do redesenho)
//
// O Mês dizia «15 contas a ler», e «Abrir Contas de luz» levava a uma tela que
// listava as 26 contas JÁ registradas. Quais eram as 15? A tela não dizia: era
// cruzar de cabeça a lista de unidades com a de contas lidas, procurando a
// ausência. É a lista do contrário do que o número dizia.
//
// O BLOCO MOSTRA AS QUE FALTAM, com unidade, cliente e usina — que é o que a
// pessoa procura no portal da distribuidora para baixar a conta. A lista sai de
// `contasQueFaltam` (`o-que-falta.ts`), com o predicado da camada
// `conta_lida_da_competencia`; o NÚMERO do título é o da própria prontidão,
// para o título daqui e o passo 1 do Mês nunca discordarem. Se a lista e o
// número divergirem (a lista de unidades cortada no teto, por exemplo), a frase
// diz as duas coisas, em vez de escolher uma em silêncio.
//
// RECOLHIDO, E ABERTO QUANDO SE VEM DO MÊS: quem abre Contas de luz para
// conferir uma conta não precisa de quinze linhas antes da fila; quem clicou
// «15 contas a ler» veio buscar justamente elas (`aberto`).

import { api, type Cliente, type Prontidao, type RegistroDeFatura, type UnidadeConsumidora, type Usina } from './api.ts';
import { useDados } from './dados.ts';
import { Aviso, Recolhido, Tabela } from './ui.tsx';
import { contasQueFaltam, mesDasContasQueFaltam } from './o-que-falta.ts';
import { LIMITE_DA_LISTA, listaParcial } from './registradas-regras.ts';
import { mesPorExtenso, mesDeHojeEmSP } from './formato.ts';
import { competenciaISO } from './dinheiro.ts';
import { lerMesLembrado } from './emissao-regras.ts';
import { armazemDoNavegador } from './leitura-do-mes.ts';

/** «15 contas», «1 conta». */
const contas = (n: number): string => `${n} ${n === 1 ? 'conta' : 'contas'}`;

export function ContasQueFaltam({ mesPedido, versao, aberto }: {
  /** `'AAAA-MM'` do endereço (`?mes=`, que é o que o Mês manda), ou `null`. */
  mesPedido: string | null;
  /** Sobe a cada conta registrada ou excluída: a lista relê e encolhe. */
  versao: number;
  /** Abre já aberto — a pessoa veio do Mês buscar estas contas. */
  aberto: boolean;
}) {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const clientes = useDados<Cliente[]>(() => api.get('/clientes?escopo=todos&limite=500'));
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  const registradas = useDados<RegistroDeFatura[]>(
    () => api.get(`/faturas/unificada/registros?limite=${LIMITE_DA_LISTA}`), [versao]);
  /* O MÊS: o do endereço, o lembrado, o mais recente com conta, o de hoje — a
     ordem e o porquê estão em `mesDasContasQueFaltam`. Sem o do endereço nem o
     lembrado, ele depende das registradas, e a prontidão espera por elas: pedir
     a de hoje e logo depois a do mês certo seria a consulta mais cara do
     sistema feita duas vezes. */
  const fixo = mesPedido ?? lerMesLembrado(armazemDoNavegador());
  const mes = mesDasContasQueFaltam({
    doEndereco: mesPedido, lembrado: fixo, registradas: registradas.dado, hoje: mesDeHojeEmSP(),
  });
  const pronto = Boolean(fixo) || registradas.dado !== null || registradas.erro !== null;
  const prontidao = useDados<Prontidao | null>(
    () => (pronto ? api.get(`/faturamento/${competenciaISO(mes)}/prontidao`) : Promise.resolve(null)),
    [mes, versao, pronto]);

  const clientePorId = new Map((clientes.dado ?? []).map((c) => [c.id, c.nome]));
  const usinaPorId = new Map((usinas.dado ?? []).map((u) => [u.id, u.apelido?.trim() || `Usina ${u.codigo_geradora}`]));
  const lista = contasQueFaltam(
    ucs.dado,
    registradas.dado ? { lista: registradas.dado, parcial: listaParcial(registradas.dado) } : null,
    mes,
    { cliente: (id) => clientePorId.get(id) ?? null, usina: (id) => (id ? usinaPorId.get(id) ?? null : null) },
  );
  const camada = prontidao.dado?.camadas.find((c) => c.camada === 'conta_lida_da_competencia') ?? null;
  /* O NÚMERO É O DA PRONTIDÃO quando ela mediu; senão, o da lista. Nenhum dos
     dois, e o bloco não fala: um título «Faltam — contas» é pior que nenhum. */
  const n = camada && camada.situacao !== 'nao_medido' ? camada.faltam : lista?.length ?? null;
  if (n === null) return null;
  const doMes = mesPorExtenso(`${mes}-01`) || mes;

  if (n === 0) {
    /* NADA FALTA: só diz isso a quem veio buscar o que falta. Para quem abriu a
       tela por outro motivo, um bloco «faltam 0» é ruído. */
    return aberto
      ? <Aviso tipo="ok">Todas as contas de {doMes} foram lidas — nenhuma unidade que fatura está sem a conta do mês.</Aviso>
      : null;
  }

  const diverge = lista !== null && lista.length !== n;
  return (
    <Recolhido icone="a_fazer" aberto={aberto}
               titulo={<>{n === 1 ? 'Falta' : 'Faltam'} {contas(n)} de {doMes}</>}
               resumo={lista === null
                 ? 'a lista das unidades não pôde ser montada agora'
                 : 'a unidade e o cliente de cada uma — envie as contas delas logo acima'}>
      {lista === null ? (
        <p className="sub">
          A conferência do mês conta {contas(n)} sem leitura, mas as contas registradas passam do teto
          da lista ({LIMITE_DA_LISTA}) e este mês pode estar pela metade nela — dizer quais faltam
          seria arriscar mandar ler de novo uma conta já registrada. A tela Mês continua com o número
          certo.
        </p>
      ) : (
        <>
          {diverge && (
            <p className="sub">
              A lista abaixo tem {contas(lista.length)}; a conferência do mês conta {contas(n)}. A
              diferença costuma ser uma unidade fora da lista desta tela — o número do Mês é o que vale.
            </p>
          )}
          <Tabela cabecalho={<><th>Unidade</th><th>Cliente</th><th>Usina</th></>}>
            {lista.map((c) => (
              <tr key={c.uc_id}>
                <td><strong>{c.numero_uc}</strong></td>
                <td>{c.cliente ?? <span className="fraco">—</span>}</td>
                <td>{c.usina ?? <span className="fraco">—</span>}</td>
              </tr>
            ))}
          </Tabela>
        </>
      )}
    </Recolhido>
  );
}
