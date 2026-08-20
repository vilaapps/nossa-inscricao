-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "errorData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemLog_source_idx" ON "SystemLog"("source");
