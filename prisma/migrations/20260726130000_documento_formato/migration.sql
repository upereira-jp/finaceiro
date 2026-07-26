-- SPEC-001 R7 - formato do documento no banco, ja pronto para o CNPJ alfanumerico.
--
-- CALENDARIO: a Receita Federal comeca a emitir CNPJ ALFANUMERICO em 31/07/2026.
-- As 12 primeiras posicoes aceitam A-Z junto com digitos; os 2 DVs seguem
-- numericos. Os dois formatos coexistem e ambos sao validos para todos os fins.
--
-- A R7 dizia "armazenado so com digitos". A partir de 31/07 isso REJEITA CNPJ
-- VALIDO. Corrigida: sem mascara, maiuscula, e letra PRESERVADA.
--
-- O CHECK confere FORMATO, nunca digito verificador. A R9 e explicita: documento
-- invalido e gravado - ele bloqueia a ativacao do contrato, nao o cadastro. Um
-- CHECK de DV aqui contradiria a R9 e travaria a migracao da carteira.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cliente','dono_usina','originador'] LOOP
    EXECUTE format($f$
      ALTER TABLE %I ADD CONSTRAINT %I CHECK (
        documento IS NULL
        OR documento ~ '^[0-9]{11}$'            -- CPF: 11 digitos, sem letra
        OR documento ~ '^[0-9A-Z]{12}[0-9]{2}$' -- CNPJ: 12 alfanumericos + 2 DV
      )
    $f$, t, t || '_documento_formato');
  END LOOP;
END $$;

COMMENT ON COLUMN cliente.documento IS
  'Sem mascara, maiusculo. CPF: 11 digitos. CNPJ: 12 posicoes alfanumericas '
  '(A-Z e 0-9) + 2 digitos verificadores numericos - formato vigente a partir '
  'de 31/07/2026, coexistindo com o numerico. NAO remova letras na '
  'normalizacao: isso destroi CNPJ valido. Digito verificador NAO e conferido '
  'aqui, por causa da R9.';
