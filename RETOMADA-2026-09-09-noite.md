# RETOMADA — Financeiro G3, 09/09/2026 (noite)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Dois minutos** |
| **Substitui** | `RETOMADA-2026-09-09.md` para efeito de "onde estamos". O corpo dela continua correto; o que venceu é o **§0** — as três pendências foram postas ao dono e as três voltaram com resposta |
| **O que esta leva fez** | Fechou as três decisões do §0 anterior. Uma virou código (**o calendário bancário**), uma virou registro (**D+1**), uma foi adiada com o custo medido (**`dono_usina`**). E o portão do webhook que era `psql` a mão virou workflow |
| **Suíte** | sem banco: `EXIT=0`, **2.637** verificações (eram 2.619) |
| **Repositório** | commit local pronto. ⚠️ **`git push` daqui é bloqueado pelo classificador** — o comando está no §5 |
| **Produção** | serviço de 09/09 12:37 em `333ffa2`. **Passa a haver deriva** assim que o commit desta leva subir: o §5 tem a ordem |

> ## A frase de uma linha
>
> **A regra "3 dias antes" nunca disse o que fazer no domingo, e a resposta do dono
> foi «antecipar até o dia útil anterior» — que é a única das duas que respeita a
> própria regra, porque empurrar deixaria o boleto a 1 dia da conta da Equatorial,
> exatamente o aperto que os 3 dias existem para evitar.**

---

## 0. O primeiro movimento da próxima sessão

1. **Fazer o `git push` e o deploy** — §5. Nada mais desta leva depende de decisão;
2. **`Q-VENC3-01` (b)** é a borda que sobrou, e ela **piorou dois dias** com a (a):
   pelo caminho do cadastro, dia 1º com competência de junho agora vence **26/06** e
   não 28/06, porque 28/06 é domingo. Continua estreita (só quando a conta lida não
   traz data) e continua com o dono;
3. **`dono_usina` foi adiada, não resolvida.** Não bloqueia faturar nem emitir boleto;
   bloqueia o split na primeira fatura paga. O que falta é dado que só existe fora do
   sistema — nome, PF/PJ, documento e chave Pix das 4 usinas.

---

## 1. O calendário bancário — a decisão que virou código

**A pergunta estava aberta desde 07/09** e era a única das duas bordas da
`Q-VENC3-01` que atinge a carteira inteira. A resposta do dono, em 09/09:
*"antecipar até o dia útil anterior"*.

**A ordem das duas operações é o que importa, e ela não é comutativa:** subtrai-se
os 3 dias corridos primeiro, recua-se depois. Recuar antes deslocaria o ponto de
partida, e a conta dos 3 dias passaria a ser feita contra uma data que a
distribuidora nunca imprimiu.

### As três decisões técnicas dentro dela

Todas tomadas aqui, pela delegação de 08/09, e todas registradas em `QUESTOES.md`
§2.f em vez de escondidas no código:

| Decisão | Por quê, em uma linha |
|---|---|
| **O calendário é NACIONAL** | Quem liquida boleto é o SPB/STR, que roda no calendário nacional. Feriado municipal fecha a agência e não para a compensação — entraria como falso positivo |
| **Quarta-feira de Cinzas NÃO é feriado** | O banco abre ao meio-dia e o título que vence nela é pago nela. É a pegadinha da lista |
| **24/12 e 31/12 são dia útil** | São ponto facultativo de *atendimento*, não feriado. Tratá-los como não-útil anteciparia todo fim de ano sem que ninguém estivesse impedido de pagar |

**A Páscoa é uma função e não uma tabela**, e essa também é decisão: uma lista de
datas coladas venceria em silêncio. No ano seguinte ao último que alguém digitou, o
Carnaval simplesmente deixaria de ser feriado, e nenhum teste saberia.

### O que prova que funciona

`tests/calendario-bancario.ts`, **16 verificações**. As oito Páscoas conferidas
contra datas verificáveis fora deste repositório incluem **2038, a mais tardia que
o calendário gregoriano admite** (25/04). E a varredura de **40 anos** — cerca de
14.600 datas — prende as três invariantes que exemplo escolhido a mão não prova:

- o recuo **sempre** termina num dia útil bancário;
- e **nunca empurra para frente** (a regra do dono é "antes", não "perto");
- e nunca recua mais de 4 dias, que é o pior caso real do calendário nacional.

### Onde ela chegou, e por que tinha de chegar aos dois lugares juntos

`anteciparVencimento` é o único ponto que subtrai, então a mudança alcançou de uma
vez o **boleto** (`vencimentoEscolhido`), o **caminho em lote** (`triar()`) e a
**folha que o cliente recebe** (`nossoVencimento`). Se só o boleto recuasse,
`conferirBoleto` compararia os 44 dígitos contra a data impressa e **acusaria
divergência em toda fatura de borda** — uma acusação que o próprio sistema
fabricaria. O `V4b` prende isso.

**A tela também mudou**, porque a regra é da operação e não do código: a ajuda de
`/unidades`, o «por quê» do campo e o rodapé da aba agora dizem que os três dias
recuam até o dia útil anterior — *nunca* para o seguinte, que encurtaria a folga.

