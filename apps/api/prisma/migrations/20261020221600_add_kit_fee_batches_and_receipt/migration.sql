-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'DATE';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "totalSlots" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "adminFeeRate" DECIMAL(5,2),
ADD COLUMN     "hasKit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kitSizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "registrationOpensAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "athleteBirthDate" TIMESTAMP(3),
ADD COLUMN     "athleteGender" TEXT,
ADD COLUMN     "receiptCode" TEXT;

-- CreateIndex
CREATE INDEX "Batch_categoryId_idx" ON "Batch"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_receiptCode_key" ON "Registration"("receiptCode");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Category.totalSlots = availableSlots + (registrations non-cancelled)
UPDATE "Category"
SET "totalSlots" = "availableSlots" + COALESCE((
  SELECT COUNT(*)::int
  FROM "Registration"
  WHERE "Registration"."categoryId" = "Category"."id"
    AND "Registration"."status" NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')
), 0)
WHERE "totalSlots" = 0;

-- Backfill Event.registrationOpensAt = createdAt where null
UPDATE "Event"
SET "registrationOpensAt" = "createdAt"
WHERE "registrationOpensAt" IS NULL;

-- Backfill Batch.categoryId: associate with event's category if null
UPDATE "Batch" b
SET "categoryId" = (
  SELECT c.id FROM "Category" c WHERE c."eventId" = b."eventId" ORDER BY c."createdAt" ASC LIMIT 1
)
WHERE b."categoryId" IS NULL;
