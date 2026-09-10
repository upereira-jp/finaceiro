// O `apt-get update` DO CI, prendido no lugar. Sem banco.
// Uso: node --experimental-strip-types tests/ci-apt.ts
//
// POR QUE ESTA SUITE EXISTE, e o defeito que ela prende ja aconteceu.
//
// Em 09/09/2026 o push do `cf9164d` derrubou QUATRO dos cinco jobs do
// `isolamento`, todos no mesmo passo e antes de uma linha nossa rodar:
//
//     E: Failed to fetch https://dl.google.com/linux/chrome-stable/.../Packages.gz
//        Hash Sum mismatch
//
// O indice quebrado era o do Google Chrome, que nao e nosso e vem na imagem do
// runner. `apt-get update` sem argumento atualiza TODAS as fontes configuradas.
// O conserto esta em `.github/instalar-psql.sh`: lista de PERMISSAO.
//
// E ELA VERIFICA A FORMA, NAO O COMPORTAMENTO, e vale dizer com todas as letras:
// nada aqui roda `apt`. O que estas linhas garantem e que ninguem reintroduz o
// `apt-get update` cru num sexto lugar - que foi exatamente como o defeito
// nasceu, copiado seis vezes em dois workflows. Verificacao que le fonte se
// confere POR MUTACAO: reintroduza o comando e as linhas ficam vermelhas.
//
// O CI E O UNICO LUGAR DO MUNDO onde `test:repos`, `test:isolamento`,
// `test:middleware` e `test:sessao` executam - a VPS nao tem PostgreSQL local.
// Um passo de `apt` fragil nao e incomodo de rodape: e a suite inteira de
// isolamento parando de rodar, com o painel dizendo vermelho por outro motivo.

import { readFileSync, readdirSync } from 'node:fs';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const raiz = new URL('../', import.meta.url);
const dirWorkflows = new URL('.github/workflows/', raiz);
/* COMENTARIO DE YAML SAI ANTES DE PROCURAR, e nao e detalhe: os proprios
 * comentarios que explicam o conserto CITAM `apt-get update` para dizer por que
 * ele nao esta mais ali. Procurando no texto cru, a explicacao do conserto
 * reprovava o conserto - foi o que esta suite fez na primeira execucao. O que se
 * verifica e o que RODA; so linha inteira de comentario sai, porque um `#` no
 * meio de um `run:` e argumento de comando, nao comentario. */
const semComentario = (t: string) =>
  t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

const workflows = readdirSync(dirWorkflows)
  .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
  .map((n) => {
    const texto = readFileSync(new URL(n, dirWorkflows), 'utf8');
    return { nome: n, texto, roda: semComentario(texto) };
  });
const script = readFileSync(new URL('.github/instalar-psql.sh', raiz), 'utf8');

console.log(`\n-- fontes apt do CI (${workflows.length} workflows) --`);

// ------------------------------------------------- CI-1 nenhum update cru
{
  const culpados = workflows
    .filter((w) => /apt-get\s+update/.test(w.roda))
    .map((w) => w.nome);
  chk('CI-1', culpados.length === 0,
      'nenhum workflow roda `apt-get update` direto - ele mora so em '
      + `.github/instalar-psql.sh, com a lista de permissao${culpados.length ? ` (achado em: ${culpados.join(', ')})` : ''}`);
}

// ---------------------------------------- CI-2 quem quer psql chama o script
{
  /* POR ARQUIVO NAO BASTA, e a primeira versao disto errou assim: um workflow que
   * chama o script num passo e instala psql na unha no seguinte tem as duas
   * marcas, e passaria. O nome do pacote mora no script agora, entao a condicao
   * e a mais estrita possivel - nenhum workflow o menciona. */
  const semScript = workflows.filter((w) => /postgresql-client/.test(w.roda)).map((w) => w.nome);
  chk('CI-2', semScript.length === 0,
      'o nome do pacote nao aparece em workflow nenhum - quem quer psql passa pelo script'
      + `${semScript.length ? ` (achado em: ${semScript.join(', ')})` : ''}`);

  const usam = workflows.filter((w) => /instalar-psql\.sh/.test(w.roda));
  chk('CI-3', usam.length >= 2,
      `os workflows que precisam de psql chamam o script (${usam.length}: `
      + `${usam.map((w) => w.nome).join(', ')})`);
}

// --------------------------------- CI-4 o script restringe de verdade o update
{
  const restringe = /Dir::Etc::sourceparts=/.test(script) && /Dir::Etc::sourcelist=/.test(script);
  chk('CI-4', restringe,
      'o `apt-get update` do script aponta `Dir::Etc::sourceparts` para a lista de permissao - '
      + 'sem isso ele volta a atualizar as fontes de terceiro da imagem do runner');

  /* SEM ISTO O CONSERTO TROCA UMA FRAGILIDADE POR OUTRA: um update restrito com
   * `List-Cleanup` ligado APAGA os indices em cache de tudo o que ficou de fora,
   * e o proximo `apt-get install` de qualquer outra coisa fica sem indice. */
  chk('CI-5', /APT::Get::List-Cleanup=0/.test(script),
      'e ele nao apaga os indices em cache das fontes que ficaram de fora '
      + '(`APT::Get::List-Cleanup=0`)');
}

