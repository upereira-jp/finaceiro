# PLANO — o que falta para a operação não precisar de desenvolvedor

| Campo | Valor |
|---|---|
| **Para quem** | O dono, para decidir **o que mandar construir** e o que aceitar como permanente |
| **Data** | 09/09/2026 |
| **A pergunta** | *"as pendências para que o desenvolvedor não seja mais necessário em hipótese alguma"* |
| **Método** | Levantado do código e do registro, não de memória: rotas de escrita do `src/http/rotas.ts`, os 16 scripts operacionais do `package.json`, os 6 workflows do Actions, as 12 telas da barra, e as questões abertas do `QUESTOES.md` |

---

## A resposta curta, e ela tem duas metades

**A metade boa, e é maior do que parece:** quase todo o cadastro **já tem tela**.
Cliente, unidade consumidora (com tarifa, dia de vencimento **e endereço do
pagador**), contrato com ativar/suspender/encerrar, usina com geração e repasse,
dono de usina, originador, chave Pix, conta a pagar, faturamento do mês inteiro
(compor, ensaiar, emitir), boleto, baixa manual e conferência — tudo isso é
`POST`/`PATCH` que a tela já chama. **Os 16 scripts de terminal são atalho de
carga em lote, não o único caminho.** Migration, deploy e provisionamento de
usuário de serviço já saíram do terminal e viraram **botão no GitHub Actions**.

⚠️ **Correção de 09/09, à noite:** este documento nasceu dizendo que o **A3
estava aberto**, e ele já estava feito — eu confiei numa anotação em vez de rodar
o `npm run origem-webhook`, que responde em segundos. Corrigido no item. Sobra
**um** item de código, e ele também foi construído na mesma noite: o **A1**.

**A metade honesta:** *"em hipótese alguma"* não é alcançável, e vale dizer por
quê em uma linha — **o Sicoob muda o contrato da API sem perguntar** (aconteceu
três vezes só em agosto/setembro), dependência ganha falha de segurança, e o
certificado A1 vence todo ano com um processo que muda. O alvo realista, e ele é
bem diferente, é: **nenhuma operação de ROTINA precisa de desenvolvedor, e as
exceções são raras, nomeadas e previsíveis.** Este documento lista o que falta
para chegar lá.

---

## Bloco A — as três coisas que a operação NÃO consegue fazer sozinha hoje

São só três, e as três são do caminho do dinheiro. É por isso que são o topo da
lista.

### A1 · Recadastrar o aviso de pagamento — ✅ **CONSTRUÍDO em 09/09/2026**

**Antes:** `npm run webhook-sicoob -- --cadastrar` no terminal, como root. Sem
rota e sem tela.

**Agora:** botão **«Religar o aviso»** dentro da própria faixa que acusa o
problema, na tela de Cobrança — com a guarda no servidor (`podeReligarOAviso`),
porque `POST /webhooks` não tem inverso e dois webhooks fazem o banco notificar
em dobro. Só aparece nos dois níveis em que religar é seguro. Detalhe e as nove
decisões em `QUESTOES.md` §2.i.

⚠️ **Não foi exercido contra a Sicoob de verdade** — exercer exige um webhook
morto, e o de produção está vivo. O caminho de escrita é o mesmo que registrou o
id 13407.

**Por que é a primeira da lista:** o alarme que subiu hoje aponta exatamente para
isto. Quando a Sicoob desligar o aviso, a faixa em Pendências vai dizer
*«Recadastrar o aviso é trabalho de quem administra o servidor»* — ou seja, **o
sistema detecta sozinho e depois manda chamar alguém.** Metade do problema
resolvido.

**O que falta construir:** um botão «Religar o aviso de pagamento» na tela de
Cobrança, sobre uma rota nova, com a mesma guarda que o script já tem (consulta
antes, recusa duplicata). Existe também `PATCH /webhooks/{id}/reativar` no
contrato do banco, **nunca escrito** — vale medir qual dos dois caminhos o banco
aceita.

⚠️ **Cuidado que precisa entrar junto, e é decisão sua:** religar sozinho, sem
humano, é laço — a Sicoob desliga porque **o nosso** lado falhou; religar sem
saber por quê faz desligar de novo. O botão dá o controle a quem opera **sem**
automatizar o laço.

### A2 · Renovar o certificado A1 🟡 — com data marcada: **17/08/2027**

**Hoje:** `npm run certificado -- normalizar` e subir ao cofre, no terminal.
Não há tela.

