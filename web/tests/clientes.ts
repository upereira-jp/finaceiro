// AS REGRAS DA ABA CLIENTES. Puro, sem DOM e sem rede.
// Uso: node --experimental-strip-types web/tests/clientes.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. A aba Clientes listava e cadastrava, e nao
// EDITAVA: o CPF/CNPJ de quem ja estava na carteira so entrava por
// `npm run documentos`, um script rodado de um Codespace contra producao. Medido
// na `PENDENCIAS.md` §2.a: **0 de 29**, e e a primeira pendencia da fila da
// primeira fatura - sem documento validado a R9 recusa ativar contrato e o boleto
// para em `PagadorSemDocumento`.
//
// A REGRA MAIS FACIL DE ERRAR AQUI E A R8, e ela e contraintuitiva: um CPF vindo
// do CRM NAO vale, mesmo passando no digito verificador. Uma tela que mostrasse
// so "tem documento / nao tem" diria que 24 clientes estao resolvidos quando
// nenhum deles destrava contrato nenhum.

import {
  situacaoDoDocumento, ROTULO_DA_SITUACAO_DO_DOCUMENTO, TOM_DA_SITUACAO_DO_DOCUMENTO,
  destravaContrato, contarDocumentos, normalizarDocumento, tipoPeloComprimento,
  formatarDocumento, motivoDaTravaDoDocumento, podeGravarDocumento,
  type ClienteConferivel, type SituacaoDoDocumento,
} from '../src/clientes-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const cli = (p: Partial<ClienteConferivel>): ClienteConferivel =>
  ({ documento: null, documento_validado: false, documento_origem: null, ...p });

// ------------------------------------------- C1 os quatro estados do documento
{
  chk('C1', situacaoDoDocumento(cli({})) === 'sem_documento',
      'sem documento nenhum: `sem_documento`');
  chk('C1b', situacaoDoDocumento(cli({ documento: '   ' })) === 'sem_documento',
      'so espaco tambem e ausencia - nao e um documento de comprimento errado');

  chk('C1c', situacaoDoDocumento(cli({
        documento: '52998224725', documento_validado: true, documento_origem: 'coleta_local',
      })) === 'validado',
      'coletado localmente e com digito conferido: `validado`');

  /* A R8 EM UMA LINHA. O digito deste CPF fecha - e o mesmo do caso acima -, e
   * mesmo assim ele nao vale, porque veio do CRM. */
  chk('C1d', situacaoDoDocumento(cli({
        documento: '52998224725', documento_validado: false, documento_origem: 'crm_semente',
      })) === 'semente_do_crm',
      'MESMO CPF, vindo do CRM: `semente_do_crm` - digito correto nao prova que e daquela pessoa (R8)');

  chk('C1e', situacaoDoDocumento(cli({
        documento: '11111111111', documento_validado: false, documento_origem: 'coleta_local',
      })) === 'digito_nao_confere',
      'digitado aqui e reprovado no digito: `digito_nao_confere` - provavelmente transcricao');

  /* Sem a origem legivel, a resposta CONSERVADORA e "nao confirmado", e nao
   * "errado": mandar alguem procurar defeito num documento correto e pior. */
  chk('C1f', situacaoDoDocumento({ documento: '52998224725' }) === 'semente_do_crm',
      'sem origem legivel a resposta e `semente_do_crm`, e nao uma acusacao de erro');
}

// -------------------------------------- C2 so `validado` destrava o contrato
{
  const estados: SituacaoDoDocumento[] =
    ['sem_documento', 'semente_do_crm', 'digito_nao_confere', 'validado'];

  chk('C2', estados.every((s) => ROTULO_DA_SITUACAO_DO_DOCUMENTO[s].length > 0
                              && TOM_DA_SITUACAO_DO_DOCUMENTO[s] !== undefined),
      'os quatro estados tem rotulo e tom - nenhum cai num `undefined` na pilula');

  chk('C2b', destravaContrato(cli({
        documento: '52998224725', documento_validado: true, documento_origem: 'coleta_local' })),
      'o validado destrava (R9 - `podeAtivarContrato`)');
  chk('C2c', !destravaContrato(cli({
        documento: '52998224725', documento_validado: false, documento_origem: 'crm_semente' })),
      'e a semente do CRM NAO destrava, ainda que o documento esteja preenchido');
  chk('C2d', !destravaContrato(cli({})),
      'e a ausencia tambem nao, obviamente - mas ela conta separado no aviso');

  chk('C2e', TOM_DA_SITUACAO_DO_DOCUMENTO.semente_do_crm === 'nao_medido'
        && TOM_DA_SITUACAO_DO_DOCUMENTO.digito_nao_confere === 'pendente',
      'semente e `nao_medido` e digito torto e `pendente`: "nao confirmado" nao e "errado"');
}

