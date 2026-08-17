-- MIGRATION 32 - O BOLETO EMITIDO NO BANCO ENTRA NO SISTEMA.
--
-- ============================================================================
-- O QUE FOI MEDIDO ANTES, NO PROPRIO REPOSITORIO (17/08/2026)
--
-- Ha UM caminho para uma linha de `boleto` nascer: `src/repos/boleto.ts` ->
-- `registrar()`, que chama a `PortaDeCobranca`. Essa porta depende do
-- certificado A1, que e a UNICA pendencia do projeto (`PENDENCIAS.md` §1) e e
-- compra externa, sem previsao. O padrao injetado e `COBRANCA_NAO_CONFIGURADA`, e
-- ele recusa com 503 nomeado - o que esta certo e NAO muda aqui.
--
-- O que a medicao mostrou e que a operacao nao para junto: o boleto e emitido a
-- mao, no internet banking da cooperativa, e o PDF vai para o cliente. Esse
-- boleto e real e e pagavel. O sistema nao sabe que ele existe, e as tres
-- consequencias sao silenciosas:
--
--   1. `GET /faturas/:id/boleto` devolve 404, e a aba Faturas escreve "esta
--      fatura nao tem boleto" para uma fatura que tem;
--   2. `documento.paraFatura` cai no ramo do Pix estatico, e o documento sai
--      cobrando por um meio que NAO concilia - o dinheiro chega sem dizer de
--      quem e - enquanto existe um boleto com nosso numero;
--   3. a conferencia aritmetica de `linha-digitavel.ts` (valor e vencimento
--      dentro dos 44 digitos) nunca roda contra esse boleto: ela le a tabela, e
--      na tabela nao ha linha.
--
-- ============================================================================
-- POR QUE UMA COLUNA `origem`, E NAO REUSAR O QUE JA HA
--
-- Um boleto que NOS registramos e um boleto que ALGUEM NOS CONTOU sao fatos
-- diferentes, e o schema nao tinha como distingui-los: os dois teriam
-- `status = 'registrado'` com `nosso_numero` preenchido. Tres lugares do codigo
-- ja dependem dessa distincao, e sem a coluna os tres errariam calado:
--
--   `situacaoDosEmAberto`   a consulta ativa do `PRD` 6 perguntaria a Sicoob por
--                           um `nosso_numero` LIDO DE UM PDF. O identificador do
--                           titulo na API de Cobranca v3 nao e necessariamente o
--                           rotulo impresso, e uma consulta com identificador
--                           errado nao devolve "nao e nosso": devolve erro, que
--                           vira `registrarDivergencia` em cima de um boleto que
--                           esta certo;
--   `payload_envio`         fica NULO no importado, e isso e a verdade: nada
--                           subiu. Deduzir a origem da ausencia do payload seria
--                           regra implicita numa coluna opcional;
--   a tela                  "registrado" sem dizer POR QUEM esconde justamente o
--                           que o operador precisa saber para conferir no banco.
--
-- A coluna nasce com DEFAULT `api_sicoob` porque toda linha que existir antes
-- desta migration veio - ou teria vindo - da porta. Em producao, medido em
-- 17/08: ZERO linhas em `boleto`, porque o A1 nunca existiu. O default esta certo
-- para o passado e para o futuro: quem grava importado grava explicito.
--
-- ============================================================================
-- REGRA 5: nada de segredo entra por este caminho. O que se transcreve de um
-- boleto e linha digitavel, nosso numero e BR Code do Pix - tres coisas
-- IMPRESSAS no papel que vai para o cliente. `boleto_payload_sem_segredo`
-- continua valendo e nao foi tocada.
--
-- REGRA 9: a escrita passa por `repos/boleto.ts` -> `importar()`, dentro da
-- unidade de trabalho transacional de sempre, com a trilha que toda escrita de
-- dado de negocio ja grava.
--
-- REGRA 11: nenhum indice novo. A coluna nao entra em chave de navegacao
-- nenhuma - quem procura boleto continua procurando por `fatura_id`.

CREATE TYPE origem_boleto AS ENUM ('api_sicoob', 'importado');

COMMENT ON TYPE origem_boleto IS
  'De onde a linha veio. `api_sicoob`: registrado por nos pela PortaDeCobranca. '
  '`importado`: emitido a mao no portal do banco e TRANSCRITO para ca - o sistema '
  'nao falou com a Sicoob em nenhum momento deste caminho.';

ALTER TABLE boleto
  ADD COLUMN origem origem_boleto NOT NULL DEFAULT 'api_sicoob';

COMMENT ON COLUMN boleto.origem IS
  'CLAUDE.md regra 10 no schema: "registrado por nos" e "registrado por uma pessoa '
  'no banco" sao fatos diferentes, e colapsa-los faria a consulta ativa do PRD 6 '
  'perguntar ao banco por um nosso_numero lido de um PDF.';

/*
 * O IMPORTADO SEM LINHA DIGITAVEL NAO EXISTE, e o banco e quem garante.
 *
 * Para o boleto da porta, `linha_digitavel` e legitimamente NULA enquanto ele
 * esta `pendente` - a linha nasce antes da chamada, de proposito (ver o cabecalho
 * de `registrar()`). Para o importado nao ha "antes": ele so entra porque alguem
 * tem o papel na mao, e a linha e a UNICA coisa de onde o resto sai - o codigo de
 * barras e remontado dela, o valor e o vencimento sao lidos de dentro dela.
 *
 * Uma linha ausente aqui produziria um boleto `registrado` que a faixa de
 * pagamento imprime VAZIO, e `linhaDigitavelFormatada('')` devolve null sem
 * levantar nada. E o modo de falha que este projeto recusa: ausencia desenhada
 * como se fosse conteudo.
 */
ALTER TABLE boleto
  ADD CONSTRAINT boleto_importado_tem_linha CHECK (
    origem <> 'importado'
    OR (linha_digitavel IS NOT NULL AND codigo_barras IS NOT NULL)
  );

COMMENT ON CONSTRAINT boleto_importado_tem_linha ON boleto IS
  'Boleto importado nasce da linha digitavel conferida - os 44 digitos sao '
  'REMONTADOS dela em src/dominio/boleto-importado.ts, nunca digitados. Sem os dois '
  'a faixa de pagamento imprimiria vazio sem levantar erro.';