**Por que ele tem data:** o A1 vence em 17/08/2027, e a unidade nova começa a
avisar **30 dias antes**. Se nada mudar até lá, o aviso vai chegar e a ação vai
exigir desenvolvedor.

⚠️ E ele tem uma armadilha medida que volta a valer: AC brasileira entrega `.pfx`
com cifragem antiga que o **Node recusa e o `openssl` aceita sem reclamar** — por
isso o passo `normalizar` existe. Uma tela de upload precisa fazer isso por dentro,
ou a renovação falha com um erro que não diz o que é.

### A3 · As duas linhas do `/etc/financeiro.env` — ✅ **JÁ ESTAVA FEITO**

⚠️ **Erro meu, e a correção importa mais que o item.** Publiquei este plano
dizendo que o A3 estava *"aberto agora"*. **Não estava.** Eu li a anotação de
09/09 que dizia *"a produção hoje recusaria 9 de 9"* e não medi de novo — e a
medição estava a um comando de distância, com ferramenta que existe justamente
para isso:

```
npm run origem-webhook
→ lista .................. 9 entrada(s), de WEBHOOK_IPS (ambiente)
  WEBHOOK_MTLS_VIA_PROXY . 1 (o X-Real-IP do nginx e conferido)
  os 9 blocos PASSAM · os 4 controles negativos RECUSAM
  VEREDITO: ACEITA as notificacoes da Sicoob e recusa o resto.   EXIT=0
```

E havia uma segunda prova no journal, ainda mais direta: **uma notificação real
da Sicoob chegou em 09/09 às 22h**, foi aceita pela guarda de origem e ignorada
por conter um `nosso_numero` que não é nosso. Se as duas linhas faltassem, ela
teria sido recusada antes disso.

**A lição, e ela é do projeto e não deste item:** anotação envelhece, e a deste
envelheceu **no mesmo dia** — o webhook foi ligado às 15:18, o que só é possível
com as duas linhas no lugar. Quando existe comando que mede, medir custa menos
que confiar.

O texto original do item fica abaixo, porque explica *por que* as duas linhas
importam — e a segunda continua sendo a que se esquece.

---

#### (registro) o que o item dizia

```
WEBHOOK_IPS="177.53.249.0/24,…"        (9 blocos)
WEBHOOK_MTLS_VIA_PROXY="1"
```

**Hoje:** só um shell root escreve esse arquivo. Não há tela e não deve haver —
é segredo de plataforma.

⚠️ **A segunda linha é a que se esquece, e sem ela a primeira não vale nada:**
com as nove faixas certas e a flag ausente, **100% das notificações são recusadas
em silêncio**, atrás de um 404 genérico. Confere-se com `npm run origem-webhook`.

**O que falta:** não é tela — é **fazer**. É configuração de uma vez, e depois
some da lista para sempre.

---

## Bloco B — o que já saiu do terminal, e serve de modelo

Registrado porque é a prova de que o caminho funciona, e porque a mesma forma
resolve o Bloco A.

| Antes | Hoje |
|---|---|
| `psql` com a `DIRECT_URL` de dono, à mão | workflow **`migrate-financeiro`**, com guarda de identidade do banco |
| `git pull` + `npm run build` + `systemctl restart` | workflow **`deploy-financeiro`** |
| `INSERT` do usuário de serviço no `psql` | workflow **`provisionar-cobranca`**, que deriva o id, confere o banco e roda o ensaio antes de gravar |
| gravar o `client_id` no cofre por Codespace | workflow **`cofre-sicoob`** |
| `npm run enderecos` para o endereço do pagador | **coluna editável na aba Unidades**, uma UC por vez |

**A forma que se repete:** o que é perigoso vira **workflow com confirmação
digitada**; o que é rotina vira **tela**. Nada disso é novo — é o que o Bloco A
ainda não recebeu.

---

## Bloco C — os atalhos de terminal que sobram, e nenhum é bloqueio

Existem 16 scripts operacionais. Onze deles são **carga em lote de coisa que a
tela já faz uma a uma**, e por isso não são pendência: são conveniência para
quem tem 29 linhas para digitar.

| Script | A tela faz? | Quando se usa |
|---|:--:|---|
| `tarifas` · `vencimentos` · `documentos` · `contratos` · `enderecos` | ✅ sim, um a um | carga inicial |
| `usinas` · `originadores` · `repasse` · `identidade` | ✅ sim | cadastro inicial, já feito |
| `faturar` | ✅ sim, a tela inteira | mensal — **a tela é o caminho** |
| `destravar-uc` | ❌ não | exceção rara (troca de titularidade no CRM) |
| `servico-de-cobranca` | — | virou o workflow `provisionar-cobranca` |
| `escopos` · `origem-webhook` · `ensaio-*` | ❌ não | **diagnóstico** — só se usa quando algo quebrou |
| `certificado` · `webhook-sicoob` | ❌ **não** | **são o Bloco A** |

