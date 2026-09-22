# REVISÃO — o Financeiro em dois funis (Rateio e Empresa)

| Campo | Valor |
|---|---|
| **Para quem** | O dono, e o analista financeiro que vai operar o sistema |
| **O que é** | A revisão pedida em 22/09/2026 (*"revisar e otimizar o sistema financeiro para uma empresa que vai escalar rápido em consórcio de energia solar, operado por um analista financeiro, organizado em dois funis"*), o que foi construído no mesmo dia, e o que falta — separando o que decido sozinho do que precisa de referência do dono |
| **Data** | 22/09/2026 |
| **Estado da suíte** | Sem banco: `typecheck` + `documento` + `brcode` + `web` + `dominio` → **EXIT=0**. Entraram **46 verificações** novas (`web/tests/receber.ts`), e a suíte da barra (`interface.ts`) passou de 12 para **13 telas**, agora por funil. O bundle da SPA fecha (`vite build` num diretório de rascunho, sem publicar) |
| **Deploy** | **Não feito daqui.** O servidor em produção ainda serve a barra antiga; o comando é do dono — ver §8 |

---

## 0. Em uma tela

**O pedido** era organizar o sistema como dois funis — **Financeiro Rateio** (o dinheiro que entra dos clientes) e **Financeiro Empresa** (o caixa da G3) — e deixá-lo o mais limpo possível para um analista financeiro.

**O que entrou hoje:**

1. **A navegação em dois funis.** O topo ganhou um seletor «Rateio | Empresa» ao lado da marca, e a barra de abas mostra só as telas do funil escolhido: 9 no Rateio, 4 na Empresa. Nenhuma rota mudou, nenhum rótulo mudou, nenhum favorito quebra. A ordem dentro do Rateio passou a ser a do mês (Fatura unificada antes de Emissão e cobrança).
2. **A tela «Contas a receber»**, primeira da Empresa e a ponte entre os dois funis: a carteira INTEIRA em aberto, por vencimento — quanto venceu e há quanto tempo (faixas de 30/60/90 dias), quem mais deve, se cada título tem boleto para ser pago, e quanto entrou nos últimos 30 dias. Até hoje isso só existia por mês, e a fatura antiga sumia atrás do mês corrente.
3. **A ajuda aprendeu os dois funis** e a tela nova; «Ver na emissão» abre Emissão e cobrança já no mês da fatura.

**O que precisa do dono antes de eu seguir** (referências, como pedido *"de antemão"*) — detalhado na §5:

| # | Item do pedido | O que preciso receber |
|:-:|---|---|
| 1 | Projeção de recebíveis | o **áudio** prometido |
| 2 | Controle das tarifas mínimas da Equatorial | **uma conta real** com o custo de disponibilidade, e a resposta de **quem paga** (G3 ou o cliente) e **onde isso é controlado hoje** |
| 3 | Conciliação bancária Sicoob | **um extrato OFX (ou CSV) de um mês real**, exportado do internet banking PJ; e se querem via API, o gerente precisa liberar o escopo de conta corrente |
| 4 | Inadimplência | a **régua de cobrança** que a G3 pratica (quando avisa, quando liga, quando corta o rateio) e por qual canal |

---

## 1. O retrato antes (medido em 22/09, lendo o código)

- **12 telas** numa barra única, separadas por uma divisória fina entre «cadastro» e «dinheiro». A ordem era a do trabalho de um mês, certa para quem já sabia o caminho — e misturava a pergunta do Rateio (*o que os clientes devem e por quê*) com a da Empresa (*como está o caixa*).
- **122 rotas**, 38 tabelas, 28.811 linhas de servidor e 13.246 de interface. O caminho do dinheiro (conta lida → fatura → boleto Sicoob → webhook → baixa → divisão → contas a pagar) está inteiro e medido em produção (webhook conferido em 10/09).
- **O lado Empresa era uma tela só** — Contas a pagar —, e a única leitura de recebíveis era por mês (`GET /faturamento/:competencia` e a view `posicao_da_carteira`). Do módulo corporativo do PRD §4.4, **4 das 13 entidades** existem (`conta_pagar`, `pagamento`, `categoria`, `centro_custo`); as 9 que faltam são fluxo de caixa, conta bancária, extrato/conciliação, cartão, fornecedor e compra.
- **Zero faturas em produção** até 21/09. Tudo o que se afirma sobre as telas de dinheiro foi medido com fixture e suíte, não com carteira viva.

