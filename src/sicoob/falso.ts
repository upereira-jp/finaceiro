// Adaptador FALSO da cobranca. Determinista, sem rede, com memoria.
//
// NAO E MOCK DE TESTE ESCONDIDO NO SRC: e a implementacao de referencia da
// porta, e ela e o que torna a F2 testavel ponta a ponta hoje - compor, emitir,
// registrar boleto, receber a liquidacao e rodar o split - sem certificado A1 e
// sem sandbox. O mesmo papel que o leitor falso do CRM cumpriu na SPEC-002.
//
// DUAS COISAS QUE ELE FAZ DE PROPOSITO, e as duas ja pegaram bug em outros
// pontos deste projeto:
//
//   1. NAO devolve segredo em payload. Se devolvesse, a constraint
//      `boleto_payload_sem_segredo` recusaria a linha - e e assim que se testa
//      que a constraint morde, plantando o segredo de proposito.
//   2. Recusa registrar duas vezes a mesma referencia. O boleto e 1:1 com a
//      fatura no banco; um adaptador mais permissivo que o banco esconde, no
//      teste, o erro que aparece em producao.

import {
  type PortaDeCobranca, type PedidoDeBoleto, type BoletoRegistrado,
  type SituacaoDoBoleto, type CredencialRef,
} from './porta.ts';
import type { Centavos } from '../dominio/centavos.ts';

export type RegistroFalso = {
  nossoNumero: string;
  referencia: string;
  valorCentavos: Centavos;
  vencimento: Date;
  situacao: SituacaoDoBoleto['situacao'];
  liquidacao: { valor: Centavos; juros: Centavos; multa: Centavos; data: Date; idExterno: string } | null;
};

export class CobrancaFalsa implements PortaDeCobranca {
  readonly registros = new Map<string, RegistroFalso>();
  readonly chamadas: Array<{ verbo: string; argumento: string }> = [];
  /** Ligado, a proxima chamada de `registrar` falha. Serve para exercitar a
   *  fila de retentativa do PRD 6 sem depender de rede caindo. */
  falharProximoRegistro: string | null = null;

  private sequencia = 0;
  // Campo declarado em vez de propriedade de parametro: o tsconfig liga
  // `erasableSyntaxOnly`, porque o projeto roda TypeScript direto no Node por
  // --experimental-strip-types, e strip-types apaga tipos sem EXECUTAR
  // TypeScript. Propriedade de parametro nao e tipo, e sintaxe que gera codigo.
  private readonly prefixo: string;

  constructor(prefixo = 'FALSO') { this.prefixo = prefixo; }

  async registrar(p: PedidoDeBoleto): Promise<BoletoRegistrado> {
    this.chamadas.push({ verbo: 'registrar', argumento: p.referencia });

    if (this.falharProximoRegistro) {
      const erro = this.falharProximoRegistro;
      this.falharProximoRegistro = null;
      throw Object.assign(new Error(`falha simulada da cobranca: ${erro}`), { status: 502 });
    }
    for (const r of this.registros.values()) {
      if (r.referencia === p.referencia) {
        throw Object.assign(
          new Error(`boleto ja registrado para a referencia ${p.referencia}`), { status: 409 });
      }
    }

    const nossoNumero = `${this.prefixo}-${String(++this.sequencia).padStart(8, '0')}`;
    this.registros.set(nossoNumero, {
      nossoNumero, referencia: p.referencia, valorCentavos: p.valorCentavos,
      vencimento: p.vencimento, situacao: 'em_aberto', liquidacao: null,
    });

    return {
      nossoNumero,
      // Formato posicional, nao o calculo real do codigo de barras: o adaptador
      // falso nao finge ser o Febraban. O que importa aqui e que o campo chega
      // preenchido e cabe na coluna.
      linhaDigitavel: `${nossoNumero}.${String(p.valorCentavos).padStart(10, '0')}`,
      codigoBarras: `756${String(p.valorCentavos).padStart(10, '0')}${nossoNumero}`,
      pixCopiaECola: `00020126${nossoNumero}5204000053039865802BR`,
      pixTxid: nossoNumero.replace(/-/g, ''),
      sicoobNumeroContrato: 'contrato-falso',
      sicoobNossoNumero: nossoNumero,
      // Sem `client_id`, sem `access_token`: ver o item 1 do cabecalho.
      payloadEnvio: { referencia: p.referencia, valorCentavos: p.valorCentavos },
      payloadRetorno: { nossoNumero, situacao: 'em_aberto' },
    };
  }

  async consultar(_c: CredencialRef, nossoNumero: string): Promise<SituacaoDoBoleto> {
    this.chamadas.push({ verbo: 'consultar', argumento: nossoNumero });
    const r = this.registros.get(nossoNumero);
    if (!r) {
      return {
        nossoNumero, situacao: 'desconhecida', valorLiquidadoCentavos: null,
        jurosCentavos: 0, multaCentavos: 0, dataLiquidacao: null, idExterno: null,
      };
    }
    return {
      nossoNumero,
      situacao: r.situacao,
      valorLiquidadoCentavos: r.liquidacao?.valor ?? null,
      jurosCentavos: r.liquidacao?.juros ?? 0,
      multaCentavos: r.liquidacao?.multa ?? 0,
      dataLiquidacao: r.liquidacao?.data ?? null,
      idExterno: r.liquidacao?.idExterno ?? null,
    };
  }

  async baixar(_c: CredencialRef, nossoNumero: string, motivo: string): Promise<void> {
    this.chamadas.push({ verbo: 'baixar', argumento: `${nossoNumero}:${motivo}` });
    const r = this.registros.get(nossoNumero);
    if (r) r.situacao = 'baixado';
  }

  /**
   * O BANCO PAGA. Nao e da porta - e o gatilho que o mundo externo puxaria, e o
   * teste precisa dele para chegar na liquidacao pelo caminho de producao em vez
   * de inserir a baixa a mao.
   *
   * `idExterno` derivado do nosso numero e estavel de proposito: e o que faz o
   * webhook repetido ser idempotente de verdade no teste, e nao por sorte.
   */
  pagar(nossoNumero: string, o: { juros?: Centavos; multa?: Centavos; data?: Date } = {}) {
    const r = this.registros.get(nossoNumero);
    if (!r) throw new Error(`boleto ${nossoNumero} nao existe no adaptador falso`);
    const juros = o.juros ?? 0;
    const multa = o.multa ?? 0;
    r.situacao = 'liquidado';
    r.liquidacao = {
      valor: r.valorCentavos + juros + multa,
      juros, multa,
      data: o.data ?? new Date(),
      idExterno: `evt-${nossoNumero}`,
    };
    return r.liquidacao;
  }
}
