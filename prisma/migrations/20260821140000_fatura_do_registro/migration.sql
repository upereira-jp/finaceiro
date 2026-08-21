-- MIGRATION 34 - A FATURA UNIFICADA PASSA A PODER SER COBRADA, LIQUIDADA E REPARTIDA.
--
-- ============================================================================
-- A DECISAO QUE ESTA MIGRATION EXECUTA
--
-- `Q-CICLO-01`, decidida pelo dono em 21/08/2026: **o caminho oficial da fatura e
-- o UNIFICADO** - o valor sai da conta da distribuidora lida, e nao da geracao
-- medida multiplicada pelo rateio.
--
-- A verificacao ponta a ponta do mesmo dia mediu o que essa escolha implica, e o
-- achado nao era de opiniao: `registro_de_fatura_unificada` **nao tem ligacao com
-- `fatura`**, e por isso o documento que o cliente efetivamente recebe era o
-- unico dos dois caminhos que **nao conseguia pagar o dono da usina**. Sem
-- `fatura` nao ha `boleto`, sem boleto nao ha `liquidacao`, sem liquidacao nao ha
-- `split_execucao` - e o repasse e a comissao ficam sem por onde sair.
--
-- Esta migration e a ligacao. Uma coluna.
--
-- ============================================================================
-- POR QUE UMA COLUNA BASTA, e por que ela vem AGORA
--
-- O motor de split ja tem a forma exata da conta unificada, e isso foi medido e
-- nao suposto. `src/repos/split.ts` le da fatura exatamente duas parcelas:
--
--     f.valor_consumo_centavos                 -> base da comissao e do repasse
--     f.valor_tarifas_concessionaria_centavos  -> repasse PURO, sem percentual
--
-- e a conta unificada produz exatamente duas parcelas:
--
--     energia_g3_centavos        -> o que o cliente paga a G3 pela energia
--     total_equatorial_centavos  -> nao compensado + iluminacao + bandeira + demais
--
-- O `repasse_concessionaria` do `PRD` 5.1 ja e descrito como "repasse puro: nao ha
-- percentual, ha o valor", que e literalmente o que a parte da Equatorial e numa
-- fatura unificada. Nenhuma linha do motor de split muda.
--
-- E vem AGORA porque as duas tabelas tem **zero linhas** em producao (medido em
-- 21/08). Ligar duas tabelas vazias e uma coluna; liga-las depois do primeiro
-- dinheiro seria migration com valor gravado dentro, e a `Q-PAGAMENTO-01` ja
-- ensinou esse custo neste projeto.
--
-- ============================================================================
-- O INDICE E CHEIO, E A REGRA 11 E O MOTIVO
--
-- O natural seria `UNIQUE (tenant_id, fatura_id) WHERE fatura_id IS NOT NULL`, e
-- ele seria **exatamente** o conjunto de colunas da FK nova - que e o unico caso
-- que a regra 11 proibe pelo nome, porque o `db pull` do Prisma 7.9 ignora o
-- predicado ao inferir cardinalidade.
--
-- O indice CHEIO resolve sem excecao: no Postgres, NULL nao conflita com NULL num
-- indice unico, entao `(tenant_id, NULL)` se repete a vontade e a unicidade so
-- morde quando ha fatura. E a cardinalidade que o `db pull` vai inferir - **um
-- registro para no maximo uma fatura** - e a verdadeira, entao a inferencia
-- automatica passa a trabalhar a favor em vez de contra.
--
-- Ha precedente exato no proprio repositorio: a `Q-PRISMA11B-01` registrou que o
-- gerador exige a unicidade sobre **os campos da relacao**, e nao aceita que ela
-- venha de um subconjunto deles.
--
-- ============================================================================
-- NULAVEL, E ISSO NAO E FROUXIDAO
--
-- Registrar a fatura lida e **conferir**; fatura-la e outro ato. Quem sobe o PDF
-- esta transcrevendo e comparando, e a migration 29 ja tinha escolhido nao travar
-- essa conferencia por cadastro faltando - foi por isso que `numero_uc` e texto e
-- a FK para a UC e opcional. Exigir `fatura_id NOT NULL` inverteria a mesma ordem
-- de trabalho que aquela migration protegeu.
--
-- Consequencia legivel no dado: `fatura_id IS NULL` significa "lida e conferida,
-- ainda nao cobrada", e e um estado de trabalho real, nao um buraco.

ALTER TABLE registro_de_fatura_unificada
  ADD COLUMN fatura_id uuid;

/* Regra 2: nenhuma FK atravessa tenant, e o mecanismo e a FK COMPOSTA -
 * `fatura` ja carrega o `UNIQUE (tenant_id, id)` redundante que a torna
 * expressavel (`fatura_id_tenant`, migration 17). */
ALTER TABLE registro_de_fatura_unificada
  ADD CONSTRAINT registro_fatura_unificada_fatura_fk
  FOREIGN KEY (tenant_id, fatura_id) REFERENCES fatura (tenant_id, id);

/* CHEIO e nao parcial - ver o cabecalho. Uma fatura tem no maximo um registro
 * unificado; muitos registros ficam sem fatura, e NULL nao conflita com NULL. */
CREATE UNIQUE INDEX registro_fatura_unificada_fatura_unico
  ON registro_de_fatura_unificada (tenant_id, fatura_id);

COMMENT ON COLUMN registro_de_fatura_unificada.fatura_id IS
  'A fatura que este registro virou, quando virou. NULO = lida e conferida, ainda nao '
  'cobrada. E a ligacao que a Q-CICLO-01 destravou em 21/08/2026: sem ela o documento que '
  'o cliente recebe nao virava boleto, nao virava liquidacao e nao repartia - o dono da '
  'usina ficava sem por onde receber.';
