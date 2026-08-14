// AS ABAS DA FATURA COMO DADO PURO: quais existem, quais aparecem, e como se
// chega na que nao aparece. Sem JSX.
//
// POR QUE ISTO SAIU DO `fatura-unificada.tsx` EM 14/08/2026. O pedido do dono foi
// *"deixe a etapa de cadastro da fatura oculta por enquanto"*, e esconder uma aba
// e uma linha de codigo — mas a linha carrega tres decisoes que ninguem consegue
// ler no `.tsx`: QUAIS aparecem, COMO se alcanca a escondida, e o que acontece com
// quem ja estava dentro dela quando ela sumiu. O runner do `web/` e
// `node --experimental-strip-types` e nao le JSX, entao nada dentro de um `.tsx`
// pode ser verificado. E o mesmo motivo de `navegacao.ts`, `cobranca-regras.ts` e
// `contrato-regras.ts` existirem fora das telas. Regra 8.

export type AbaDaFatura = 'leitura' | 'emissao' | 'cadastro';

/** O rotulo carrega o NUMERO da etapa, e o numero e o da ordem visivel: com o
 *  cadastro oculto a barra le "1 · …" e "2 · …", e o "3 ·" so aparece junto com
 *  a aba que o usa. Renumerar na mao seria a quarta coisa a lembrar. */
export const ROTULO_DA_ABA: Record<AbaDaFatura, string> = {
  leitura: '1 · Leitura e cálculo',
  emissao: '2 · Emissão',
  cadastro: '3 · Cadastro da fatura',
};

/** As que aparecem por padrao. */
export const ABAS_VISIVEIS: readonly AbaDaFatura[] = ['leitura', 'emissao'];

/**
 * A QUE ESTA OCULTA — decisao do dono em 14/08/2026, *"por enquanto"*.
 *
 * OCULTA E NAO REMOVIDA, e a distincao nao e de estilo. Esta aba e o UNICO
 * caminho de tela para o que a folha imprime: razao social, CNPJ, o contato do
 * rodape, a logo, a chave Pix, os campos do documento, o modelo e os campos
 * personalizados. **Medido em producao no dia em que ela foi escondida: os cinco
 * campos do emissor estao VAZIOS e nao ha logo** — entao a folha sai sem a linha
 * do emissor e sem o Beneficiario do boleto, que e o nome ao qual o aviso contra
 * o golpe se amarra.
 *
 * Remove-la fecharia o unico jeito de consertar isso pela tela, e este projeto ja
 * pagou por esse erro uma vez: a migration 26 criou `razao_social` e `cnpj` sem
 * formulario, e o registro daquele dia diz *"um campo que so o `psql` alcanca nao
 * e um campo — e uma coluna"* (`REFERENCIA-fatura-unificada-2026-08-13.md` §15.4).
 *
 * Entao ela sai da BARRA e continua alcancavel pelo endereco. Quem precisa
 * preencher o emissor abre `/documento#cadastro`; quem nao precisa nao ve.
 */
export const ABA_OCULTA: AbaDaFatura = 'cadastro';

/** O que revela a aba oculta. Fragmento e nao rota nova: `#` nao vai ao servidor,
 *  nao entra no `telaDoCaminho` e nao inventa uma tela que a navegacao teria de
 *  conhecer. Some da barra tirando o `#` — sem recarregar. */
export const FRAGMENTO_DA_ABA_OCULTA = '#cadastro';

/** `true` quando o endereco pede a aba oculta. Aceita o fragmento com ou sem o
 *  `#`, porque `location.hash` vem com ele e um teste tende a escrever sem. */
export function revelaAbaOculta(hash: string): boolean {
  const limpo = hash.trim().replace(/^#/, '').toLowerCase();
  return limpo === FRAGMENTO_DA_ABA_OCULTA.replace(/^#/, '');
}

/** A ordem que a barra desenha. E a MESMA lista que governa a seta do teclado —
 *  duas listas discordando dariam uma aba clicavel que a seta nao alcanca. */
export function ordemDasAbas(revelada: boolean): readonly AbaDaFatura[] {
  return revelada ? [...ABAS_VISIVEIS, ABA_OCULTA] : ABAS_VISIVEIS;
}

/**
 * A aba que vale, dada a que esta aberta e a ordem vigente.
 *
 * EXISTE POR UM CAMINHO CONCRETO: quem esta em `#cadastro` e apaga o `#` da barra
 * de endereco continua com `aba === 'cadastro'` enquanto a ordem passou a ter
 * duas. Sem esta funcao a barra desenharia duas abas com NENHUMA marcada, o
 * painel seguiria mostrando o cadastro, e — pior — nenhuma delas ficaria no
 * caminho do `Tab`, porque `tabIndex` e 0 so na ativa. Vira uma barra de abas
 * inalcancavel por teclado.
 */
export function abaVigente(
  atual: AbaDaFatura, ordem: readonly AbaDaFatura[],
): AbaDaFatura {
  return ordem.includes(atual) ? atual : ordem[0]!;
}