// ------------------------------------------- CI-6 o pgdg entra na permissao
{
  /* O CHECK E SOBRE O CASAMENTO, E NAO SOBRE O LITERAL. A primeira versao disto
   * procurava a string `-name 'pgdg.list'` e ficou vermelha assim que os padroes
   * viraram curinga - reprovando uma mudanca que so ampliava a lista. O que
   * importa e que o arquivo que o script ESCREVE seja alcancado por algum dos
   * padroes que ele PROCURA, e e isso que esta medido aqui. */
  const escrito = script.match(/> \/etc\/apt\/sources\.list\.d\/([\w.-]+)/)?.[1] ?? '';
  const padroes = [...script.matchAll(/-name '([^']+)'/g)].map((m) => m[1]!);
  const casa = (padrao: string, nome: string) =>
    new RegExp(`^${padrao.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
      .test(nome);

  chk('CI-6', escrito !== '' && padroes.some((p) => casa(p, escrito)),
      `a fonte que o script escreve (${escrito || '(nenhuma)'}) e alcancada por um dos padroes da `
      + `lista de permissao (${padroes.join(', ')}) - fora dela o cliente 16 nunca resolveria, e o `
      + 'job das migrations morreria com 404 em vez de instalar');
}

// --------------------------------------- CI-7 o passo prova o que instalou
{
  chk('CI-7', /^psql --version$/m.test(script),
      'o script termina provando com `psql --version` - um install que resolvesse para outra '
      + 'versao passaria verde e quebraria no `\\gset` do SQL, tres passos adiante');
}

// ------------------ CI-8 o filtro de push alcanca TUDO o que os jobs executam
{
  /*
   * O FILTRO E UMA LISTA DE PERMISSAO TAMBEM, e ela ja falhou DUAS vezes em
   * 09/09/2026 pelo mesmo motivo: uma pasta que o CI executa e que o filtro nao
   * menciona vira codigo sem rede. `.github/` foi a primeira (o script do psql
   * e passo dos cinco jobs e nao mora em `workflows/`); `web/` foi a segunda, e
   * essa faltava desde sempre - o job `tipos` roda `test:web` e `tsc -p web`, e
   * um commit so de tela nao disparava nada.
   *
   * O sintoma das duas e o mesmo e e o pior possivel: nao ha vermelho, nao ha
   * verde, nao ha run. O painel fica com o resultado do commit ANTERIOR, e quem
   * olhar le como aprovacao.
   */
  const iso = workflows.find((w) => w.nome === 'isolamento.yml')!;
  const bloco = iso.roda.slice(iso.roda.indexOf('paths:'), iso.roda.indexOf('pull_request:'));
  const cobre = (dir: string) => bloco.includes(`'${dir}/**'`);
  const faltando = ['src/**', 'tests/**', 'web/**', 'prisma/**', 'package.json', '.github/**']
    .filter((p) => !bloco.includes(`'${p}'`));

  chk('CI-8', faltando.length === 0,
      'o filtro de `push` do isolamento cobre TODA pasta que os jobs executam - `web/**` e '
      + '`.github/**` inclusive, e os dois ja faltaram'
      + `${faltando.length ? ` (fora do filtro: ${faltando.join(', ')})` : ''}`);

  /*
   * ⚠️ CI-9 - A LISTA ACIMA E ESCRITA A MAO, E ESSE E O PROXIMO BURACO.
   *
   * As duas faltas de 09/09 foram descobertas por acidente, e a linha que as
   * prendeu prende exatamente as duas. Uma pasta NOVA que uma suite passe a ler
   * amanha nao esta em lista nenhuma - e o sintoma continua sendo o pior de
   * todos: nao ha vermelho, nao ha verde, nao ha run, e o painel mostra o
   * resultado do commit anterior.
   *
   * ENTAO A LISTA E DERIVADA. Toda suite que le arquivo de FONTE o faz por
   * `new URL('../<pasta>/...')`, e e isso que esta varredura procura. Em
   * 10/09/2026, quando `AG11k` passou a conferir o `OnCalendar` dos tres timers
   * contra a `CADENCIA` do dominio, ela acusou de imediato: `deploy/**` nao
   * estava no filtro, e `scripts/**` tambem nao - mudar um timer sem mudar o
   * alarme nao dispararia CI nenhum, que e o unico commit em que aquela
   * verificacao importa.
   *
   * `node_modules` sai porque e artefato: `web/tests/previa.ts` ESCREVE nele.
   */
  const suites = [
    ...readdirSync(new URL('tests/', raiz)).filter((n) => n.endsWith('.ts'))
      .map((n) => ({ texto: readFileSync(new URL(`tests/${n}`, raiz), 'utf8'), base: '' })),
    ...readdirSync(new URL('web/tests/', raiz)).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'))
      .map((n) => ({ texto: readFileSync(new URL(`web/tests/${n}`, raiz), 'utf8'), base: 'web/' })),
  ];

  const lidas = new Set<string>();
  for (const { texto, base } of suites) {
    for (const m of texto.matchAll(/new URL\('\.\.(\/\.\.)?\/([a-zA-Z0-9_.-]+)\//g)) {
      const dir = m[1] ? m[2]! : `${base}${m[2]}`;   // `../../x` sobe ate a raiz
      if (dir !== 'node_modules' && dir !== 'web/node_modules') lidas.add(dir);
    }
  }

  const semRede = [...lidas].filter((d) => !cobre(d) && !cobre(d.split('/')[0]!)).sort();
  chk('CI-9', lidas.size >= 3 && semRede.length === 0,
      `as ${lidas.size} pastas que as suites LEEM como fonte (${[...lidas].sort().join(', ')}) estao `
      + 'todas no filtro de push - a lista e derivada da varredura e nao escrita a mao, entao a '
      + 'pasta que uma suite passar a ler amanha ja nasce coberta'
      + `${semRede.length ? ` - FORA DO FILTRO: ${semRede.join(', ')}` : ''}`);
}

console.log(`\n${falhas === 0 ? 'ci-apt: todas as verificacoes passaram'
                              : `ci-apt: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
