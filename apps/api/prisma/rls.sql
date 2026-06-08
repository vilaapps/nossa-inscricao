-- =====================================================================
-- SyncFlow - Configuração de Row Level Security (RLS) e Isolamento
-- =====================================================================

-- 1. Habilitar RLS em todas as tabelas de domínio sensível
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Batch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Registration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;

-- Forçar RLS mesmo para os donos das tabelas se necessário (opcional, para testes rígidos de roles)
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Event" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Batch" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Coupon" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Registration" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;

-- 2. Políticas para a tabela "Tenant" (Apenas o próprio Tenant lê/escreve seus dados)
CREATE POLICY tenant_isolation_policy ON "Tenant"
  FOR ALL
  USING (id = current_setting('app.current_tenant_id', true))
  WITH CHECK (id = current_setting('app.current_tenant_id', true));

-- 3. Políticas para a tabela "Event"
-- - Leitores públicos podem visualizar eventos com status 'PUBLISHED'
-- - Organizadores (tenants) podem gerenciar apenas os eventos do seu tenant
CREATE POLICY event_public_select_policy ON "Event"
  FOR SELECT
  USING (status = 'PUBLISHED');

CREATE POLICY event_tenant_policy ON "Event"
  FOR ALL
  USING (tenantId = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenantId = current_setting('app.current_tenant_id', true));

-- 4. Políticas para a tabela "Category"
-- - Leitores públicos podem ver categorias de eventos publicados
-- - Organizadores gerenciam categorias do seu próprio tenant
CREATE POLICY category_public_select_policy ON "Category"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Event"
      WHERE "Event".id = "Category".eventId AND "Event".status = 'PUBLISHED'
    )
  );

CREATE POLICY category_tenant_policy ON "Category"
  FOR ALL
  USING (tenantId = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenantId = current_setting('app.current_tenant_id', true));

-- 5. Políticas para a tabela "Batch" (Lotes)
-- - Leitores públicos podem ver lotes de eventos publicados
-- - Organizadores gerenciam lotes do seu próprio tenant
CREATE POLICY batch_public_select_policy ON "Batch"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Event"
      WHERE "Event".id = "Batch".eventId AND "Event".status = 'PUBLISHED'
    )
  );

CREATE POLICY batch_tenant_policy ON "Batch"
  FOR ALL
  USING (tenantId = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenantId = current_setting('app.current_tenant_id', true));

-- 6. Políticas para a tabela "Coupon" (Cupons de desconto)
-- - Cupons NUNCA possuem leitura pública (apenas validação programática pela API)
-- - Organizadores gerenciam cupons do seu próprio tenant
CREATE POLICY coupon_tenant_policy ON "Coupon"
  FOR ALL
  USING (tenantId = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenantId = current_setting('app.current_tenant_id', true));

-- 7. Políticas para a tabela "Registration" (Inscrições)
-- - Participantes podem ler suas próprias inscrições
-- - Organizadores gerenciam inscrições do seu próprio tenant
CREATE POLICY registration_participant_policy ON "Registration"
  FOR SELECT
  USING (userId = current_setting('app.current_user_id', true));

CREATE POLICY registration_tenant_policy ON "Registration"
  FOR ALL
  USING (tenantId = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenantId = current_setting('app.current_tenant_id', true));

-- 8. Políticas para a tabela "Payment" (Dados de Faturamento e Cobranças)
-- - Participantes podem consultar a cobrança ativa da sua inscrição (para efetuar pagamento)
-- - Organizadores gerenciam pagamentos do seu próprio tenant
CREATE POLICY payment_participant_policy ON "Payment"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Registration"
      WHERE "Registration".id = "Payment".registrationId 
        AND "Registration".userId = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY payment_tenant_policy ON "Payment"
  FOR ALL
  USING (tenantId = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenantId = current_setting('app.current_tenant_id', true));
