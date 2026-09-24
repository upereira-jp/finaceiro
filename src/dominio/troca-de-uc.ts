// O CONTRATO DE RATEIO QUE MUDOU DE UC NO CRM - SPEC-002 R28, decisao do dono
// em 24/09/2026.
//
// ============================================================================
// O DEFEITO QUE ISTO FECHA, medido
//
// A R23 recusa mover vinculo de contrato entre UCs, e a recusa deixava a UC
// ANTIGA onde estava: com usina e percentual. Em 24/09/2026 o contrato da Carla
// Gonzaga (G3-0229) apontava no CRM para `000091762801211`, na usina 0002, e o
// espelho ainda o tinha em `000000100076075`, na usina 04, com 9%. A usina 04
// somava 92,56% no CRM e 96,56% aqui; as 15:57 entrou um rateio de 5% la, o
// espelho passou a 101,56%, a trava R11 (DEFERIDA) derrubou o COMMIT, e o ciclo
// voltou a morrer em toda rodada - dois dias depois de a R27 ter consertado a
// mesma classe de defeito pelo outro lado.
//
// E nao era caso unico: as duas UCs do Carlos Gabriel (G3-0401 e G3-0403)
// trocaram de contrato entre si e caiam na mesma recusa desde 21/09.
//
// ============================================================================
// A DECISAO: SEGUIR O CRM QUANDO NAO HA DINHEIRO NA UC ANTIGA
//
// A R23 existia porque "uma das duas leituras esta errada, e escolher seria
// palpite" - e o palpite custava caro quando a UC ja tinha contrato: a comissao
// sairia para a pessoa errada, e a R20-b congela o tier sem caminho de edicao
// (Q-UCMUDOU-01, 03/08). Esse custo so existe se a UC antiga carrega historia.
// Sem contrato, sem fatura e sem conta lida, o ponteiro velho nao sustenta nada:
// solta-lo e o mesmo gesto da R27, e o CRM - que e quem valida o rateio (R11 da
// SPEC-002) - passa a valer.
//
// Com historia, a R23 continua como era: recusa nomeada, e a adjudicacao e do
// `npm run destravar-uc`, com as quatro guardas dele.
//
// ============================================================================
// AS GUARDAS, e cada uma herda uma do destrave
//
//   1. SEM HISTORIA. Contrato (qualquer status), fatura ou conta lida na UC
//      antiga retem a troca - e o sinal diz qual das tres.
//   2. LEITURA SEM AMBIGUIDADE. O contrato aparece em UMA linha da leitura, e a
//      UC nova em UMA so. Duas UCs para um contrato, ou dois contratos para uma
//      UC (UC-DUP-01), e a leitura se contradizendo - soltar seria escolher.
//   3. SEM SEGUNDO CONFLITO. Se a UC nova ja existe aqui presa a OUTRO contrato,
//      a troca so anda se esse outro contrato tambem estiver sendo solto nesta
//      mesma decisao - e o caso da permuta do Carlos Gabriel. Senao, soltar um
//      ponteiro so trocaria uma recusa por outra, com uma escrita no meio (e a
//      guarda 4 do destrave).
//   4. SAIDA EM MASSA NAO SOLTA NADA. O mesmo freio da R27: acima de
//      max(3, 25% das UCs com contrato), e renumeracao em lote da distribuidora
//      ou view quebrada - e as duas pedem gente olhando, nao conector.
//
// O que difere do destrave, de proposito: a UC antiga NAO precisa de substituto
// (a guarda 3 dele). No caso da Carla o numero antigo sumiu do CRM, e a UC solta
// fica como a R27 a deixa - com cliente, sem usina. A R27 ja estabeleceu que
// isso e o correto quando o CRM tira a UC do rateio.

import { tetoDeSaidas } from './saida-do-rateio.ts';

/** O que a UC antiga carrega e que torna a troca uma decisao de gente. */
export type HistoriaDaUc = { contratos: number; faturas: number; contas_lidas: number };

/** Uma UC do espelho que ainda guarda o ponteiro de um contrato de rateio. */
export type UcComContrato = {
  id: string;
  numero_uc: string;
  crm_usina_cliente_id: string;
  codigo_geradora: string | null;
  percentual_rateio: string | null;
  historia: HistoriaDaUc;
};

/** Uma linha de `financeiro.rateio_clientes`, so o que a decisao usa. */
export type LinhaLida = { contrato_id: string; uc: string | null };

export type Troca = { uc: UcComContrato; para: string };
export type TrocaRetida = Troca & { motivo: string };
export type DecisaoDeTroca = { soltar: Troca[]; retidas: TrocaRetida[] };

const limpo = (s: string | null | undefined): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

/** O que da historia impede a troca, em palavras. Vazio = nada impede. */
export function historiaQueRetem(h: HistoriaDaUc): string[] {
  const o: string[] = [];
  if (h.contratos > 0) o.push(`${h.contratos} contrato(s)`);
  if (h.faturas > 0) o.push(`${h.faturas} fatura(s)`);
  if (h.contas_lidas > 0) o.push(`${h.contas_lidas} conta(s) lida(s)`);
  return o;
}

