// O ARQUIVO QUE A PESSOA ESCOLHE, e as tres coisas que toda tela precisa fazer
// com ele antes de mandar para o servidor.
//
// POR QUE ESTE ARQUIVO EXISTE (17/08/2026). As tres funcoes moravam dentro de
// `telas/fatura-unificada.tsx`, e ate ali estava certo: eram de uma tela so. A
// aba Faturas passou a subir o PDF do boleto emitido no banco, e a segunda tela a
// precisar delas seria a segunda COPIA - e o `reenviavel` e exatamente o tipo de
// detalhe que se copia com o defeito junto, porque o defeito e invisivel.
//
// Vieram para ca sem mudanca de comportamento nenhuma. O que era `function` local
// virou `export`, e a tela antiga passou a importar daqui - as verificacoes de
// `web/tests/` continuam valendo sobre o mesmo codigo.
//
// NAO LE JSX de proposito, como `cobranca-regras.ts` e `contrato-regras.ts`: o
// runner do `web/` e `node --experimental-strip-types`, e o que mora num `.tsx`
// nao pode ser verificado (regra 8). `reenviavel` recebe o EVENTO ja tipado em
// vez de desenhar o `<input>`, e e o que a mantem deste lado da fronteira.

/** O arquivo em base64, sem o prefixo `data:`. A rota o remove de novo, e os dois
 *  fazem certo — mandar o prefixo custaria uma ida ao servidor para descobrir. */
export function lerBase64(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => erro(new Error('não foi possível ler o arquivo'));
    r.readAsDataURL(f);
  });
}

/** O mime do arquivo, com o fallback pelo nome — o navegador as vezes nao o da.
 *  Quem decide de verdade e o servidor, pelos PRIMEIROS BYTES (`conferirAssinatura`
 *  em `src/http/rotas.ts`): isto aqui e so o palpite que acompanha o envio. */
export const mimeDo = (f: File): string =>
  f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/jpeg');

/**
 * O MESMO ARQUIVO PODE SER ENVIADO DE NOVO, e ate 14/08 nao podia.
 *
 * Os `<input type="file">` sao nao-controlados e nada tocava no `value` deles.
 * Com o `value` intacto, escolher o MESMO arquivo nao dispara `change` no
 * navegador — nada acontece: nem status, nem carregando, nem erro.
 *
 * E o caminho mais provavel e justamente o de RECUPERACAO: a leitura falhou ou
 * veio ruim, a pessoa clica de novo no mesmo PDF, e a tela nao reage. Zerar o
 * `value` depois de despachar custa uma linha e conserta os dois casos - o
 * reenvio e o "Nova fatura" seguido do mesmo arquivo.
 */
export function reenviavel(
  e: { target: { files: FileList | null; value: string } },
  enviar: (f: File) => void,
): void {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) enviar(f);
}

/** A mensagem de um erro qualquer, sem `[object Object]` na tela. */
export const naMensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));
