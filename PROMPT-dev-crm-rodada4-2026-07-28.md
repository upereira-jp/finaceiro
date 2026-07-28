# Retorno — CRM, rodada 4 (28/07/2026)

> ## Esta rodada NÃO tem pedido. Nenhum.
>
> É **auditoria**: nove observações que eu medi contra o CRM real e que preciso
> que você **confirme ou negue**. Nada aqui é para você consertar agora.
>
> O motivo de separar assim: várias destas coisas podem ser **comportamento
> esperado** que eu li como problema por não conhecer o histórico de vocês. Se eu
> pedisse correção junto, você gastaria tempo consertando o que talvez esteja
> certo — e eu já fiz isso com você uma vez, na rodada 3, quando quase pedi
> `security_invoker` que teria quebrado a integração.
>
> **Há uma checklist de resposta no fim.** Marcar "esperado" em qualquer item é
> uma resposta completa e útil.

O conector está rodando contra vocês em produção desde 27/07. Ele espelha 41
clientes, roda idempotente (segunda passada não escreve nada) e não escreve uma
linha no CRM por nenhum caminho. **As views e a role estão certas** — isso segue
valendo desde a rodada 3.

Tudo abaixo saiu de consultas de leitura nas oito views `financeiro.*`, pela role
`financeiro_ro`. Reproduzo o SQL de cada uma para você conferir sem depender de eu
ter medido direito.

---

## 1. `financeiro.usinas.distribuidora` vem string vazia nas três

```sql
SELECT codigo_geradora, '['||distribuidora||']' AS entre_colchetes,
       length(distribuidora) AS tamanho
  FROM financeiro.usinas;
```

| `codigo_geradora` | valor | `length` |
|---|---|--:|
| `0001` | `[]` | **0** |
| `0002` | `[]` | **0** |
| `0003` | `[]` | **0** |

Não é `NULL` — é **string vazia**. Do meu lado a coluna é `NOT NULL` com FK para
uma tabela de referência, então o conector **recusa as três** e registra o motivo,
em vez de assumir um valor.

**A pergunta é onde está o vazio:** a coluna de origem está genuinamente sem
preenchimento, ou a view faz algum `coalesce`/concatenação que transforma `NULL`
em `''` no caminho?

**Não estou pedindo para preencher.** Se a distribuidora simplesmente não é um
dado que vocês coletam, isso é uma resposta completa — e o dado passa a ser
cadastro local do nosso lado.

## 2. `dono_lead_codigo` e `dono_lead_nome` vêm nulos nas três

```sql
SELECT count(*) AS total, count(dono_lead_codigo) AS com_codigo,
       count(dono_lead_nome) AS com_nome FROM financeiro.usinas;
-- total 3 | com_codigo 0 | com_nome 0
```

Isso **bate com o que você já tinha me dito** — o par de funil
`Vendas - Integração → Donos de Usina` ainda não existe (é o item que eu registrei
como `C1-crm`).

**Só quero confirmar que é a mesma coisa**, e não uma segunda ausência que
coincidiu. Se for a mesma, o item fica onde está e eu não te cobro de novo.

## 3. Três campos de `usinas` 100% vazios

```sql
SELECT count(potencia_kwp) AS potencia, count(data_instalacao) AS instalacao,
       count(nullif(localizacao,'')) AS localizacao FROM financeiro.usinas;
-- potencia 0 | instalacao 0 | localizacao 0   (de 3)
```

A `potencia_kwp` eu já tinha registrado como esperada. As outras duas eu não sabia.

**Pergunta:** os três são "não coletamos", ou algum deles deveria estar preenchido
e não está? Nenhum bloqueia o conector — ele grava nulo como nulo e não inventa
zero.

## 4. Uma UC aparece em dois contratos de rateio

```sql
SELECT uc, count(*), string_agg(lead_codigo,' | ') AS leads,
       string_agg(codigo_geradora,' | ') AS usinas
  FROM financeiro.rateio_clientes GROUP BY uc HAVING count(*) > 1;
```

| `uc` | n | leads | usina |
|---|--:|---|---|
| `000041446801282` | **2** | `G3-0141` \| `G3-0312` | `0001` \| `0001` |

São 36 linhas para **35** números de UC distintos. Mesma unidade consumidora,
mesma usina, dois contratos.

