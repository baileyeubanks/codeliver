-- Applied to CCO-DB with Bailey's explicit approval on 2026-09-09.
-- Preserve existing exposed schemas and all table grants/RLS policies.
-- Rollback: ALTER ROLE authenticator RESET pgrst.db_schemas;
-- NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, finance, co_production';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
