// O CREDITO CONGELADO DO CRM CONFERIDO CONTRA O ORIGINADOR DIGITADO.
// SPEC-002 R26, `Q-VIEWSCRED-01`, 03/08/2026.
//
// PURO: sem banco, sem CRM e sem relogio. Recebe as tres leituras ja feitas -
// as UCs espelhadas, `financeiro.vendas_creditadas` e `financeiro.rateio_situacao` -
// e devolve os sinais. `src/crm/sincronizacao.ts` faz as leituras e registra.
//
// POR QUE ISTO NAO ESCREVE NADA, E NUNCA VAI ESCREVER
//
// O eixo do originador e o credito congelado no momento do ganho (a
// `Q-EIXO-FUNCIONARIO-01` fechou assim em 03/08, pela resposta do dev do CRM).
// Seria tentador fazer o conector gravar `contrato.originador_id` a partir dele.
// Duas coisas proibem:
//
//   1. `originador_id` e campo LOCAL - a R5 diz que o usuario vence. O conector
//      escreve espelho, e originador nao e espelho: ele exige CPF/CNPJ, natureza
//      e `tipo`, que nenhuma das dez views entrega.
//   2. a R20-b da SPEC-001 congela `originador_tipo_no_fechamento` no `rascunhar`
//      e nao ha edicao de contrato. Um conector que escrevesse ali estaria
//      decidindo, sozinho e sem trilha de gente, quanto alguem recebe.
//
// Entao a forma e a da R21-b e da R25: **nao recusa, nao sobrescreve, nao cala**.
// Divergencia vira `Divergencia` em `conector_execucao.detalhe`.
//
// O CRITERIO DE RUIDO, e ele e o que decide cada regra abaixo.
//
// O comentario da R25 ja registrou a licao: um sinal que dispara em toda rodada
// treina qualquer um a ignorar o `detalhe` inteiro. Por isso cada condicao daqui
// foi MEDIDA contra o CRM real em 03/08/2026 antes de ser escrita, e as cinco
// disparam **zero** vezes contra o estado de hoje:
//
//   39 de 39 UCs espelhadas tem credito vigente ............. C1 nao dispara
//   nenhuma UC tem dois creditos vigentes .................... C2 nao dispara
//   0 contratos digitados ................................... C3, C4 e C5 idem
//
// As tres que existem com vendedor E parceiro (`Q-PARCERIA-01`) so viram sinal
// quando alguem digitar o contrato - antes disso nao ha escolha feita a acusar.
//
// O QUE NAO ENTROU, e vale registrar porque foi considerado:
// `divergencia_ficha`, coluna que o proprio CRM expoe, vem `true` em 7 das 48
// linhas. E divergencia INTERNA deles - entre o credito congelado e a ficha do
// lead -, nao entre eles e nos. Propaga-la seriam 7 sinais por rodada sobre algo
// que nao temos como consertar, que e exatamente o ruido descrito acima.

/** Uma linha de `financeiro.vendas_creditadas`, so o que a decisao usa. */
export type CreditoDoCrm = {
  uc: string | null;
  lead_codigo: string | null;
  vendedor: string | null;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  parceria_tipo: string | null;
  vigente: boolean;
  revogado_motivo: string | null;
};

/** Uma linha de `financeiro.rateio_situacao`, so o que a decisao usa. */
export type SituacaoDoRateio = {
  uc: string | null;
  situacao: string | null;
  em_troca_titularidade: boolean | null;
};

/**
 * Uma UC espelhada e o que o financeiro DIGITOU sobre ela.
 *
 * `contrato` e `null` no caso de hoje - 0 contratos em producao - e e por isso
 * que C3, C4 e C5 nascem silenciosas: nao ha escolha registrada a conferir.
 */
export type UcConferida = {
  numeroUc: string;
  contrato: {
    status: string;
    originadorNome: string | null;
    /** `originador.crm_partner_id`. Quando existe, e chave FORTE - ver `mesmoOriginador`. */
    originadorCrmPartnerId: string | null;
  } | null;
};

export type SinalDeCredito = { chave: string; sinal: string };

export type ResumoDeSituacao = {
  ativado: number;
  nao_ativado: number;
  em_troca_titularidade: number;
  sem_linha_na_view: number;
};

