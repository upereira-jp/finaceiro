# Retorno — CRM, rodada 2 (26/07/2026)

Trabalho impecável nas cinco. Três coisas: uma correção sua que eu absorvi e que valeu mais para o meu lado do que para o seu, um "sim" a uma oferta sua, e dois pedidos novos que **nasceram da sua resposta**, não da minha lista.

---

## Aceito suas duas adaptações da Tarefa 1

`comissionamento_n_opcoes` no fim da lista de colunas — exigência do `CREATE OR REPLACE VIEW`, correto, e a posição não me afeta.

E o predicado `o.tenant_id = v.tenant_id` caiu porque **`custom_field_options` não tem essa coluna**. Eu propus um predicado sobre coluna inexistente — erro meu, e a severidade que eu declarei ("baixa, defesa em profundidade") era a certa por motivo errado. Manter só o de `custom_field_definitions` está correto.

**Do meu lado, feito:** a recusa de cálculo quando `comissionamento_n_opcoes > 1` já está normativa — `SPEC-002` R8, e há teste. Recusa contada, sem valor gravado. Não vou repetir do lado do financeiro a escolha silenciosa que a sua correção existe para eliminar.

---

## Sua correção da Tarefa 2 mudou a minha camada, não a sua

> *"RLS de tabela-base é avaliada contra o dono da view (postgres, que tem BYPASSRLS), não contra quem consulta."*

Você está certo, e isso invalidava uma premissa que eu tinha propagado por quatro documentos meus. Reproduzi no schema do financeiro, mesma sessão, role sem `BYPASSRLS`, sem contexto de tenant:

| Via | Linhas |
|---|--:|
| tabela direta | **0** |
| view **sem** `security_invoker` | **2** — todos os tenants |
| view **com** `security_invoker = true` | **0** |

**No meu lado isso era um furo esperando a primeira view.** Eu tenho `FORCE ROW LEVEL SECURITY` e treze policies, e uma view criada sem essa opção anularia as duas coisas de uma vez. O financeiro não tinha view nenhuma — então a regra passou a existir antes da primeira: invariante 13, verificação de catálogo no CI, e o teste **reproduz o furo** de propósito para provar que a regra tem motivo.

**Concordo em escopar o invariante, e discordo do escopo.** Não vou pedir policy em `lead_origins` / `lead_lost_reasons`: você tem razão que as 32 operacionais sem policy são padrão deliberado com acesso por `service_role`, e adicionar policy ampliaria exposição sem necessidade. **Não faça.**

Mas o invariante certo não é "zero tabelas sem policy em `financeiro.*`". É outro, e é do meu lado:

> **O conector não depende da RLS do CRM para isolamento.**

Porque o que restringe o tenant nas views `financeiro.*` são **14 ocorrências literais** do UUID `d4640f4b-…` no corpo delas. Uma view nova sem o literal, ou com o literal errado, entrega linha de outro tenant e **nada no banco impede**. Não é crítica ao seu desenho — é reconhecimento de onde a garantia mora de fato.

**Consequência que eu implementei:** o conector valida `crm_tenant_id` em **toda linha recebida** e aborta o ciclo na primeira divergência. Nada gravado, nada reconciliado. Uma comparação por linha, e é a única defesa que não depende de a view estar certa.

E o número: **82** anotado, com a origem (a 50ª nasceu em 25/07). Corrigi nos meus documentos, inclusive a divergência do `P8` §7 que dizia 36.

---

## Tarefa 3: nada a acrescentar

Saída 1, verificação de dependências antes de mover, fora do PostgREST, fora do `search_path`, sem grants, prazo em `COMMENT ON SCHEMA`. É mais do que eu pedi. A disciplina de novos snapshots nascerem em `backup` é o único resíduo, e é cultural — não tenho como cobrir do meu lado.

---

## Tarefa 4: **sim, quero a view.** E dois pedidos que a sua resposta abriu

### Aceito: `financeiro.leads_arquivados`

Ela é o que transforma a minha regra defensiva de "fila de revisão cheia" em "fila mínima". Com ela eu classifico ausência em três, e só uma exige gente:

| Ausência | Como distingo | Ação |
|---|---|---|
| arquivado ou mesclado | está em `leads_arquivados` | desativo no mesmo ciclo |
| cópia derivada | pertencia ao funil `Clientes ativos - Assinatura` | **não desativo e não conto** |
| sumiu de verdade | em nenhuma das duas | dois ciclos + fila de revisão |

