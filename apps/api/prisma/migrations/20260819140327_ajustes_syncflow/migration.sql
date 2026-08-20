-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "eventType" TEXT NOT NULL DEFAULT 'CORRIDA',
ADD COLUMN     "location" TEXT,
ADD COLUMN     "locationUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "trailerUrl" TEXT;

-- CreateIndex
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");