export type ConferenciaDeCredito = {
  /**
   * `false` quando `vendas_creditadas` veio VAZIA. Zero linhas e ambiguo entre
   * "a view quebrou" e "nao ha credito", exatamente como a §7 ja decidiu para
   * `vendas_ganhas` - e acusar 39 UCs de "sem credito" a partir de uma view que
   * pode estar quebrada seria o oposto de informar. A conferencia declara que
   * NAO RODOU, do mesmo jeito que `garantia_de_tenant_degradada` declara.
   */
  conferido: boolean;
  sinais: SinalDeCredito[];
  /** Contagem sobre as UCs ESPELHADAS - a populacao que nos importa. */
  resumoDeSituacao: ResumoDeSituacao;
};

/**
 * A normalizacao dos nomes, DECLARADA porque a comparacao depende dela.
 *
 * Acentos fora (NFD + corte dos diacriticos), espacos colapsados, caixa baixa.
 * "Renata " e "renata" sao a mesma pessoa; "Out Sales" e "OUT SALES" tambem.
 *
 * O MODO DE FALHA QUE ISTO NAO RESOLVE, e ele fica declarado em vez de escondido:
 * dois originadores homonimos passariam como o mesmo. Nome nao e chave. Onde ha
 * chave forte - `crm_partner_id` contra `parceiro_id` - ela e usada primeiro, e
 * a comparacao por nome so vale para o vendedor, que nao tem chave nossa: o
 * `originador` nao guarda `crm_user_id`, e cria-la seria migration com dono.
 */
export function normalizarNome(v: string | null | undefined): string | null {
  const t = v?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return t ? t : null;
}

/**
 * O originador digitado e alguma das duas pontas do credito?
 *
 * Devolve QUAL ponta casou, porque a C4 precisa saber: se casou o vendedor e ha
 * parceiro, ou o contrario, a `Q-PARCERIA-01` esta materializada naquele contrato.
 */
export function ladoQueCasa(
  contrato: NonNullable<UcConferida['contrato']>,
  c: CreditoDoCrm,
): 'vendedor' | 'parceiro' | null {
  // Chave FORTE primeiro. `crm_partner_id` e `parceiro_id` sao o mesmo UUID do
  // CRM, entao aqui nao ha palpite de nome nenhum.
  if (contrato.originadorCrmPartnerId && c.parceiro_id
      && contrato.originadorCrmPartnerId === c.parceiro_id) return 'parceiro';

  const digitado = normalizarNome(contrato.originadorNome);
  if (!digitado) return null;
  if (digitado === normalizarNome(c.vendedor)) return 'vendedor';
  if (digitado === normalizarNome(c.parceiro_nome)) return 'parceiro';
  return null;
}

const zeroResumo = (): ResumoDeSituacao =>
  ({ ativado: 0, nao_ativado: 0, em_troca_titularidade: 0, sem_linha_na_view: 0 });

/**
 * As cinco conferencias, por UC espelhada. Nenhuma escreve, nenhuma recusa.
 *
 * Uma UC pode produzir mais de um sinal - C1 e C5, por exemplo, sao fatos
 * independentes. So C3 e C4 sao mutuamente exclusivas, de proposito: quando o
 * digitado NAO casa com nenhuma ponta (C3), dizer tambem "e ha um parceiro" (C4)
 * seria repetir a mesma frase com outras palavras.
 */
