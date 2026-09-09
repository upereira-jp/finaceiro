// OS IPs DE ONDE A SICOOB ENVIA A NOTIFICACAO DE WEBHOOK, como o suporte tecnico
// os entregou em 09/09/2026 pelo canal do desenvolvedor.
//
// ============================================================================
// ⚠️ ESTE ARQUIVO NAO AUTORIZA NINGUEM. Quem autoriza e `WEBHOOK_IPS`.
//
// A distincao e a coisa mais importante aqui, e apagar a fronteira seria
// desfazer a `ADR-0006` sem discuti-la: a lista efetiva e de PLATAFORMA e mora
// em variavel de ambiente, porque a topologia de quem hospeda pode mudar sem
// que o banco mude nada. `WEBHOOK_IPS` vazio recusa tudo, DE PROPOSITO, e este
// arquivo nao e o default dele - se fosse, um deploy sem configuracao passaria
// a aceitar chamada, que e exatamente o default permissivo que a ADR proibe.
//
// O QUE ELE E: o registro do que o TERCEIRO declarou, para que a configuracao
// possa ser CONFERIDA contra ele em vez de conferida contra a memoria de quem
// digitou. Quem confere e `npm run origem-webhook`.
// ============================================================================
//
// A PROCEDENCIA, porque daqui a um ano ninguem lembra de onde a lista veio:
// resposta do suporte tecnico da Cobranca Bancaria v3 em 09/09/2026, no mesmo
// canal que respondeu o mTLS em 08/09 (`adr/ADR-0006` §9). Veio como "Lista de
// IPs Expandidos por Bloco CIDR", declarando **9 blocos e 2078 hosts**, cada
// bloco com o primeiro e o ultimo endereco escritos por extenso.
//
// CONFERIDO NA CHEGADA, e as tres contas fecham: a soma dos hosts declarados da
// 2078; cada par (primeiro, ultimo) bate com a mascara declarada; e nenhum bloco
// tem aritmetica quebrada. O teste `SIC*` em `tests/rotas-auth.ts` refaz essa
// conta a cada suite, contra estes valores.
//
// ⚠️ UM ROTULO VEIO FORA DA FORMA NORMAL, e nao e erro do banco: o primeiro
// bloco chegou escrito `177.53.253.0/23`, com o intervalo
// `177.53.252.1 - 177.53.253.254`. Um /23 que contem 177.53.253.0 tem rede
// 177.53.252.0 - ou seja, o intervalo esta certo e o rotulo so nao estava
// normalizado. `ipCasa` aplica a mascara antes de comparar e casaria as duas
// formas identicamente; aqui fica a NORMALIZADA, porque quem le a lista
// depois compara com o intervalo, e `177.53.253.0/23` faz o leitor calcular.

/** Os 9 blocos, normalizados. Ordem crescente de endereco - a mesma em que o
 *  `origem-webhook` imprime, para que a conferencia visual seja linha a linha. */
export const IPS_DO_SICOOB = [
  '177.53.249.0/24',
  '177.53.250.0/23',
  '177.53.252.0/23',
  '177.53.254.0/23',
  '187.4.128.128/26',
  '187.72.5.128/25',
  '189.74.157.192/26',
  '200.186.0.96/27',
  '201.45.121.80/28',
] as const;

/** O que o banco declarou por escrito, para o teste conferir a nossa transcricao
 *  contra a mensagem dele - e nao contra si mesma. `hosts` e o numero que ELES
 *  imprimiram no cabecalho de cada bloco. */
export const BLOCOS_DECLARADOS: ReadonlyArray<{
  cidr: string; rotuloRecebido: string; primeiro: string; ultimo: string; hosts: number;
}> = [
  { cidr: '177.53.249.0/24',   rotuloRecebido: '177.53.249.0/24',   primeiro: '177.53.249.1',   ultimo: '177.53.249.254',   hosts: 254 },
  { cidr: '177.53.250.0/23',   rotuloRecebido: '177.53.250.0/23',   primeiro: '177.53.250.1',   ultimo: '177.53.251.254',   hosts: 510 },
  { cidr: '177.53.252.0/23',   rotuloRecebido: '177.53.253.0/23',   primeiro: '177.53.252.1',   ultimo: '177.53.253.254',   hosts: 510 },
  { cidr: '177.53.254.0/23',   rotuloRecebido: '177.53.254.0/23',   primeiro: '177.53.254.1',   ultimo: '177.53.255.254',   hosts: 510 },
  { cidr: '187.4.128.128/26',  rotuloRecebido: '187.4.128.128/26',  primeiro: '187.4.128.129',  ultimo: '187.4.128.190',    hosts: 62  },
  { cidr: '187.72.5.128/25',   rotuloRecebido: '187.72.5.128/25',   primeiro: '187.72.5.129',   ultimo: '187.72.5.254',     hosts: 126 },
  { cidr: '189.74.157.192/26', rotuloRecebido: '189.74.157.192/26', primeiro: '189.74.157.193', ultimo: '189.74.157.254',   hosts: 62  },
  { cidr: '200.186.0.96/27',   rotuloRecebido: '200.186.0.96/27',   primeiro: '200.186.0.97',   ultimo: '200.186.0.126',    hosts: 30  },
  { cidr: '201.45.121.80/28',  rotuloRecebido: '201.45.121.80/28',  primeiro: '201.45.121.81',  ultimo: '201.45.121.94',    hosts: 14  },
];

/** O total que o banco imprimiu no cabecalho da lista. */
export const HOSTS_DECLARADOS = 2078;

/** A linha pronta para `/etc/financeiro.env`. Existe como funcao, e nao como
 *  texto colado no `.env.example`, porque duas copias de uma lista de IPs
 *  divergem em silencio - e a divergencia aqui recusa notificacao de dinheiro. */
export const linhaDeAmbiente = (): string => `WEBHOOK_IPS="${IPS_DO_SICOOB.join(',')}"`;