**Pergunta:** é troca de titularidade / renovação (o contrato antigo deveria estar
encerrado), ou são dois rateios simultâneos sobre a mesma UC — o que seria
legítimo se a UC divide crédito entre dois beneficiários?

Do meu lado a UC é única por tenant, então a resposta muda o modelo, não só o dado.

## 5. `data_vencimento`, `troca_titularidade` e `numero_protocolo` vazios em 36 de 36

```sql
SELECT count(*) n, count(data_vencimento) venc, count(troca_titularidade) troca,
       count(numero_protocolo) protocolo FROM financeiro.rateio_clientes;
-- n 36 | venc 0 | troca 0 | protocolo 0
```

`data_vencimento` eu já esperava (está no meu registro como 100% vazia). As outras
duas não estavam.

**Pergunta:** os três são campos que a operação não usa hoje, ou são campos que
existem na tela e não chegam à view?

## 6. A etapa de ganho do Rateio não dispara a automação — e esta é a que mais importa

Esta é a única com consequência de desenho, e ela vem de uma coisa que **você já
me disse** e que **eu interpretei errado**.

Você me explicou em 26/07 que o funil `Clientes ativos - Assinatura` estava vazio
porque os concluídos param em `Rateio Concluido`, com `stage_type = 'normal'`, que
**não dispara** a automação que moveria o card.

**Eu concluí dali que o funil não era a fonte certa de estado ativo, e troquei de
fonte.** Isso estava errado, e quem me corrigiu foi o dono do projeto: o desenho é
que **ganho no Rateio vai para `Clientes ativos`**, e é de lá que o financeiro deve
puxar cliente ativo. O funil não está vazio por desenho — está vazio por
configuração.

Eu tomei **ausência de dado como resposta de desenho**, que é um erro meu de
método, não seu.

**A pergunta, e ela é só de confirmação:** o `stage_type = 'normal'` na etapa de
ganho do Rateio é **intencional** — vocês pararam a automação de propósito — ou é
uma configuração que ficou para trás?

Não estou pedindo para mudar. Se for para mudar, isso é decisão de vocês com a
operação, e eu preciso medir o funil **populado** antes de mexer no meu lado.

## 7. A carteira de rateio e o funil de vendas não se cruzam por `lead_id`

```sql
SELECT (SELECT count(*) FROM financeiro.rateio_creditos) AS rateio,
       (SELECT count(*) FROM financeiro.rateio_creditos rk
         WHERE EXISTS (SELECT 1 FROM financeiro.vendas_ganhas vg
                        WHERE vg.lead_id = rk.lead_id)) AS com_ganho;
-- rateio 36 | com_ganho 0
```

**Zero.** Nenhum dos 36 `lead_id` do rateio aparece em `vendas_ganhas`.

Por **nome normalizado**, porém, os dois conjuntos se cruzam em **42 pares — 24
pessoas distintas**. Exemplos: `RENATA LUCY NOGUEIRA DRUMOND TELES LEÃO`,
`THIAGO GONÇALVES TAQUARY`, `ATAIDE DE MELO OLIVEIRA`. A mesma pessoa é **dois
leads** no CRM: um na carteira legada, outro no funil de vendas.

O dono do projeto já me confirmou que **isso é esperado** — a carteira legada
nunca passou pelo funil de vendas como ganho.

**Pergunta para você, que é técnica e não de negócio:** existe do lado de vocês
algum vínculo entre esses dois leads — um campo, uma tag, um registro de
duplicidade — que eu não esteja enxergando pelas views? Se não existir, tudo bem;
eu só preciso saber que **não existe**, em vez de supor.

## 8. A soma de rateio por usina não fecha 100% em duas das três

```sql
SELECT usina_id, count(*) ucs, sum(percentual_rateio::numeric) soma
  FROM financeiro.rateio_creditos GROUP BY 1;
```

| usina | UCs | soma |
|---|--:|--:|
| `b7ac2dbd…` | 1 | **100,00** |
| `31f37062…` | 21 | **99,78** |
| `b800e51f…` | 14 | **91,20** |

Nenhuma passa de 100, que é o que eu precisava saber — do meu lado há uma
constraint de teto por usina e ela **não seria violada** por estes dados.

