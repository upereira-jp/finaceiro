-- MIGRATION 27 - A REMOCAO DO LAYOUT POSICIONADO. Decidida pelo dono em
-- 14/08/2026, fechando o passo 6 do §13.4 de
-- `REFERENCIA-fatura-unificada-2026-08-13.md`.
--
-- O QUE SAI. As duas tabelas da migration 23 - `bloco_do_documento` e
-- `layout_do_documento` -, que guardavam o documento como BLOCO POSICIONADO em
-- milimetro: coordenada, largura, altura, papel, orientacao e margens.
--
-- ============================================================ POR QUE AGORA
--
-- Porque o custo de tirar chegou a ZERO, e isso foi MEDIDO e nao estimado.
--
-- O layout posicionado tinha cinco tipos de bloco: `logo`, `texto`, `linha`,
-- `pagamento` e `tabela_de_campos`. A folha do modelo G3 ja cobria quatro deles
-- desde 14/08 pela manha; a tabela de valores entrou na mesma tarde. Com ela, a
-- folha fixa e SUPERCONJUNTO do que a composicao posicionada produzia - nao ha
-- documento que so o editor soubesse desenhar.
--
-- Ate esse ponto a resposta era outra, e esta escrita em tres documentos: o
-- editor era o UNICO documento que existia, e retira-lo deixaria o sistema sem
-- fatura para imprimir. Nao era teimosia, era ordem.
--
-- =================================================== O QUE **NAO** SAI, E POR QUE
--
-- `campo_do_documento` FICA, inteira. Ela responde uma pergunta diferente:
-- QUAIS campos aparecem, com que ROTULO e em que ORDEM. O modelo G3 substituiu a
-- POSICAO, nao o CONTEUDO - e a tabela de valores da folha obedece a
-- configuracao do tenant exatamente como antes. Quem renomeou "Crédito injetado"
-- continua com o nome dele impresso.
--
-- `identidade_de_cobranca` e `logo_de_cobranca` ficam: a logo e da folha.
-- `chave_pix` fica: e a faixa de pagamento.
--
-- ======================================================== A ORDEM DO DROP
--
-- `bloco_do_documento` primeiro. Ela referencia `layout_do_documento` por FK
-- composta, e dropar a referenciada antes exigiria CASCADE - que e um jeito de
-- nao saber o que se esta apagando. Sem CASCADE, se sobrar dependente que
-- ninguem mapeou, o banco RECUSA e a migration para. E o que se quer.
--
-- ==================================================== O QUE SE PERDE DE VERDADE
--
-- O layout que cada tenant tiver gravado. Medido em producao em 14/08, antes de
-- escrever isto e contra a `DIRECT_URL`: **zero linhas em `layout_do_documento` e
-- zero em `bloco_do_documento`**. Ninguem nunca abriu o editor - as tabelas
-- existiram por onze dias sem receber um registro.
--
-- E `campo_do_documento` tem **15 linhas** na mesma medicao. As duas superficies
-- pareciam gemeas e nao eram: a de CONTEUDO foi usada, a de POSICAO nao. E a
-- confirmacao mais direta de que a que fica e a certa.
--
-- E irreversivel por natureza: `DROP TABLE` nao volta com `migrate`. O que volta
-- e a estrutura, pela migration 23 que continua no historico - o DADO nao.

DROP TABLE IF EXISTS bloco_do_documento;
DROP TABLE IF EXISTS layout_do_documento;

-- Os dois enums existiam SO para essas colunas. Deixa-los seria tipo orfao no
-- catalogo, e `CAT-*` nao os pegaria porque nenhum invariante fala de enum sem
-- uso. Sem CASCADE, de novo: se alguma coluna ainda os usa, o banco recusa.
DROP TYPE IF EXISTS tipo_de_bloco;
DROP TYPE IF EXISTS papel_do_documento;
DROP TYPE IF EXISTS orientacao_do_documento;
DROP TYPE IF EXISTS alinhamento_do_bloco;
DROP TYPE IF EXISTS peso_do_bloco;
