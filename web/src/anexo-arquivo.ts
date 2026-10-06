// O COMPROVANTE COMO ARQUIVO, do lado do navegador (06/10/2026, ADR-0009).
//
// Três coisas, e as três existem por causa do teto de 8 MB do banco:
//   - a FOTO DO CELULAR é reduzida antes de subir (uma foto de 12 MP tem 4 a 6
//     MB; reduzida a 2.000 px no lado maior, em JPEG, fica em centenas de KB e o
//     comprovante continua legível). PDF não se mexe;
//   - o que passa do teto é recusado AQUI, com a frase, antes de gastar o upload;
//   - abrir o anexo busca os bytes com a sessão (`buscarBinario`) — um `<a href>`
//     para a API não carregaria o `Authorization` e voltaria 401.
//
// O tipo verdadeiro é decidido pelo BANCO, pelos primeiros bytes; o `accept` do
// campo e o `tipo` mandado aqui são só a primeira peneira.

import { api, buscarBinario } from './api.ts';

export const TETO_DO_ANEXO = 8 * 1024 * 1024;
export const TIPOS_DO_ANEXO = 'application/pdf,image/png,image/jpeg,image/webp';
/** Acima disto a imagem é reduzida; abaixo, sobe como veio. */
const REDUZIR_ACIMA = 1_500_000;
const LADO_MAXIMO = 2000;

function base64(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(blob);
  });
}

/** A foto grande, reduzida a 2.000 px no lado maior, em JPEG 85%. Se não reduzir, a original. */
async function reduzida(arquivo: File): Promise<{ blob: Blob; nome: string; tipo: string }> {
  const original = { blob: arquivo as Blob, nome: arquivo.name, tipo: arquivo.type };
  if (!arquivo.type.startsWith('image/') || arquivo.size <= REDUZIR_ACIMA || typeof createImageBitmap !== 'function') return original;
  try {
    const img = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const tela = document.createElement('canvas');
    tela.width = Math.round(img.width * escala);
    tela.height = Math.round(img.height * escala);
    tela.getContext('2d')!.drawImage(img, 0, 0, tela.width, tela.height);
    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || blob.size >= arquivo.size) return original;
    return { blob, nome: arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: 'image/jpeg' };
  } catch {
    return original;
  }
}

/** Sobe o arquivo como comprovante da conta. Devolve a frase do erro em vez de lançar. */
export async function anexarArquivo(contaPagarId: string, arquivo: File): Promise<string | null> {
  if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(arquivo.type)) {
    return `«${arquivo.name}» não é PDF nem foto (PNG, JPEG ou WEBP).`;
  }
  const r = await reduzida(arquivo);
  if (r.blob.size > TETO_DO_ANEXO) {
    return `«${arquivo.name}» tem ${Math.round(r.blob.size / 1024 / 1024)} MB, e o teto é 8 MB. Um PDF de comprovante tem centenas de KB.`;
  }
  try {
    await api.post(`/contas-a-pagar/${contaPagarId}/anexos`, {
      nome_arquivo: r.nome, tipo: r.tipo, conteudo_base64: await base64(r.blob),
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Não foi possível anexar o arquivo.';
  }
}

/**
 * Abre o anexo numa aba nova. A aba é aberta ANTES de buscar os bytes: aberta
 * depois do `await`, o bloqueador de janelas do navegador a recusaria.
 */
export async function abrirAnexo(id: string): Promise<string | null> {
  const aba = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await buscarBinario(`/anexos/${id}`));
    if (aba) aba.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch (e) {
    aba?.close();
    return e instanceof Error ? e.message : 'Não foi possível abrir o anexo.';
  }
}

/** «312 KB», «1,4 MB». */
export function tamanhoEmBr(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