**Pergunta:** os 99,78 e os 91,20 são **capacidade ociosa proposital** (sobra para
vender), ou é resíduo de arredondamento / rateio que deveria fechar em 100?

A diferença importa porque a partir da F2 eu passo a faturar por
`consumo × tarifa`, e preciso saber se a sobra é receita não realizada ou erro
acumulado.

## 9. `geracao_mensal` tem série de duas usinas, e irregular

```sql
SELECT codigo_geradora, count(*) meses, min(competencia), max(competencia)
  FROM financeiro.geracao_mensal GROUP BY 1;
```

| usina | meses | período |
|---|--:|---|
| `0002` | 7 | 2026-01 a 2026-07 |
| `0001` | **1** | só 2026-06 |
| `0003` | **0** | — |

**Pergunta:** a `0003` nunca gerou, ou a série dela não está sendo lançada? E a
`0001` entrou em operação em junho, ou faltam os meses anteriores?

Isso não bloqueia nada hoje, mas na F2 a geração vira base de conferência de
fatura, e série faltando vira divergência que alguém vai investigar.

---

## Do meu lado, para você calibrar o que confiar

Em 27–28/07: conector rodando valendo contra vocês, **307 verificações** na suíte,
`EXIT=0`, e os invariantes de catálogo passando contra produção.

E, na mesma linha das correções que eu já te mandei nas rodadas anteriores, **dois
erros meus** desta rodada, porque eles mudam o peso do que eu te digo:

1. **A §6 acima é uma correção de leitura minha**, não um achado novo. Você tinha
   me dado o fato em 26/07 e eu tirei a conclusão errada dele.
2. Eu tinha escrito no meu registro que a suíte cobria um invariante — "só as
   views `financeiro.*` são alcançadas" — apontando para dois testes que **nunca
   existiram**. Descobri conferindo. Agora é um log de query de verdade, que grava
   tudo que sai para vocês e confere objeto por objeto.

Menciono porque, se eu erro assim no meu próprio lado, você tem motivo para
conferir o que eu afirmo sobre o de vocês — que é exatamente o que esta carta pede.

## Status dos dois itens antigos, sem cobrança

Seguem no meu registro com o seu nome, e **nenhum bloqueia o conector**. Não
precisam de resposta nesta rodada:

- **`LIMIT 1` sem `ORDER BY`** (`VIEWS-PROPOSTAS-r2.sql` §100) — é alíquota, não
  relatório: a linha que o planejador escolher vira o percentual que alguém recebe.
- **Segredos em `text` puro na tabela `tenants`** — o caminho é **rotação**, não
  migração de coluna, porque o repositório foi público até 25/07 e nomeia as
  colunas.

- **`pg_net` concedendo `arwdDxtm` a `PUBLIC`** — já tratado do meu lado (sessão
  read-only + guarda de arranque que reporta em vez de silenciar). **Não é
  concessão sua**, é a extensão. Zero ação da sua parte.

---

## Checklist de resposta

Marcar **"esperado"** é resposta completa. Se algum item precisar de conversa, me
diga qual e eu levo separado.

| # | Observação | Esperado? | Se não, o que é |
|---|---|---|---|
| 1 | `usinas.distribuidora` = `''` nas 3 | ☐ | |
| 2 | `dono_lead_codigo`/`dono_lead_nome` nulos = mesmo item `C1-crm` | ☐ | |
| 3 | `potencia_kwp`, `data_instalacao`, `localizacao` vazios nas 3 | ☐ | |
| 4 | UC `000041446801282` em dois contratos da mesma usina | ☐ | |
| 5 | `data_vencimento`, `troca_titularidade`, `numero_protocolo` vazios em 36/36 | ☐ | |
| 6 | `stage_type='normal'` na etapa de ganho do Rateio é intencional | ☐ | |
| 7 | Não existe vínculo entre o lead do rateio e o lead de venda da mesma pessoa | ☐ | |
| 8 | Somas de 99,78 % e 91,20 % são ociosidade proposital | ☐ | |
| 9 | `0003` sem geração e `0001` só com 2026-06 | ☐ | |

Obrigado — e de novo pela velocidade das rodadas anteriores. As views resolveram o
que precisavam resolver.