---

## 2. Os dois funis — tela por tela

| Funil | Grupo | Tela (rótulo da barra, inalterado) | Rota | O que responde |
|---|---|---|---|---|
| **Rateio** | cadastro | Pendências | `/pendencias` | o que falta para o mês sair |
| | | Clientes | `/clientes` | quem paga |
| | | Unidades consumidoras | `/unidades` | onde a energia é consumida; fatia do rateio; tarifa |
| | | Contratos | `/contratos` | o vínculo cliente–unidade–usina, com originador |
| | | Usinas | `/usinas` | quem gera; geração do mês; regra de repasse |
| | | Donos de usina | `/donos` | quem recebe o repasse |
| | dinheiro | **Fatura unificada** | `/documento` | ler a conta da Equatorial, conferir, **gerar a cobrança**, imprimir |
| | | **Emissão e cobrança** | `/faturas` | emitir, pedir/importar boleto, dar baixa; os quatro números do mês |
| | | Relatórios | `/relatorios` | repasse por dono, comissão por originador, uso da usina |
| **Empresa** | dinheiro | **Contas a receber** ✨ | `/contas-a-receber` | a carteira inteira em aberto, por vencimento |
| | | Contas a pagar | `/contas-a-pagar` | o que a empresa deve (repasse, comissão, avulsas) e o que pagou |
| | apoio | Conector Sicoob | `/cobranca` | a credencial do banco, o A1, o aviso de pagamento |
| | | Histórico | `/historico` | quem fez o quê, quando |

**Três decisões de arquitetura tomadas sozinho** (delegação de 08/09), registradas aqui:

- **O funil é derivado do caminho, não guardado em estado.** O endereço já diz de que lado a pessoa está; um estado próprio seria um segundo lugar para a mesma verdade. Trocar de funil leva à primeira tela do outro lado (Pendências ↔ Contas a receber).
- **Relatórios ficou no Rateio.** Repasse e comissão são a *apuração* do rateio; o que a empresa *deve* por causa deles aparece na Empresa, em Contas a pagar, provisionado pela divisão do dinheiro. Duas telas para a mesma pergunta em dois funis fariam os números discordar.
- **Histórico e Conector Sicoob são «apoio» da Empresa.** Não são atos de caixa; são o que sustenta os atos. A barra da Empresa os separa com a mesma divisória fina que o Rateio usa entre cadastro e dinheiro.

**O que não mudou, de propósito:** rotas, rótulos e nomes de domínio. O roteiro do mês (`RM12`/`RM13`) exige que o nome no botão seja letra por letra o da barra, e a ajuda tem 48 tópicos apontando para rotas.

---

## 3. O que entrou hoje — arquivo por arquivo

