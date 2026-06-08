-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "asaasApiKey";

-- RenameColumn and RecreateIndex
DROP INDEX "Payment_asaasPaymentId_key";
ALTER TABLE "Payment" RENAME COLUMN "asaasPaymentId" TO "gatewayPaymentId";
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "Payment"("gatewayPaymentId");
