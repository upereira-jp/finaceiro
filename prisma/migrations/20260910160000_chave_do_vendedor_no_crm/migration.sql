-- ============================================================================
-- Q-NOMEDOVENDEDOR-01 — o originador ganha a CHAVE do vendedor no CRM
-- ============================================================================
/*
 * O QUE ESTA MIGRATION FECHA, e ela e a segunda metade de uma frase que ja
 * estava escrita no codigo.
 *
 * `src/dominio/credito-originador.ts` compara o originador do contrato com o
 * credito congelado do CRM, e diz por escrito onde a comparacao e fraca:
 *
 *     "Onde ha chave forte - `crm_partner_id` contra `parceiro_id` - ela e usada
 *      primeiro, e a comparacao por nome so vale para o VENDEDOR, que nao tem
 *      chave nossa: o `originador` nao guarda `crm_user_id`, e cria-la seria
 *      migration com dono."
 *
 * Esta e a migration, e o dono a autorizou em 10/09/2026 ao responder quem e
 * quem: *"Renata == Renata Ferreira Estevam; Alice == OutSales"*.
 *
 * ============================================================================
 * O QUE A COMPARACAO POR NOME CUSTAVA, MEDIDO
 *
 * A cada 15 minutos, a rodada do conector produzia 29 divergencias. Agrupadas
 * em 10/09/2026, elas eram:
 *
 *     26 x  contrato "Renata Ferreira Estevam"  ×  CRM diz vendedor "Renata"
 *      2 x  contrato "Alice Ribeiro Franca"     ×  CRM diz vendedor "Out Sales"
 *      1 x  a UC renumerada, que e uma divergencia DE VERDADE
 *
 * Ou seja: **28 das 29 eram a mesma pessoa com dois nomes**, e a unica real
 * estava enterrada no meio delas. Um painel que aponta 29 coisas todo dia e um
 * painel que se aprende a nao abrir — e a que importava era a de baixo.
 *
 * ============================================================================
 * POR QUE A CHAVE, E NAO UM "TAMBEM CHAMADO DE"
 *
 * A `Q-NOMEDOVENDEDOR-01` listava tres saidas: (a) escrever o nome completo no
 * CRM, (b) usar aqui o nome curto, (c) um campo de apelido. Nenhuma das tres foi
 * escolhida, e a razao e uma medicao: a view `financeiro.vendas_creditadas`
 * **ja expoe `vendedor_user_id`**, e lido em 10/09/2026 ele e limpo — cada nome
 * tem exatamente UM id:
 *
 *     Renata            41 creditos vigentes   e7ba0a64-12ac-4b66-9c0a-fe73da0871c1
 *     Out Sales         13                     d39e3453-303c-4c11-a2b6-1c0bd742e639
 *     Kallina Tandara    6                     bca737f7-e8f2-494c-a0f1-5e4af1770e91
 *
 * Com a chave, renomear de qualquer lado deixa de produzir alarme: as tres
 * saidas da questao consertavam a FRASE, e esta conserta a COMPARACAO. E ela e
 * simetrica com o que ja existe para o parceiro, que ja e usado primeiro.
 *
 * ⚠️ E A COLUNA E `crm_user_id`, NUNCA `user_id`: regra 6 do CLAUDE.md.
 * Identificador de sistema externo carrega o prefixo, sempre — e aqui ele e do
 * usuario do CRM, que nao e usuario nosso e nunca sera comparado com um.
 *
 * ============================================================================
 * O QUE ELA NAO FAZ: PREENCHER
 *
 * Nenhum INSERT/UPDATE de dado aqui. Quem casa cada originador com a pessoa do
 * CRM e quem opera, na tela — e por dois motivos: o vinculo e fato de negocio
 * (quem recebe comissao), e uma migration que gravasse dois uuids de UM tenant
 * seria uma migration que mente sobre ser schema.
 */

ALTER TABLE originador ADD COLUMN crm_user_id uuid;

COMMENT ON COLUMN originador.crm_user_id IS
  'Regra 6: o id do VENDEDOR no CRM (financeiro.vendas_creditadas.vendedor_user_id). '
  'Chave forte para a conferencia do credito congelado, no lugar da comparacao por '
  'nome - que produzia 28 alarmes falsos por rodada em 10/09/2026. NULL enquanto '
  'ninguem casou o cadastro com a pessoa do CRM: a ausencia faz a conferencia cair '
  'no nome, que e o comportamento de antes. Irmao de crm_partner_id.';

/*
 * UNICO POR TENANT, e a guarda tem consequencia direta: dois originadores
 * apontando para a MESMA pessoa do CRM tornariam a conferencia ambigua, e
 * ambiguidade aqui paga comissao para quem nao vendeu (R8).
 *
 * NULL nao conflita com NULL em indice unico do Postgres, entao os originadores
 * ainda nao casados convivem sem predicado parcial - e sem predicado parcial
 * este indice fica fora da armadilha da regra 11, que e sobre indice PARCIAL
 * cobrindo exatamente o conjunto de colunas de uma FK. Este nao e parcial e
 * (tenant_id, crm_user_id) nao e conjunto de FK nenhuma.
 */
CREATE UNIQUE INDEX originador_crm_user_unico ON originador (tenant_id, crm_user_id);

/*
 * A AUDITORIA JA COBRE: `originador` esta na lista de tabelas com gatilho
 * `auditar_*` desde a migration 6, e o gatilho e por LINHA e nao por coluna -
 * entao casar um originador com a pessoa do CRM ja nasce com quem-quando-o-que,
 * sem nada a acrescentar aqui. Regra 9 satisfeita por construcao.
 */
