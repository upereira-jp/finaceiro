// AS ABAS DA FATURA COMO DADO PURO: quais existem, como se chamam, e qual o
// endereco abre direto em cada uma. Sem JSX.
//
// POR QUE ISTO SAIU DO `fatura-unificada.tsx` EM 14/08/2026. Esconder uma aba
// era uma linha de codigo que carregava tres decisoes que ninguem conseguia ler
// no `.tsx`: QUAIS aparecem, COMO se alcanca a escondida, e o que acontece com
// quem ja estava dentro dela quando ela sumiu. O runner do `web/` e
// `node --experimental-strip-types` e nao le JSX, entao nada dentro de um `.tsx`
// pode ser verificado. E o mesmo motivo de `navegacao.ts`, `cobranca-regras.ts` e
// `contrato-regras.ts` existirem fora das telas. Regra 8.
//
// ============================================================================
// 30/09/2026 (etapa 1 do redesenho) — AS TRES ABAS FICAM NA BARRA
//
// De 14/08 a 30/09 o cadastro da fatura esteve OCULTO — decisao do dono,
// *"deixe a etapa de cadastro da fatura oculta por enquanto"* — e so aparecia
// com `#cadastro` no endereco. O "por enquanto" venceu pelo motivo que este
// arquivo ja registrava: a aba e o UNICO caminho de tela para o que a folha
// imprime (razao social, CNPJ, contato do rodape, logo, chave Pix, campos, modelo),
// e **os cinco campos do emissor estavam VAZIOS em producao** no dia em que ela
// foi escondida. Uma porta que so abre para quem sabe o endereco e, na pratica,
// uma porta fechada para quem chega depois — a critica de 30/09 a contou como
// problema de controle (heuristica 3), e o redesenho aprovado pelo dono a tira.
//
// O `#cadastro` CONTINUA VALENDO, agora para ABRIR a aba e nao para revela-la:
// a tela de Pendencias, a ajuda e tres mensagens do SERVIDOR mandam para
// `/documento#cadastro` pelo nome «3 · Cadastro da fatura», e as tres
// continuam certas letra por letra.
//
// E A ABA 2 MUDOU DE NOME. Ela se chamava «2 · Emissão», e e so a folha que o
// cliente recebe, para conferir e imprimir — quem lia "Emissão" procurava ali o
// passo 3 do mes, que e a tela «Emissão e cobrança». Agora ela diz o que mostra.

export type AbaDaFatura = 'leitura' | 'emissao' | 'cadastro';

/** O rotulo carrega o NUMERO da aba, e o numero e o da ordem na barra. A chave
 *  interna `emissao` ficou (ela e o `id` do painel), o que a pessoa le mudou. */
export const ROTULO_DA_ABA: Record<AbaDaFatura, string> = {
  leitura: '1 · Leitura e cálculo',
  emissao: '2 · Folha do cliente',
  cadastro: '3 · Cadastro da fatura',
};

/** A ordem da barra. E a MESMA lista que governa a seta do teclado — duas listas
 *  discordando dariam uma aba clicavel que a seta nao alcanca. */
export const ABAS: readonly AbaDaFatura[] = ['leitura', 'emissao', 'cadastro'];

/** O endereco que abre direto no cadastro. Fragmento e nao rota nova: `#` nao
 *  vai ao servidor, nao entra no `telaDoCaminho` e nao inventa uma tela que a
 *  navegacao teria de conhecer. */
export const FRAGMENTO_DO_CADASTRO = '#cadastro';

/** A aba que o endereco pede, ou `null` quando ele nao pede nenhuma. Aceita o
 *  fragmento com ou sem o `#`, porque `location.hash` vem com ele e um teste
 *  tende a escrever sem. */
export function abaDoFragmento(hash: string): AbaDaFatura | null {
  const limpo = hash.trim().replace(/^#/, '').toLowerCase();
  return limpo === FRAGMENTO_DO_CADASTRO.replace(/^#/, '') ? 'cadastro' : null;
}

/**
 * O fragmento que o endereco deve ter com esta aba aberta.
 *
 * O ENDERECO ACOMPANHA A ABA, e o motivo e um defeito que a aba oculta tinha: com
 * `#cadastro` ja no endereco, um link para `/documento#cadastro` nao mudava nada
 * — mesmo fragmento, nenhum `hashchange` — e o clique nao abria a aba. Com o
 * endereco sempre dizendo a aba aberta, o fragmento so esta la quando o cadastro
 * esta aberto, e recarregar a pagina volta para onde a pessoa estava.
 */
export const fragmentoDaAba = (aba: AbaDaFatura): string =>
  (aba === 'cadastro' ? FRAGMENTO_DO_CADASTRO : '');