/**
 * Decide, sem banco, quais contratos que mudaram de UC no CRM podem ter o
 * ponteiro velho solto nesta rodada. Quem e solto deixa o caminho livre para a
 * entrada normal ligar o contrato a UC nova no mesmo ciclo.
 *
 * `vinculadas` sao TODAS as UCs do espelho com `crm_usina_cliente_id`, com ou sem
 * usina - a UC que a R27 soltou guarda o contrato como rastro e tambem prende.
 *
 * `linhas` e a leitura INTEIRA, porque as guardas de ambiguidade precisam ver as
 * duplicatas. `entram` sao os contratos que a entrada vai de fato gravar - com
 * lead, com numero e com usina espelhada aqui. Contrato fora dele NAO e troca:
 * a entrada o recusa por outro motivo, e soltar o ponteiro velho deixaria o
 * contrato sem UC nenhuma enquanto o sinal diria que ele "segue para a nova".
 */
export function decidirTrocas(
  vinculadas: readonly UcComContrato[], linhas: readonly LinhaLida[], entram: ReadonlySet<string>,
): DecisaoDeTroca {
  const ucsDoContrato = new Map<string, Set<string>>();
  const contratosDaUc = new Map<string, Set<string>>();
  for (const l of linhas) {
    const uc = limpo(l.uc);
    if (!uc) continue;
    if (!ucsDoContrato.has(l.contrato_id)) ucsDoContrato.set(l.contrato_id, new Set());
    ucsDoContrato.get(l.contrato_id)!.add(uc);
    if (!contratosDaUc.has(uc)) contratosDaUc.set(uc, new Set());
    contratosDaUc.get(uc)!.add(l.contrato_id);
  }
  const contratoPreso = new Map(vinculadas.map((u) => [u.numero_uc, u.crm_usina_cliente_id]));

  const retidas: TrocaRetida[] = [];
  let candidatas: Troca[] = [];
  for (const uc of vinculadas) {
    const lidas = ucsDoContrato.get(uc.crm_usina_cliente_id);
    // Contrato fora da leitura e a R27; contrato na mesma UC e o caminho normal.
    if (!lidas || (lidas.has(uc.numero_uc) && lidas.size === 1)) continue;
    // Contrato que a entrada recusa por outro motivo: a recusa dela ja fala.
    if (!entram.has(uc.crm_usina_cliente_id)) continue;

    const para = [...lidas].join(' e ');
    if (lidas.size > 1) {
      retidas.push({ uc, para, motivo:
        `o contrato ${uc.crm_usina_cliente_id} aparece em ${lidas.size} UCs na mesma leitura do CRM `
        + `(${para}). A leitura se contradiz, e soltar o ponteiro seria escolher uma delas.` });
      continue;
    }
    if ((contratosDaUc.get(para)?.size ?? 0) > 1) {
      retidas.push({ uc, para, motivo:
        `a UC nova ${para} aparece em mais de um contrato na mesma leitura do CRM (UC-DUP-01). `
        + 'Soltar o ponteiro deixaria o contrato sem UC nenhuma, porque a entrada tambem recusa a duplicata.' });
      continue;
    }
    const impede = historiaQueRetem(uc.historia);
    if (impede.length) {
      retidas.push({ uc, para, motivo:
        `a UC antiga ${uc.numero_uc} ja tem ${impede.join(', ')} neste sistema. Mover o vinculo mudaria `
        + 'de quem e a historia dela, e isso e decisao de gente: confira no CRM qual leitura vale e use '
        + '`npm run destravar-uc` (Q-UCMUDOU-01).' });
      continue;
    }
    candidatas.push({ uc, para });
  }

  // Guarda 3, ate estabilizar: tirar uma troca pode desfazer a permuta de outra.
  for (;;) {
    const soltos = new Set(candidatas.map((t) => t.uc.crm_usina_cliente_id));
    const presas = candidatas.filter((t) => {
      const outro = contratoPreso.get(t.para);
      return outro !== undefined && outro !== t.uc.crm_usina_cliente_id && !soltos.has(outro);
    });
    if (presas.length === 0) break;
    for (const t of presas) {
      retidas.push({ ...t, motivo:
        `a UC nova ${t.para} ja esta presa ao contrato ${contratoPreso.get(t.para)} no espelho, e esse `
        + 'contrato nao esta sendo solto nesta rodada. Ha um segundo conflito atras deste, e soltar um '
        + 'ponteiro so trocaria uma recusa por outra.' });
    }
    candidatas = candidatas.filter((t) => !presas.includes(t));
  }

  const teto = tetoDeSaidas(vinculadas.length);
  if (candidatas.length > teto) {
    return {
      soltar: [],
      retidas: [...retidas, ...candidatas.map((t) => ({ ...t, motivo:
        `${candidatas.length} contratos mudaram de UC na mesma leitura, acima do freio de ${teto} `
        + `(max(3, 25% de ${vinculadas.length} UCs com contrato)). Parece renumeracao em lote ou view `
        + 'quebrada, e as duas pedem gente olhando: NENHUM ponteiro foi solto.' }))],
    };
  }
  return { soltar: candidatas, retidas };
}
