-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 10.00;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "metadata" JSONB;
