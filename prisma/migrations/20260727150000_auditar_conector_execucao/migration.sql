-- Migration 15 - o gatilho de auditoria que a migration 14 deixou de fora.
--
-- POR QUE E MIGRATION NOVA E NAO CORRECAO DA 14: a 14 ja foi aplicada. Editar
-- migration aplicada muda o checksum e o `migrate deploy` seguinte acusa drift.
-- O historico fica com o erro visivel, que e o certo - a trilha e datada.
--
-- O ERRO, e ele e meu: a migration 14 nao criou o gatilho de proposito, com dois
-- argumentos. O primeiro continua valendo e nao bastava; o segundo estava
-- ERRADO na conta.
--
--   Argumento 1, valido: `conector_execucao` e registro, nao dado de negocio, e
--   a migration 10 estabeleceu que "log nao se audita, se torna imutavel",
--   deixando `auditoria` e `acesso_plataforma_log` fora do invariante 17.
--
--   Argumento 2, ERRADO: "auditar encheria a auditoria de imagem de contador a
--   cada lote". A conta real: um ciclo faz UM insert e UM update por lote, e um
--   ciclo tipico tem UM lote - hoje sao 48 ganhos contra um lote de 1.000.
--   Rodando de hora em hora, sao ~48 linhas de trilha por dia por tenant. Nao e
--   enchente; era estimativa sem numero.
--
-- Com o argumento 2 caindo, sobra so o 1 - e ele justificaria acrescentar
-- `conector_execucao` a lista branca do invariante 17. Mas mexer numa lista
-- branca de invariante para acomodar codigo novo e afrouxar a regra pelo lado
-- errado: o teste G2 existe justamente porque, antes da migration 10, a
-- cobertura de auditoria era de 4 tabelas em 13 e as 4 escolhidas nao incluiam
-- dono_usina nem originador, onde moram as chaves PIX. Uma lista branca que
-- cresce toda vez que uma tabela nova da trabalho volta a ser aquilo.
--
-- O custo de obedecer e uma linha e ~48 linhas de trilha por dia. O custo de
-- afrouxar e o precedente.

CREATE TRIGGER auditar_conector_execucao
  AFTER INSERT OR UPDATE OR DELETE ON conector_execucao
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

COMMENT ON TABLE conector_execucao IS
  'Registro de execucao do conector, nao cadastro. SPEC-002 §3. `recusados` e o '
  'numero que importa: o conector RECUSA linha ambigua em vez de adivinhar, e '
  'contagem crescente e o sinal de que alguem precisa olhar o CRM. Auditada como '
  'as outras dezesseis (invariante 17); DELETE revogado para app_financeiro.';
