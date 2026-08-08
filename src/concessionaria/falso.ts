// ADAPTADORES FALSOS da concessionaria. Deterministas, sem rede, com memoria.
//
// NAO E MOCK DE TESTE ESCONDIDO NO SRC: sao as implementacoes de referencia das
// duas portas, e sao o que torna a frente de leitura automatica exercitavel
// ponta a ponta HOJE - coletar, extrair, validar, conferir e recusar - sem
// portal, sem credencial e sem um unico byte de rede. O mesmo papel que o leitor
// falso do CRM cumpriu na `SPEC-002` e que `src/sicoob/falso.ts` cumpre na F2.
//
// QUATRO COISAS QUE ELES FAZEM DE PROPOSITO, e cada uma existe porque o
// adaptador permissivo demais esconde no teste o erro que aparece em producao:
//
//   1. Recusam UC sem fatura na competencia com `SemFaturaNaCompetencia`, em vez
//      de devolver documento vazio. Documento vazio vira extracao vazia vira
//      "ausente nao e zero" tres camadas adiante, longe da causa.
//   2. Sao IDEMPOTENTES por (UC, competencia): a segunda coleta devolve o mesmo
//      `sha256`. Um falso que gerasse bytes novos a cada chamada faria a
//      deduplicacao passar no teste e falhar no portal.
//   3. O relogio e INJETADO. `coletado_em` entra pelo construtor, entao o teste
//      afirma a data em vez de tolera-la.
//   4. O extrator falso devolve TEXTO CRU, com os defeitos que texto cru tem —
//      `R$ `, milhar com ponto, zero a esquerda perdido. Um falso que devolvesse
//      numero limpo testaria o dominio contra uma entrada que o mundo nao produz.

import { createHash } from 'node:crypto';
import {
  type PortaDeColetaDeFatura, type PortaDeLeituraDeFatura, type PedidoDeColeta,
  type DocumentoDaFatura, type ExtracaoDaFatura,
  SemFaturaNaCompetencia, CredencialRecusadaPeloPortal, PortalBloqueouAColeta,
} from './porta.ts';
import type { CamposDaFatura } from '../dominio/fatura-concessionaria.ts';

/** O que o portal falso "tem publicado". Chave: `numeroUC@competencia`. */
export type FaturaPublicada = {
  campos: CamposDaFatura;
  tipo?: string;
};

const chave = (uc: string, comp: string) => `${uc}@${comp}`;

export class ColetaFalsa implements PortaDeColetaDeFatura {
  readonly chamadas: Array<{ numeroUC: string; competencia: string }> = [];
  /** Ligado, a proxima coleta e bloqueada. Exercita a fila de retentativa sem
   *  depender de o portal cair de verdade. */
  bloquearProximaColeta: string | null = null;
  /** Credenciais que o portal falso recusa, por UC. */
  readonly credenciaisRecusadas = new Set<string>();

  private readonly publicadas: Map<string, FaturaPublicada>;
  private readonly relogio: Date;

  constructor(publicadas: Record<string, FaturaPublicada> = {}, relogio = new Date('2026-08-07T12:00:00Z')) {
    this.publicadas = new Map(Object.entries(publicadas));
    this.relogio = relogio;
  }

  publicar(numeroUC: string, competencia: string, f: FaturaPublicada): void {
    this.publicadas.set(chave(numeroUC, competencia), f);
  }

  async coletar(p: PedidoDeColeta): Promise<DocumentoDaFatura> {
    this.chamadas.push({ numeroUC: p.numeroUC, competencia: p.competencia });

    if (this.bloquearProximaColeta) {
      const d = this.bloquearProximaColeta;
      this.bloquearProximaColeta = null;
      throw new PortalBloqueouAColeta(d);
    }
    if (this.credenciaisRecusadas.has(p.numeroUC)) {
      throw new CredencialRecusadaPeloPortal(p.numeroUC);
    }

    const pub = this.publicadas.get(chave(p.numeroUC, p.competencia));
    if (!pub) throw new SemFaturaNaCompetencia(p.numeroUC, p.competencia);

    // Os bytes sao derivados dos campos, entao a mesma fatura produz sempre o
    // mesmo documento e o mesmo sha256 - que e a propriedade 2 acima.
    const corpo = JSON.stringify({ uc: p.numeroUC, comp: p.competencia, campos: pub.campos });
    const conteudo = new TextEncoder().encode(corpo);

    return {
      conteudo,
      tipo: pub.tipo ?? 'application/pdf',
      sha256: createHash('sha256').update(conteudo).digest('hex'),
      coletado_em: this.relogio,
      proveniencia: { portal: 'FALSO', uc: p.numeroUC, competencia: p.competencia },
    };
  }
}

/**
 * O extrator falso. Le de volta o que a `ColetaFalsa` embutiu no documento.
 *
 * Ele NAO adivinha layout, e nao ha layout aqui: a fatura falsa carrega os
 * campos ja nomeados. O que ele exercita e o contrato — texto cru para o
 * dominio, metodo declarado, trecho original preservado — e nao a extracao em
 * si, que depende de um documento real que ninguem deste lado viu ainda
 * (`Q-EQTL-CAMPOS-01`).
 */
export class LeituraFalsa implements PortaDeLeituraDeFatura {
  readonly chamadas: string[] = [];
  /** Ligado, o proximo campo nomeado volta ausente. Exercita "ausente nao e zero". */
  omitirProximoCampo: keyof CamposDaFatura | null = null;

  async extrair(d: DocumentoDaFatura): Promise<ExtracaoDaFatura> {
    this.chamadas.push(d.sha256);
    const corpo = JSON.parse(new TextDecoder().decode(d.conteudo)) as {
      campos: CamposDaFatura;
    };
    const campos: CamposDaFatura = { ...corpo.campos };

    if (this.omitirProximoCampo) {
      campos[this.omitirProximoCampo] = null as never;
      this.omitirProximoCampo = null;
    }

    const trechos: ExtracaoDaFatura['trechos'] = {};
    for (const [k, v] of Object.entries(campos)) {
      if (v !== null && v !== undefined) trechos[k as keyof CamposDaFatura] = String(v);
    }

    return { campos, metodo: 'FALSO/campos-embutidos', trechos };
  }
}