O que eu preciso nela: `lead_id`, `codigo`, `removido_do_funil_em`, as tags (ou um booleano `mesclado`), e o `funil` de onde saiu. Com `security_invoker` ou sem, tanto faz para mim — mas com o literal de tenant, como as outras.

### 🔴 Pedido 1 — persistir o mapeamento vítima → sobrevivente do merge

Você escreveu: *"Não existe ponteiro vítima→sobrevivente em tabela nenhuma — o mapeamento só vai para log de aplicação (efêmero)."*

**Isso é maior que a reconciliação, e é o achado mais caro da sua resposta.** Consequência no meu lado: depois de um merge, o financeiro tem **dois clientes espelhados para a mesma pessoa**. Eu desativo um. Se aquele cliente já tiver contrato, unidade consumidora ou histórico de faturamento amarrado, tudo isso fica pendurado no **cliente inativo**, e nada funde os dois lados — porque o único elo existiu num log que já foi rotado.

Frequência de 1 em toda a história ajuda: **ainda dá para consertar o passado.**

Dois pedidos, em ordem de valor:

1. **O merge de 10/07/2026 (G3): dê-me o par.** Qual `lead_id` foi absorvido e por qual. Se o log ainda existir, é uma linha. Se não existir, o lead com a tag `mesclado` é a vítima — falta o sobrevivente, e talvez o histórico migrado identifique.
2. **Daqui em diante, uma tabela.** Não precisa ser bonita: `lead_merge (vitima_id, sobrevivente_id, tenant_id, mesclado_em, mesclado_por)`. Sem ela, cada merge futuro repete o órfão, e o custo cresce com a carteira. **Isso é bloqueio de F2 do meu lado**, não da sua sprint — mas quanto mais cedo, menos passado para reconciliar.

### 🔴 Pedido 2 — o que você contou sobre o funil `Clientes ativos - Assinatura` derruba uma decisão nossa

> *"o sync 'Clientes Ativos' da G3 apaga rotineiramente as cópias de leads no funil `Clientes ativos - Assinatura` quando o lead de origem sai de CONCLUÍDOS no Rateio — essas cópias são derivadas por desenho e vêm e vão."*

Em 24/07 nós decidimos (decisão C1) **ler o estado "cliente ativo" exatamente desse funil.** Pela sua descrição, aquele funil não guarda estado: ele é uma **projeção volátil** do Rateio, recomputada por apagamento e recriação.

Não é pedido de mudança no CRM — é decisão nossa, e eu já registrei como vermelha. Mas duas perguntas suas mudam o desenho:

1. **O que exatamente dispara a criação e a exclusão da cópia?** "Sair de CONCLUÍDOS no Rateio" é a condição de exclusão. Qual é a de criação — entrar em CONCLUÍDOS, ou algo mais?
2. **O sync roda em que cadência?** Se roda a cada N minutos e eu leio a cada 30, eu posso ler no meio de uma recriação e ver o funil parcialmente vazio. Isso muda a minha janela de leitura, e é a diferença entre reconciliar certo e reconciliar um estado transitório.

---

## Tarefa 5: resposta limpa, e ela fechou uma questão e abriu outra

**Fechou a F-02.** `Parceiros` fora da base de comissão sobre valor. Está normativo — `SPEC-002` R14, com o filtro por funil, e a regra de "valor nulo é recusa" deixa de disparar para eles.

**E o detalhe do `Comissionamento` virou regra própria.** Você notou que os 7 têm o campo preenchido (6 `PADRAO`, 1 `50%`) e que **ali é tier do parceiro, não alíquota de venda**. Isso é sobrecarga semântica de campo: o mesmo nome significa duas coisas dependendo do funil. Virou `SPEC-002` R15 — o conector **nunca** lê esse campo de card do funil `Parceiros`. É assim que se paga o dobro sem ninguém ter mentido.

### 🔴 Abriu: existe um segundo motor de comissão dentro do CRM

> *"A comissão de parceiro incide sobre as vendas dos leads que ele indica (tag `indicado_por:<id>` + regras em `app_settings.g3_partner_rules`)."*

Eu não sabia que isso existia. E em 24/07 nós decidimos que a comissão é chaveada **localmente**, por `originador.tipo` no financeiro — justamente para não ficar dependente de coluna do CRM que não podemos alterar.

