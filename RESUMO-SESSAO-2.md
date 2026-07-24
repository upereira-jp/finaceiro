# Resumo da sessão 2 — Financeiro G3 Solar

> **Nota de correção — 24/07/2026.** Este documento trata o `CLAUDE.md` como arquivo existente (ou como pendência de envio). **Ele nunca existiu.** O corpo abaixo fica **intacto**, como registro da passagem de sessão. O `CLAUDE.md` v1.0, de 24/07/2026, é novo e não reconstrói nada. Ver `PATCH-citacoes-2026-07-24.md`.

> Documento de passagem. Sucede o resumo de 23/07/2026.
> **Data:** 23–24/07/2026 · **Sessão:** correção pós-auditoria e descoberta da topologia de funis

---

## 1. O que esta sessão fez

Entrou para aplicar cinco correções pontuais em três documentos. Descobriu, no caminho, que **a auditoria tinha errado a explicação central sobre a base de clientes** — e que parte do que ela declarou ausente existe.

Cinco documentos revisados, um relatório de auditoria novo, um bloco de questões. Nenhuma linha de código: continua valendo o método de documentação primeiro.

O trabalho foi feito com leitura direta do Postgres do CRM — nove consultas, todas `SELECT`, nenhuma DDL executada.

---

## 2. As três descobertas que mudaram o desenho

### 2.1 A carteira não está onde a auditoria olhou

A G3 tem **cinco funis** no CRM, e eles não são intercambiáveis:

| Funil | Criado | Leads | Em `won` |
|---|---|--:|--:|
| Vendas - Assinatura | 24/05 | 197 | 38 |
| Rateio | 29/06 | 38 | 0 |
| Vendas - Integração | 05/06 | 23 | 1 |
| Parceiros | 18/05 | 10 | 7 |
| **Clientes ativos - Assinatura** | **29/06** | **0** | **0** |

Os 36 clientes de `usina_clientes` estão **todos** dentro do funil Rateio — contenção exata, mais 2 sem vínculo. E **nenhum lead do funil Rateio ocupa etapa `won`**.

Consequências:

- **A disjunção 46 × 36 não era artefato de backfill.** É estrutural. As populações não convergem porque vivem em funis distintos e o de carteira não tem ninguém em etapa ganha. A previsão de convergência em três competências aguardava um evento sem mecanismo que o produzisse.
- **A passagem venda → carteira foi desenhada e nunca ligada.** O funil `Clientes ativos - Assinatura` existe, tem as etapas certas (ATIVOS · INADIMPLENTES · CANCELADOS), foi criado no mesmo dia do funil Rateio e está vazio. **Nenhuma automação está configurada em funil algum** — `auto_enter_rules`, `auto_exit_rules` e `entry_sources` todos vazios.
- **Os 46 "vendas ganhas" incluem 7 parceiros.** 46 = 38 assinatura + 1 integração + 7 do funil Parceiros, que é onboarding. A view `vendas_ganhas` não filtra funil.

**Diretriz do dono do produto (23/07):** a carteira sai do funil `Clientes ativos - Assinatura`, e os ganhos dos funis de conversão final passarão a entrar nele por automação. Isso está aceito — mas a automação não existe e a carteira legada não é alcançada por ela (F-01).

### 2.2 O dado monetário existe, e as views escondem as chaves

- **`leads.consumo_reais`: 38 de 38** nas duas populações medidas. O valor de referência está completo.
- **`valor_venda` e `valor_investimento` estão mortos por desenho**, não por negligência: `funnels.valor_mode = 'consumo_solar'` faz o CRM derivar o valor exibido do consumo, então ninguém preenche aquelas colunas. Nenhuma spec deve construir sobre elas.
- **A hipótese dos custom fields de `moeda` está encerrada.** O único com preenchimento é `Valor médio conta (R$)`, em 15 leads.
- **As views de interface não expõem os uuid de junção.** `rateio_clientes` traz `codigo` mas não `lead_id`; `usinas` não traz `dono_lead_id`. O financeiro chaveia por uuid — sem correção, a SPEC-002 não fecha.
- **Todas as views carregam o UUID do tenant como literal no corpo.** A camada de interface é mono-tenant na prática: um segundo tenant exige view nova, não configuração (MT-08).

### 2.3 Comissão: três modelos que não concordam

| Fonte | O que diz |
|---|---|
| `app_settings.g3_partner_rules` | dois tiers flat: `captacao` 50%, `indicacao` 25% |
| Custom field `Comissionamento` | 335 leads, mas **303 em `PADRAO`**. Sinal real: 32 leads em `25%` (20), `50%` (9) e **`30%` (3)** |
| PRD §5.4 | quatro tipos com escalonamento entre 1ª e 2ª fatura |