| Camada | Arquivo | O que faz |
|---|---|---|
| navegação | `web/src/navegacao.ts` | `FUNIS`, `funil` em cada tela, `telasDoFunil`, `primeiraTelaDoFunil`, `funilDoCaminho`, `divisoriasDe`. Dado puro, com suíte |
| casca | `web/src/app.tsx` · `web/src/estilo.ts` | o seletor de funil (duas pílulas: a ativa é Orange sólido com texto Navy, o inverso da aba ativa — dois níveis, o de cima pesa mais) e a barra por funil |
| servidor | `src/repos/conta_receber.ts` · `src/http/rotas.ts` | `GET /contas-a-receber` pelo pool de relatório: resumo (em aberto, vencido, vence em 7/30 dias, recebido em 30 dias) em UMA consulta com `FILTER`, mais a lista dos 500 títulos mais antigos, com `total` para dizer quando truncou. Só leitura; **«vencido» é a data, não o status** — a mesma decisão da view `posicao_da_carteira` |
| regras | `web/src/receber-regras.ts` | faixas de atraso (30/60/90, «vence hoje» é a vencer), situação da cobrança em seis estados que a pessoa entende («sem boleto» e «boleto baixado» são títulos que o cliente NÃO TEM COMO pagar — cobrança que não saiu, não atraso), somas por faixa e por cliente, frase de truncagem |
| tela | `web/src/telas/contas-a-receber.tsx` | 4 cartões, «Por tempo de atraso» (clicável, filtra), «Quem mais deve» (por cliente, não por unidade), lista com filtros e CSV, «Ver na emissão» |
| ponte | `web/src/dinheiro.ts` · `web/src/telas/faturas.tsx` | `mesDaQuery`: `/faturas?mes=2026-08` abre Emissão e cobrança já no mês certo |
| ajuda | `web/src/ajuda.ts` | tópicos `dois-funis` e `contas-a-receber`; apelidos da tela nova («quem está devendo», «inadimplência», «vencidas») |
| ícones | `web/src/iconografia.ts` · `web/src/icones.tsx` | `contas_a_receber` (mão que recebe), par do `contas_a_pagar` (mão que entrega) |
| testes | `web/tests/receber.ts` (novo, 46) · `web/tests/interface.ts` | a barra agora é verificada por funil: funis contíguos e na ordem declarada, grupos contíguos dentro de cada funil, primeira tela de cada lado, funil derivado do caminho. O par «Contas a receber / Contas a pagar» é **exceção nominal** da regra do substantivo-cabeça, com o motivo escrito no teste |

**Nada de migration.** Tudo lê o que já existe. Os timers carregam a árvore de trabalho, então o servidor novo já está no disco; a SPA nova só entra com o deploy (§8).

---

## 4. Revisão item por item do pedido

Legenda: ✅ existe e está no lugar · ◐ existe em parte · ❌ não existe · ❓ precisa de referência do dono antes de desenhar

### Funil 1 — Financeiro Rateio

| Item do pedido | Estado | Onde está / o que falta |
|---|:-:|---|
| Usinas | ✅ | cadastro, geração do mês, regra de repasse versionada por vigência, uso da usina no relatório |
| Clientes | ✅ | espelho do CRM (só leitura, 10 views) + documento e endereço digitados aqui |
| Recebíveis dos clientes | ✅ | por mês em Emissão e cobrança; **a partir de hoje, a carteira inteira em Contas a receber** |
| Projeção de recebíveis | ❓ | **aguarda o áudio.** A base já existe: «vence em 7 dias» e «vence em 30 dias» no resumo, e contrato ativo × geração × tarifa é o cálculo do `ensaio`. Falta saber que projeção o dono quer: por vencimento (caixa) ou por competência futura (receita esperada dos contratos vigentes) — são telas diferentes |
| Geração de fatura | ✅ | Fatura unificada: leitura da conta em lote com fila de conferência, «conferir antes», «gerar cobrança», impressão |
| Emissão de boletos | ✅ | Sicoob Cobrança V3 (escopos `boletos_*` medidos), fila que nunca desiste, webhook conferido em produção, consulta ativa diária; boleto importado do portal como reserva |
| Controle de pagamentos das tarifas mínimas da Equatorial | ❓ | **não existe nada.** A fatura unificada lê o «não compensado + iluminação + bandeira» da conta do CLIENTE, mas não há registro de custo de disponibilidade por unidade, nem de quem o paga, nem se foi pago. Preciso de uma conta real e de duas respostas — ver §5 |
| Cobrança | ◐ | emitir, boleto, baixa manual e no banco existem; **não há régua** (aviso antes do vencimento, lembrete depois, segunda via automática) nem canal de envio ao cliente — a fatura sai por impressão/PDF |
| Inadimplência | ◐ | a **visão** existe (vencidas no mês; e agora faixas de atraso e devedores em Contas a receber); o **registro de tratativas** — quem foi contatado, quando, por onde, o que ficou combinado — não existe (`Q-INADIMPLENCIA-01`, aberta desde 30/07) |