⚠️ **A (a) piorou a (b), e isso está registrado e não escondido.** O exemplo que o
`J4j` prendia — dia 1º pelo cadastro, competência de junho — dava 28/06 e agora dá
**26/06**, porque 28/06 é domingo. Mais fundo dentro da competência. O teste foi
atualizado e continua dizendo que aquele é o comportamento de hoje, sem afirmar que
está certo.

---

## 2. O prazo de crédito é D+1 — e a decisão inclui não escrever código

O dono escolheu seguir com o **padrão da cooperativa** em vez de segurar o assunto
(`D+0`, `D+1` ou `D+2`, ajustável no contrato de cobrança — resposta do Sicoob em
08/09).

**Onde ele NÃO entrou, e não entrar é a decisão:** não virou constante nem coluna,
porque **nada consome o número hoje**. O repasse não espera D+1 — ele espera a
*confirmação* do banco, que é fato observado e não prazo projetado. Uma constante
sem consumidor seria uma segunda fonte de verdade esperando divergir da primeira.
Ela entra quando existir projeção de caixa, e o lugar dela já tem nome.

---

## 3. `dono_usina` foi adiada — o que isso custa, medido

Não é estimativa: **não bloqueia faturar e não bloqueia emitir boleto**. Bloqueia o
**split**, e só quando a primeira fatura for paga.

Enquanto isso, o sistema já não deixa a espera invisível — e isso não é novo desta
leva, é o que torna o adiamento defensável:

- `triarRegistro` emite o alerta `usina_sem_dono` em **toda** fatura da usina;
- a camada `dono_da_usina` da prontidão mede **4 de 4** com efeito `bloqueia_split`;
- a fila de repasse pendente tem tela desde 08/09, e ela **separa** *"sem dono"*
  (trabalho de alguém) de *"aguardando o banco"* (trabalho de ninguém).

**Não falta código:** `/donos` cadastra e `/usinas` vincula. Falta o dado, e ele só
existe fora do sistema — o CRM traz `dono_lead_nome` NULL nas quatro.

---

## 4. O portão do webhook virou botão

A `RETOMADA-2026-09-09` §1 nomeou dois portões que *"não têm como ser medidos desta
sessão"*. O primeiro deixou de exigir terminal.

**`provisionar-cobranca`** (workflow novo, molde do `migrate-financeiro`): a
credencial não desce para a VPS, o `auth_user_id` é **derivado por UUIDv5 e nunca
digitado**, a identidade do banco alvo é conferida antes de qualquer escrita, o
**ensaio roda sempre** — inclusive quando se pediu para valer, porque ele custa um
segundo e é o que mostra o que seria feito — e o job **fica vermelho** se o papel
gravado não for `cobranca`, que é o mínimo que faz `escrever_carteira` passar.

Sem isso, a rota do webhook responde `503 ServicoDeCobrancaNaoProvisionado`: a
notificação chega e não há quem assine a trilha da baixa.

**O segundo portão continua humano e não tem automação possível** — a URL no Portal
Developers, cujas páginas são SPA. O resumo do run a imprime pronta:

```
https://financeiro.blackhaus.io/api/liquidacoes/webhook-sicoob/eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d
```

---

## 5. O que falta fazer, e é operação — não decisão

**1. O push** (bloqueado daqui pelo classificador):

```
cd /opt/financeiro/app && git push origin main
```

**2. O deploy** — workflow `deploy-financeiro`. Ele faz `git ff` + `web:build` +
restart, e a tela mudou nesta leva, então o build importa.

**3. Quando quiser ligar o webhook de ponta a ponta** — workflow
`provisionar-cobranca`, primeiro com `confirmar = ensaio` (padrão) para ver o que
ele faria, depois com `confirmar = aplicar`. Só então cadastrar a URL acima no
Portal Developers.

---

## 6. O que entrou no repositório

| Arquivo | O quê |
|---|---|
| `src/dominio/calendario-bancario.ts` | **novo.** Páscoa por algoritmo (Meeus/Jones/Butcher, 1583–4099), os 12–13 feriados bancários nacionais do ano, `ehDiaUtilBancario` e `recuarParaDiaUtil`. Memorizado por ano |
| `src/dominio/faturamento.ts` | `anteciparVencimento` subtrai **e depois recua**. O recuo vale também com `dias = 0`: o vencimento do nosso título é sempre um dia útil, qualquer que seja o prazo |
| `tests/calendario-bancario.ts` | **novo.** `CAL1`…`CAL6`, 16 verificações, com a varredura de 40 anos |
| `tests/fatura-do-registro.ts` | `J4a`, `J4f` e `J4j` remedidos; **`J4k` novo** — os 336 vencimentos possíveis de 2026, nenhum em dia não-útil e nenhum empurrado |
| `tests/folha-unificada.ts` | `V4` remedido e **`V4b` novo**: a data da Equatorial continua impressa ao lado, intacta — o recuo é nosso, não dela |
| `web/src/ajuda.ts` · `web/src/porques.ts` · `web/src/telas/unidades.tsx` | a regra na tela de quem opera |
| `.github/workflows/provisionar-cobranca.yml` | **novo.** O §4 |
| `QUESTOES.md` §2.f · `PENDENCIAS.md` | o registro |

Onde parou é aqui; o índice vivo é `PENDENCIAS.md`; o registro com dono por entrada é
`QUESTOES.md`.
