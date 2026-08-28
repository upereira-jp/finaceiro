// O ENSAIO CONTRA A SICOOB DE VERDADE. Sem banco, sem certificado, sem tocar
// em fatura nenhuma.
//
// Uso:  npm run ensaio-sicoob
//
// ============================================================================
// O QUE ELE PROVA, E O QUE ELE NAO PROVA
//
// A suite `tests/sicoob-http.ts` exerce o adaptador contra um transporte de
// mentira: ela prova o que SUBE e o que o codigo faz com o que DESCE. O que ela
// nao pode provar e que existe alguem do outro lado - que o endereco esta certo,
// que o TLS fecha, que o gateway aceita os cabecalhos e que o JSON real tem a
// forma que a documentacao diz.
//
// E o que este ensaio faz, e por isso ele usa o `transporteHttps` DE PRODUCAO -
// a mesma funcao, o mesmo `https.Agent`, os mesmos cabecalhos.
//
// ELE NAO PROVA QUE UM BOLETO NASCE. Medido em 27/08/2026: o sandbox e mock
// estatico. `GET /boletos` devolve sempre o mesmo exemplo, `POST /boletos`
// devolve sempre `400` com o exemplo de erro - para corpo vazio e para corpo bem
// formado, testados os dois. Entao o `registrar` aqui EXERCE O CAMINHO DE ERRO,
// e o sucesso continua sendo o que so a producao vai dizer.
//
// ============================================================================
// AS CREDENCIAIS SAO PUBLICAS, e por isso estao aqui em claro
//
// Nao ha violacao da regra 5 nesta linha. O `client_id` e o Bearer do sandbox
// sao os mesmos para todo mundo, estao na colecao Postman publicada pela propria
// Sicoob e nao dao acesso a dado de ninguem - o mock responde o mesmo exemplo
// para qualquer chamador. Segredo por tenant continua no cofre; isto e fixture.

import { CobrancaSicoob, SICOOB, ErroDaSicoob, transporteHttps } from '../src/sicoob/http.ts';
import { cofreFixo } from '../src/sicoob/cofre.ts';

const CLIENT_ID_SANDBOX = '9b5e603e428cc477a2841e2683c92d21';
const TOKEN_SANDBOX = '1301865f-c6bc-38f3-9f49-666dbcfc59c3';
/** Os numeros de fixture do proprio sandbox - vem no exemplo da resposta dele. */
const IDENTIDADE = { numeroCliente: 25546454, codigoModalidade: 1, numeroContratoCobranca: 1 };

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const cobranca = new CobrancaSicoob({
  resolver: cofreFixo({
    clientId: CLIENT_ID_SANDBOX,
    tokenFixo: TOKEN_SANDBOX,
    sandbox: true,
    identidade: IDENTIDADE,
  }),
  transporte: transporteHttps,
  baseUrl: SICOOB.sandbox,
});

console.log(`\n  ENSAIO SICOOB - ${SICOOB.sandbox}\n`);

// ------------------------------------------------------------------ consultar
try {
  const s = await cobranca.consultar('ref-sandbox', '1');
  chk('E1a', true, 'GET /boletos respondeu - endereco, TLS e cabecalhos do gateway estao certos');
  chk('E1b', s.situacao === 'em_aberto',
      `a situacao "Em Aberto" do exemplo virou o enum ${s.situacao}`);
  chk('E1c', s.valorLiquidadoCentavos === null && s.jurosCentavos === 0,
      'o que a API nao devolve continua vazio, em vez de virar zero afirmado');
} catch (e: any) {
  chk('E1a', false, `GET /boletos falhou: ${e?.message ?? e}`);
}

// --------------------------------------------------------------------- baixar
try {
  await cobranca.baixar('ref-sandbox', '1', 'ensaio - nao e baixa de verdade');
  chk('E2a', true, 'POST /boletos/{nn}/baixar devolveu 204 e o adaptador aceitou o corpo vazio');
} catch (e: any) {
  chk('E2a', false, `baixar falhou: ${e?.message ?? e}`);
}

// ------------------------------------------------------------------ registrar
let erro: any = null;
try {
  await cobranca.registrar({
    credencialRef: 'ref-sandbox',
    referencia: 'ensaio-0000-0000-0000-000000000001',
    valorCentavos: 113000,
    vencimento: new Date(Date.now() + 14 * 86_400_000),
    pagador: {
      nome: 'ENSAIO NAO E CLIENTE',
      documento: '98765432185',
      endereco: {
        logradouro: 'Rua do Ensaio', numero: '1', bairro: 'Centro',
        municipio: 'Anapolis', uf: 'GO', cep: '75000000',
      },
    },
    mensagens: ['ENSAIO tecnico - nenhum boleto real'],
  } as any);
  chk('E3a', false,
      'O SANDBOX ACEITOU O POST. Isso e NOVO: em 27/08/2026 ele devolvia 400 sempre. '
      + 'Se passou a validar, o caminho de sucesso virou exercitavel - reveja tests/sicoob-http.ts');
} catch (e: any) {
  erro = e;
  chk('E3a', e instanceof ErroDaSicoob && e.httpStatus === 400,
      `POST /boletos devolveu ${e?.httpStatus ?? '?'} - o mock estatico nao valida corpo, como medido`);
  chk('E3b', e?.status === 502,
      'e o adaptador traduziu para 502: quem falhou foi o outro lado, nao a fatura');
}

console.log(`
  O QUE ISTO SIGNIFICA
    transporte, TLS, cabecalhos e parsing: exercidos contra a Sicoob de verdade
    corpo do registro aceito pela API:     NAO exercido - so producao dira
    ${erro ? `resposta do POST: ${String(erro.message).slice(0, 90)}` : ''}
`);

console.log(falhas === 0 ? 'ENSAIO OK\n' : `${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