### Funil 2 — Financeiro Empresa

| Item do pedido | Estado | Onde está / o que falta |
|---|:-:|---|
| Contas a pagar | ✅ | provisionadas pela divisão do dinheiro (repasse e comissão) + conta avulsa; pagamento parcial; resumo por beneficiário; sem provisão acusada |
| Conciliação bancária (Sicoob) | ❌ | **não existe.** Há uma rota de baixa «por conciliação» (`POST /liquidacoes/conciliacao`), por fatura, sem tela — declarada caminho de reserva. Não há importação de extrato, nem tabela `extrato_importado`/`conciliacao`, e **o escopo de conta corrente da API não está contratado** (só `boletos_*`). Ver §5 e §6 |
| Contas a receber (origem no funil 1) | ✅ | **entrou hoje** |
| Fluxo de caixa, conta bancária, livro-razão | ❌ | PRD §4.4: `conta_bancaria`, `movimento_caixa`, `cartao_credito`, `fatura_cartao`, `fornecedor`, `compra` — nenhuma existe. O `movimento_caixa` é **derivável** hoje (liquidações = entradas, pagamentos = saídas) sem migration; conta bancária múltipla e cartão não |

---

## 5. O que preciso do dono (referências) — e o que cada uma destrava

1. **Projeção de recebíveis — o áudio.** Sem ele não desenho: as duas leituras possíveis (por vencimento × por competência futura) dão telas diferentes, e escolher errado é jogar a tela fora.

2. **Tarifas mínimas da Equatorial.** Preciso de **(a)** uma conta real de uma unidade (ou da usina) onde apareça o custo de disponibilidade — a leitura de fatura que já existe consegue extrair a linha, mas eu preciso ver como ela vem —; **(b)** a resposta de **quem paga**: o cliente paga a própria conta mínima à Equatorial e a G3 só acompanha? ou a G3 paga a conta das unidades geradoras? ou dos dois?; **(c)** **onde isso é controlado hoje** (planilha? qual coluna?). Com isso decido sozinho o modelo — provavelmente uma tabela por unidade × competência com «devido / pago / comprovado», e a Pendências acusando o que não foi pago.

3. **Conciliação bancária.** Preciso de **um extrato OFX (ou CSV) de um mês real**, exportado do internet banking PJ do Sicoob — o formato exato é o que decide o importador, e um exemplo vale mais que a documentação. Se a preferência for **API** (PRD §4.4 a chama de primária), o gerente precisa incluir os escopos de conta corrente (`cco_consulta`/`cco_extrato`) no aplicativo, e isso é uma conversa do dono — os escopos hoje são só de boleto, medidos em 28/08. Enquanto isso, o OFX é o caminho que não depende de ninguém.

4. **Inadimplência — a régua.** O que a G3 faz hoje quando um cliente não paga: em que dia avisa, por qual canal (WhatsApp? ligação?), quando manda segunda via, e se e quando **corta o rateio** (isso muda o CRM, e o CRM é só leitura — então o «corte» seria uma sinalização, não uma ação). Com a régua eu construo o registro de tratativas dentro de Contas a receber.

5. **Os rótulos «Rateio» e «Empresa»** (curtos, ao lado da marca). Foi decisão minha; o nome inteiro «Financeiro Rateio» / «Financeiro Empresa» está no leitor de tela e na ajuda. Se preferir outra palavra, é uma linha em `navegacao.ts`.

**Não estou parado enquanto espero.** Os itens da §6 marcados «sem dependência» seguem.

---

## 6. Roadmap sugerido, na ordem