// ------------------------------------------------ C3 a contagem, e a invariante
{
  const lista: ClienteConferivel[] = [
    cli({}),
    cli({ documento: '' }),
    cli({ documento: '52998224725', documento_validado: true, documento_origem: 'coleta_local' }),
    cli({ documento: '52998224725', documento_origem: 'crm_semente' }),
    cli({ documento: '11111111111', documento_origem: 'coleta_local' }),
  ];
  const c = contarDocumentos(lista);
  chk('C3', c.total === 5 && c.sem_documento === 2 && c.validados === 1 && c.nao_validados === 2,
      'a contagem separa as tres classes: 2 sem, 1 validado, 2 preenchidos que nao valem');
  chk('C3b', c.sem_documento + c.nao_validados + c.validados === c.total,
      'A INVARIANTE: as tres classes somam o total - contagem que perde item parece completa');

  const vazia = contarDocumentos([]);
  chk('C3c', vazia.total === 0 && vazia.sem_documento === 0,
      'lista vazia nao e um estado especial - 0 de 0 nao vira aviso');

  /* O caso que a tela existe para nao esconder: documento preenchido em TODOS, e
   * nenhum contrato pode ativar. */
  const soSemente = contarDocumentos([
    cli({ documento: '52998224725', documento_origem: 'crm_semente' }),
    cli({ documento: '11144477735', documento_origem: 'crm_semente' }),
  ]);
  chk('C3d', soSemente.sem_documento === 0 && soSemente.validados === 0 && soSemente.nao_validados === 2,
      'dois documentos preenchidos e ZERO validados - "tem documento" nao e "o documento vale"');
}

// ------------------------------------------ C4 forma: normalizar e reconhecer
{
  chk('C4', normalizarDocumento('529.982.247-25') === '52998224725',
      'a mascara sai e sobram os digitos');
  chk('C4b', normalizarDocumento('12.abc.678/0001-95') === '12ABC6780001 95'.replace(' ', ''),
      'letra SOBREVIVE e vira maiuscula - CNPJ alfanumerico e emitido desde 31/07/2026');
  chk('C4c', normalizarDocumento('  ') === '', 'espaco vira vazio');

  chk('C4d', tipoPeloComprimento('529.982.247-25') === 'cpf',
      '11 caracteres e CPF em FORMA - valido ou nao, quem diz e o servidor');
  chk('C4e', tipoPeloComprimento('66.714.022/0001-21') === 'cnpj', '14 caracteres e CNPJ');
  chk('C4f', tipoPeloComprimento('12ABC6780001 95') === 'cnpj',
      'e o CNPJ alfanumerico e reconhecido igual: o comprimento nao olha o conteudo');
  chk('C4g', tipoPeloComprimento('1234567890') === null && tipoPeloComprimento('') === null,
      'qualquer outro comprimento nao e nem um nem outro');
}

// ---------------------------------------------------- C5 a mascara de exibicao
{
  chk('C5', formatarDocumento('52998224725') === '529.982.247-25', 'CPF sai mascarado');
  chk('C5b', formatarDocumento('66714022000121') === '66.714.022/0001-21', 'CNPJ sai mascarado');
  chk('C5c', formatarDocumento('12ABC6780001 95') === '12.ABC.678/0001-95',
      'a mascara e POSICIONAL, entao o CNPJ alfanumerico sai formatado tambem');
  chk('C5d', formatarDocumento('1234567890') === '1234567890',
      'comprimento errado volta cru - mascara faria parecer mais correto do que e');
  chk('C5e', formatarDocumento(null) === '' && formatarDocumento(undefined) === '',
      'nulo e indefinido viram string vazia, e nao "null"');
}

// ------------------------------------------ C6 a trava do botao, e o que ela NAO faz
{
  const base = { texto: '529.982.247-25', atual: null, ocupado: false };

  chk('C6', motivoDaTravaDoDocumento(base) === null && podeGravarDocumento(base),
      'CPF completo num cliente sem documento: grava');
  chk('C6b', motivoDaTravaDoDocumento({ ...base, ocupado: true }) === 'ocupado',
      '`ocupado` vem primeiro, antes de qualquer juizo sobre o texto');
  chk('C6c', motivoDaTravaDoDocumento({ texto: '', atual: null, ocupado: false }) === 'sem_mudanca',
      'campo vazio em cliente que ja estava vazio: nao ha o que gravar');
  chk('C6d', motivoDaTravaDoDocumento({ texto: '12345', atual: null, ocupado: false }) === 'comprimento',
      'documento pela metade trava - 10 digitos nao sao um CPF com defeito, e digitacao interrompida');

  /* A R9 NA TRAVA, e este e o caso que mais tenta o contrario: um CPF cujo
   * digito NAO fecha continua gravavel. A regra e explicita - documento invalido
   * nao bloqueia o cadastro, bloqueia a ativacao do contrato -, e uma tela mais
   * rigida que a regra impediria registrar o que esta no contrato de papel. */
  chk('C6e', podeGravarDocumento({ texto: '111.111.111-11', atual: null, ocupado: false }),
      'CPF de digito reprovado GRAVA: a R9 bloqueia o contrato, nunca o cadastro');

  /* REENVIAR O MESMO DOCUMENTO E ATO, e nao repeticao: e o que troca a origem de
   * `crm_semente` para `coleta_local` e destrava a R9. O importador em lote ja
   * contava esse caso a parte, como `so_validou`. */
  chk('C6f', podeGravarDocumento({ texto: '529.982.247-25', atual: '52998224725', ocupado: false }),
      'gravar o MESMO documento que ja esta la e permitido - e o ato que o valida');

  chk('C6g', podeGravarDocumento({ texto: '', atual: '52998224725', ocupado: false }),
      'e apagar tambem: um documento gravado na pessoa errada tem de poder sair');
}

console.log();
if (falhas > 0) { console.log(`--- clientes: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- clientes (regras da tela): 34 verificacoes, 0 falhas');