**Duas engines calculando comissão são duas verdades**, e a que paga é sempre a que alguém olhou por último. Não é bloqueio agora — é F3 — mas preciso entender o que existe antes de decidir quem manda:

1. **Estrutura de `app_settings.g3_partner_rules`.** Um dump do JSON serve, com os nomes das chaves e um exemplo real.
2. **Quem consome hoje?** Alguma tela do CRM calcula e mostra comissão de parceiro, ou é insumo de relatório?
3. **A atribuição por tag `indicado_por:<id>`: quem escreve essa tag, e ela é confiável?** No meu lado, `contrato.originador_id` é o campo de atribuição — e se a verdade da atribuição é uma tag no lead, o conector precisa ler a tag, não inferir.
4. `bkp_g3_partner_rules_20260725` é snapshot dessa configuração antes de uma mudança? Se sim, **o que mudou**, e a mudança já valeu para comissão paga?

---

## Formato de resposta

Por item, as mesmas três linhas: o que encontrou, o que fez, o que ficou aberto.

Prioridade, se tiver que escolher: **o par do merge de 10/07** primeiro (é o único que perde valor com o tempo — log rotaciona), depois a `leads_arquivados`, depois o `g3_partner_rules`. A cadência do sync é uma linha e pode vir junto de qualquer um.

---

# ADENDO URGENTE — 26/07/2026, prazo de 5 dias

## 🔴 CNPJ alfanumérico começa em **31/07/2026**

A Receita Federal inicia a emissão do CNPJ alfanumérico em **31 de julho**. As 12 primeiras posições passam a aceitar letras maiúsculas A-Z junto com dígitos; os 2 dígitos verificadores seguem numéricos. Os dois formatos **coexistem** e ambos são plenamente válidos.

**Eu tinha essa regra errada do meu lado** — a `SPEC-001` R7 mandava armazenar documento "só com dígitos", o que rejeitaria CNPJ válido a partir de sexta. Já corrigido: normalização preserva letra, `CHECK` de formato aceita os dois, e o dígito verificador usa módulo 11 com `valor = ASCII − 48` (`'0'`=0 … `'9'`=9, `'A'`=17 … `'Z'`=42).

**A pergunta para você, e ela tem data:**

1. **O campo de documento do CRM valida formato?** Se a validação for de dígitos — regex, `isdigit`, máscara de input, coluna numérica, qualquer uma — **ela rejeita CNPJ válido a partir de 31/07.**
2. **Onde mais o CNPJ aparece como identificador no CRM?** `tenants.cnpj`, campos customizados de lead, integrações de nota fiscal, consultas cadastrais, chaves de dedup.
3. **Alguma coluna de CNPJ é numérica** (`bigint`, `numeric`) em vez de `text`? Aí não é ajuste de validação, é migration.

**Se quiser o algoritmo pronto**, é este — e ele reduz ao clássico quando todos os caracteres são dígitos, o que garante que nenhum CNPJ existente muda de resultado:

```python
def valor(c): return ord(c) - 48          # '0'->0 ... '9'->9, 'A'->17 ... 'Z'->42

def dv(chars, pesos):
    s = sum(valor(c) * p for c, p in zip(chars, pesos))
    r = s % 11
    return 0 if r < 2 else 11 - r

def cnpj_valido(doc):                      # doc sem máscara, maiúsculo
    import re
    if not re.fullmatch(r'[0-9A-Z]{12}[0-9]{2}', doc): return False
    if re.fullmatch(r'(\d)\1{13}', doc):    return False   # 00000000000000 etc.
    d1 = dv(doc[:12],  [5,4,3,2,9,8,7,6,5,4,3,2])
    d2 = dv(doc[:13],  [6,5,4,3,2,9,8,7,6,5,4,3,2])
    return doc[12] == str(d1) and doc[13] == str(d2)
```

Do meu lado isso está testado com 3 CNPJs públicos reais, 20.000 casos numéricos comparados contra o algoritmo antigo (zero divergências) e 500 alfanuméricos gerados pela regra (todos aceitos, e todos rejeitados quando corrompo o DV).

**Não é bloqueio do financeiro** — é risco de rejeitar cadastro de cliente novo no CRM a partir de sexta. Se a resposta for "o campo é texto livre e não valida nada", ótimo: nada a fazer.
