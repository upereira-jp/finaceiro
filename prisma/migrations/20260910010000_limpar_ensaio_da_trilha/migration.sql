-- ============================================================================
-- Apaga a linha de ENSAIO que o teste de 09/09/2026 deixou em `ato_externo_log`
-- ============================================================================
/*
 * POR QUE ISTO E UMA MIGRATION E NAO UM `DELETE` NO psql.
 *
 * `ato_externo_log` e append-only POR PRIVILEGIO, e isso foi medido contra
 * producao no mesmo dia: a role de runtime leva `permission denied` em UPDATE,
 * em DELETE e ate em INSERT direto. Essa recusa nao e incomodo - e a propriedade
 * inteira. Uma trilha da qual se apaga quando incomoda nao e trilha.
 *
 * Apagar pela conexao de dono, a mao, funcionaria e custaria caro de outro
 * jeito: estabeleceria que se apaga da trilha, e o precedente nao distingue
 * linha de ensaio de linha de verdade. Aqui a remocao ENTRA NO REGISTRO - fica
 * no git, fica em `_prisma_migrations`, e quem contar as linhas daqui a um ano e
 * achar um buraco encontra a explicacao dele.
 *
 * O QUE ELA APAGA, e o `ato` e a garantia: so as linhas cujo ato foi criado por
 * ensaio. Nenhum ato de negocio se chama assim - os de verdade sao
 * `religar_aviso_de_pagamento`, nomeados em `src/cobranca/agenda.ts`.
 *
 * A GUARDA EXISTE PORQUE `DELETE` NAO TEM INVERSO. Se um dia alguem copiar esta
 * migration para apagar outra coisa e o `WHERE` pegar demais, o `RAISE` aborta a
 * transacao inteira e nada se perde.
 */
DO $bloco$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM ato_externo_log WHERE ato IN ('ensaio_da_trilha', 'ensaio_da_suite');

  IF n > 5 THEN
    RAISE EXCEPTION 'a limpeza do ensaio pegaria % linhas, e o esperado e no maximo 5', n
      USING HINT = 'Ou alguem rodou o ensaio muitas vezes, ou o WHERE esta pegando demais. '
                   'Nada foi apagado: confira antes de afrouxar este numero.';
  END IF;

  DELETE FROM ato_externo_log WHERE ato IN ('ensaio_da_trilha', 'ensaio_da_suite');
  RAISE NOTICE 'limpeza do ensaio: % linha(s) removida(s) de ato_externo_log', n;
END $bloco$;