**Só um merece virar tela por conta própria:** o `destravar-uc`. Os de diagnóstico
não — quem os roda já é quem conserta.

---

## Bloco D — o que exige decisão sua, e nenhum é código

Estes não são pendência de desenvolvedor: **nenhum deles é destravado
escrevendo código.** Estão aqui para a lista ficar completa.

| # | O quê | Efeito de não decidir |
|:--:|---|---|
| 1 | **As quatro vermelhas do contador** (retenção sobre comissão PF, escrituração sem documento fiscal, crédito de IBS/CBS, comissão a sócia) | Voltam a ser bloqueio na F2. A reunião nunca aconteceu |
| 2 | **`dono_usina`** — tabela vazia, e o CRM também não sabe. 70% do dinheiro tem percentual e **nenhum destinatário** | Não impede faturar nem emitir; **trava o split na primeira fatura paga** |
| 3 | **O tipo do originador do Rhenan** ("Out Sales") | 1 contrato dos 29 não ativa. Muda a alíquota, que a regra congela no rascunho |
| 4 | **Os 10 endereços** que você disse não conseguir identificar | 10 das 29 não emitem boleto |
| 5 | **`Q-ALERTA-EMAIL-01`** — o canal que empurra | Sem ele, o alerta espera alguém abrir a tela. Pior caso: cai sexta, ninguém vê até segunda |
| 6 | **`Q-VENC3-01` (b)** — a borda do vencimento | Um caso de canto do cálculo de data |
| 7 | **A conta lida da competência + a geração** | ⚠️ **É isto que trava a primeira fatura**, e não tem nada a ver com nada acima |

---

## Bloco E — o que nunca deixa de precisar de alguém técnico

Dito sem rodeio, porque planejar sem isto é planejar errado.

1. **O Sicoob muda o contrato da API sem avisar.** Aconteceu três vezes em seis
   semanas: o `codigoSituacao` voltou `2` onde o exemplo dizia `3`; o mTLS do
   webhook caiu; o cadastro que "era no portal" era por API. Cada uma dessas
   exigiu leitura e código.
2. **Falha de segurança em dependência.** Node, Prisma, React. Não avisa e não
   espera.
3. **O banco de dados evolui.** Coluna nova é migration, e migration é código —
   embora aplicá-la já seja botão.
4. **O CI depende de imagem de terceiro.** Consertado hoje o caso do Google
   Chrome; o próximo terá outro nome.

**O que fazer a respeito, e é decisão de negócio e não de engenharia:** manter um
**contrato de manutenção pequeno** — algumas horas por mês, reativo — em vez de
depender de achar alguém às pressas no dia em que a emissão parar. O sistema está
escrito para isso: tudo tem comentário dizendo *por quê*, há **2.728 verificações
automáticas** e cinco jobs de CI, e as retomadas contam a história. Um técnico
novo entra lendo, não perguntando.

---

## A ordem que eu recomendo

| Ordem | O quê | Por quê nessa ordem |
|:--:|---|---|
| ~~1~~ | ~~**A1** — botão de religar~~ | ✅ **feito em 09/09** |
| ~~1~~ | ~~**A3** — as duas linhas do `.env`~~ | ✅ **já estava feito** — medido com `npm run origem-webhook`, veredito `ACEITA` |
| **1** | **Bloco D itens 7, 2 e 4** | São o que trava a **primeira fatura** e o **primeiro repasse**. Nada disso é código |
| **4** | **A2** — tela do certificado | Tem prazo (17/08/2027) e não tem pressa |
| **5** | **D5** — o canal que empurra | Decidir se vale contratar um serviço de e-mail |
| **6** | `destravar-uc` na tela | Exceção rara; só quando o resto estiver fechado |

**Custo dos três de código (A1, A2, `destravar-uc`):** são telas pequenas sobre
lógica que **já existe e já está testada** — o trabalho é a rota e o formulário,
não a regra.

---

**Fontes:** `QUESTOES.md` (registro com dono por entrada) · `PENDENCIAS.md`
(índice vivo) · `RETOMADA-2026-09-09-noite3.md` (onde tudo parou) ·
`deploy/README.md` (o que roda na máquina).