| # | Entrega | Depende de | Tamanho |
|:-:|---|---|:-:|
| R1 | **Deploy do que entrou hoje** (§8) | dono | 1 comando |
| R2 | **Fluxo de caixa** na Empresa: entradas (liquidações) e saídas (pagamentos) por dia, saldo acumulado, exportação — derivado, sem migration | nada | M |
| R3 | **Régua de cobrança**: aviso D-3 e lembretes D+1/D+7 por e-mail/WhatsApp com segunda via; a fila já existe (`agenda`) | régua do dono (§5.4) | G |
| R4 | **Tratativas de inadimplência**: tabela `tratativa` (fatura, data, canal, quem, resultado, próxima ação) + registro dentro de Contas a receber; a Pendências acusa título vencido sem tratativa | régua do dono | M |
| R5 | **Conciliação bancária por OFX**: importar → casar com boletos (nosso número, valor, data) e com pagamentos de contas a pagar → baixa pela rota existente → o que não casou vira lista para o analista; tabela `extrato_importado` + `conciliacao` (migration) | extrato real (§5.3) | G |
| R6 | **Projeção de recebíveis** | áudio (§5.1) | M |
| R7 | **Tarifas mínimas da Equatorial** | conta real + respostas (§5.2) | M |
| R8 | **Escala**: paginação no servidor para listas que hoje pedem `limite=500` (unidades) e teto 500 (receber); busca no servidor; índice `fatura_vencimento_idx` já é parcial em `emitida/vencida` e cobre a consulta nova | nada | M |
| R9 | **Conta bancária múltipla e cartão** (PRD §4.4) | decisão de operação | G |

---

## 7. Achados da revisão que não mexi hoje (e por quê)

- **Leituras pelo pool transacional.** `GET /contas-a-pagar` e `GET /faturamento/:competencia` usam `emTenant` (transação) para LER; `resumo`, `carteira` e a tela nova usam `emRelatorio`. Mover as listagens para o pool de relatório reduz a disputa com a emissão e é candidato natural a fechar o aviso do `pg` que reproduz em «Contas a pagar» (a tela dispara 4 requisições simultâneas; Contas a receber dispara **uma**, de propósito). Não mexi porque é mudança de comportamento em rota que já está em produção, e merece a sua própria medição.
- **Categoria e centro de custo** existem no banco e não têm tela (exceção declarada em `rotas-com-tela.ts`). Para um analista financeiro elas passam a importar no R2 (fluxo de caixa por categoria) — é quando a exceção cai.
- **`README.md` e `PENDENCIAS.md` dizem «12 telas»**. São registros datados e não os reescrevi; este arquivo é o registro de hoje.
- **O ciclo do CRM segue morrendo a cada 15 min** por rateio acima de 100% numa usina. O dono informou em 22/09 que a causa é *overenergy* na usina e que será mitigada em 24 h — não é assunto deste sistema, e não mexi.

---

## 8. Como conferir

**Deploy** (o dono, como sempre):

```
gh workflow run deploy-financeiro.yml
```

Antes, a guarda de propriedade: `find /opt/financeiro/app -user root -not -path '*/node_modules/*' | wc -l` deve dar **0** — já deixei assim.

**O que olhar depois do deploy:**

1. O topo tem «Rateio | Empresa» ao lado de «Financeiro G3». Clicar em «Empresa» abre Contas a receber e a barra passa a ter quatro abas.
2. Com zero faturas emitidas, Contas a receber diz: *«Nenhum título em aberto. Ou tudo o que foi emitido já foi pago, ou nenhuma fatura foi emitida ainda — a aba Pendências diz qual dos dois.»* — é o estado certo, não um defeito.
3. Na Central de Ajuda, perguntar «onde foi a aba contas a pagar» ou «quem está devendo».
4. `curl -s -H 'Authorization: Bearer …' -H 'X-Tenant-ID: …' https://financeiro.blackhaus.io/api/contas-a-receber` devolve `{ hoje, resumo, linhas, total }`.

**Suíte:** `npm run typecheck && npm run test:documento && npm run test:brcode && npm run test:web && npm run test:dominio` → EXIT=0 em 22/09. `test:repos`, `test:isolamento`, `test:middleware` e `test:sessao` só rodam no Actions — conferir o `isolamento` depois do push.