export function conferirCreditoDeOriginador(e: {
  ucs: readonly UcConferida[];
  creditos: readonly CreditoDoCrm[];
  situacoes: readonly SituacaoDoRateio[];
}): ConferenciaDeCredito {
  const resumoDeSituacao = zeroResumo();

  if (e.creditos.length === 0) {
    return { conferido: false, sinais: [], resumoDeSituacao };
  }

  const vigentesPorUc = new Map<string, CreditoDoCrm[]>();
  const revogadosPorUc = new Map<string, CreditoDoCrm[]>();
  for (const c of e.creditos) {
    const uc = c.uc?.trim();
    if (!uc) continue;                       // credito sem UC nao conversa com o espelho
    const alvo = c.vigente ? vigentesPorUc : revogadosPorUc;
    const lista = alvo.get(uc);
    if (lista) lista.push(c); else alvo.set(uc, [c]);
  }
  const situacaoPorUc = new Map<string, SituacaoDoRateio>();
  for (const s of e.situacoes) {
    const uc = s.uc?.trim();
    if (uc) situacaoPorUc.set(uc, s);
  }

  const sinais: SinalDeCredito[] = [];
  for (const u of e.ucs) {
    const vigentes = vigentesPorUc.get(u.numeroUc) ?? [];

    // ---- C1. Nenhum credito vigente responde "quem vendeu" esta UC.
    if (vigentes.length === 0) {
      const revogados = revogadosPorUc.get(u.numeroUc) ?? [];
      const motivo = revogados.map((r) => r.revogado_motivo).find(Boolean);
      sinais.push({
        chave: u.numeroUc,
        sinal: revogados.length > 0
          ? `o credito da UC foi REVOGADO no CRM e nao ha substituto vigente`
            + `${motivo ? ` (motivo: ${motivo})` : ''}. Sem credito vigente nao ha eixo de originador `
            + 'para esta UC (SPEC-002 R26, Q-EIXO-FUNCIONARIO-01). Nada foi alterado aqui.'
          : 'a UC esta espelhada e nao tem credito vigente em financeiro.vendas_creditadas. '
            + 'Sem credito nao ha eixo de originador (SPEC-002 R26). Nada foi alterado aqui.',
      });
    }

    // ---- C2. Dois creditos vigentes: o eixo e ambiguo, e o conector nao escolhe.
    if (vigentes.length > 1) {
      const quem = vigentes.map((c) => c.vendedor ?? '(sem vendedor)').join(', ');
      sinais.push({
        chave: u.numeroUc,
        sinal: `a UC tem ${vigentes.length} creditos VIGENTES no CRM (${quem}). O conector nao `
             + 'escolhe qual vale - a R8 proibe palpite, e aqui o palpite pagaria comissao a '
             + 'uma das duas pessoas (SPEC-002 R26).',
      });
    }

    const credito = vigentes.length === 1 ? vigentes[0]! : null;

    if (u.contrato && credito) {
      const lado = ladoQueCasa(u.contrato, credito);
      const digitado = u.contrato.originadorNome ?? '(sem originador)';

      if (!lado) {
        // ---- C3. O contrato ja congelou um originador que o credito nao nomeia.
        const nomes = [
          credito.vendedor ? `vendedor "${credito.vendedor}"` : null,
          credito.parceiro_nome ? `parceiro "${credito.parceiro_nome}"` : null,
        ].filter(Boolean).join(' e ') || '(ninguem)';
        sinais.push({
          chave: u.numeroUc,
          sinal: `o contrato desta UC esta com o originador "${digitado}" e o credito congelado do `
               + `CRM nomeia ${nomes}. Nada foi sobrescrito: originador e campo LOCAL (R5) e a `
               + 'R20-b congela o tipo no rascunhar, sem edicao. Conferir antes de faturar '
               + '(SPEC-002 R26).',
        });
      } else if (credito.parceiro_id && credito.vendedor) {
        // ---- C4. Casou uma ponta, e a outra existe. E a `Q-PARCERIA-01` inteira.
        const outra = lado === 'vendedor'
          ? `parceiro "${credito.parceiro_nome}" (${credito.parceria_tipo ?? 'sem tipo'})`
          : `vendedor "${credito.vendedor}"`;
        sinais.push({
          chave: u.numeroUc,
          sinal: `o contrato ficou com o ${lado} "${digitado}", e o mesmo credito tambem nomeia o `
               + `${outra}. O credito traz as DUAS pontas e o contrato guarda uma so - a escolha `
               + 'muda a 2a parcela da comissao de 25% para zero (Q-PARCERIA-01).',
        });
      }
    }

    // ---- C5. Faturar UC cujo rateio o proprio CRM nao da por ativado.
    const s = situacaoPorUc.get(u.numeroUc);
    if (!s) resumoDeSituacao.sem_linha_na_view++;
    else {
      if (s.situacao === 'ativado') resumoDeSituacao.ativado++; else resumoDeSituacao.nao_ativado++;
      if (s.em_troca_titularidade) resumoDeSituacao.em_troca_titularidade++;
    }

    if (u.contrato?.status === 'ativo' && s) {
      const motivos = [
        s.situacao !== 'ativado' ? `situacao "${s.situacao ?? '(vazia)'}"` : null,
        s.em_troca_titularidade ? 'em TROCA DE TITULARIDADE' : null,
      ].filter(Boolean);
      if (motivos.length > 0) {
        sinais.push({
          chave: u.numeroUc,
          sinal: `o contrato desta UC esta ATIVO no financeiro e no CRM o rateio esta `
               + `${motivos.join(' e ')}. O conector nao recusa a linha nem encerra contrato `
               + '(Q-SITUACAO-01): quem decide se fatura e a operacao.',
        });
      }
    }
  }

  return { conferido: true, sinais, resumoDeSituacao };
}
