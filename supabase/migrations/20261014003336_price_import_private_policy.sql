-- Explicit deny policy documents the RPC-only access model; no raw table grants.
CREATE POLICY no_direct_access ON private.price_imports FOR ALL TO authenticated USING(false) WITH CHECK(false);