O valor **`30%` não existe em nenhum dos outros dois modelos**. E `PADRAO` é ambíguo entre "vale a taxa padrão" e "não classificado".

Além disso: **vendedor interno existe no CRM**, como custom field `Nome do vendedor`, texto livre, 286 leads. A auditoria registrou que não existia. Senioridade continua sem lugar.

---

## 3. Estado dos documentos

| Arquivo | Estado |
|---|---|
| `PRD-v2.2.md` | **atualizado** — §0, §4.2, §4.3, §5.4, §7.4, §7.5, §8, §11 |
| `GLOSSARIO.md` rev. 3 | **atualizado** — novos verbetes `carteira`, `funil`, `valor de referência`; revistos `cliente`, `won`, `inadimplência`, `originador`, `view de interface`, `upsert` |
| `ADR-0002` r2 | **atualizado** — Decisão 1 invertida e aceita; Decisão 2 com premissa corrigida |
| `auditoria/P7-TOPOLOGIA-DE-FUNIS.md` | **novo** |
| `VIEWS-PROPOSTAS-r2.sql` | **reescrito** — proposta, não aplicada |
| `QUESTOES-bloco-para-fusao.md` | **novo** — pronto para colar |
| `ADR-0001` | válido, sem alteração |
| `CLAUDE.md` | válido **exceto a regra 7** — segredos por tenant não cabem em variável de ambiente |
| `QUESTOES.md` | ainda não fundido — o arquivo não foi enviado |
| `_TEMPLATE-SPEC.md` | necessário para a SPEC-001; não foi enviado |

---

## 4. Bloqueios abertos, por responsável

### Vinicius — decisão de produto
`F-02` quais funis contam como conversão final · `F-03` quem mantém INADIMPLENTES · `F-04` participação ou etapa · `F-05` integração entra na carteira · `Q-021`/`AUD-03` geração nominal ou real · `AUD-05a` o que significa `PADRAO` · `AUD-05b` de onde vem o `30%` · `AUD-06` onde mora a senioridade · `AUD-09` CPF/CNPJ · `AUD-10` regra dos 25% · `MT-06` auth próprio ou SSO · host da aplicação

### Operação
`F-01` **migrar a carteira legada** · `AUD-02` rateio incompleto · `AUD-04` competência fechada · `AUD-08` quem preenche `dono_lead_id` · `O-01` parâmetros da lista de rateio · `O-02` quando um cliente novo começa a ser faturado

### Dev do CRM
`AUD-07` merge apaga id fisicamente · `MT-08` parametrizar as views · aplicar o `VIEWS-PROPOSTAS-r2.sql` · **as seis ações de segurança**

### Contador
`Q-011` retenção sobre comissão a PF · `Q-002 C` escrituração sem documento fiscal · `Q-003 C` crédito de IBS/CBS

---

## 5. Próximos passos, em ordem

1. **`DROP ROLE auditoria_ro`** — cinco minutos. Role com LOGIN, senha e BYPASSRLS, válida até 23/08. Único item com prazo correndo.
2. **Conversa única com a operação** — F-01, F-02, F-04, AUD-02, AUD-04, AUD-08, O-01, O-02. A F-01 é a de maior risco de cronograma: mover 36 linhas é trivial, mas se ninguém mover, o conector nasce lendo vazio e o defeito só aparece no piloto sombra.
3. **Conversa única com Vinicius** — o bloco de produto do §4, com a tabela de comissão do §2.3 na mão.
4. **Spike Prisma + RLS** (~2 dias) — não depende de nada acima e continua bloqueando o schema definitivo. Vira ADR-0003.
5. **Fundir o `QUESTOES.md`** com o bloco entregue, adotando o prefixo por origem.
6. **SPEC-001 (cadastros)** — não depende dos bloqueios. Precisa do `_TEMPLATE-SPEC.md`.
7. **SPEC-002 (conector CRM)** — só depois de F-02, F-03 e F-04, e da aplicação das views.
8. **SPEC do split** — só depois da Q-021 e da tabela de comissão.

---

## 6. O que a próxima sessão precisa receber

`_TEMPLATE-SPEC.md` · `QUESTOES.md` · `CLAUDE.md` · `ADR-0001`

Uploads não sobrevivem entre sessões. Sem esses quatro, a próxima sessão repete a arqueologia desta.

---

## 7. Uma observação sobre ritmo

Três vezes nesta sessão um documento foi reescrito porque uma consulta ao banco derrubou uma premissa que ninguém tinha testado. O padrão é claro: **medir antes de escrever custa minutos e economiza revisões inteiras.**

E vale o alerta oposto. Cinco documentos foram revisados hoje; nenhum vira código enquanto F-01 a F-05 não tiverem resposta, e as cinco são de processo, não de engenharia. A conversa com a operação destrava mais que o próximo documento.
