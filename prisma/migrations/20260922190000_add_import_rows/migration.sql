-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "committed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "rawDate" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "rawAmount" TEXT NOT NULL,
    "parsedDate" TIMESTAMP(3),
    "parsedAmount" DECIMAL(65,30),
    "parseError" TEXT,
    "categoryId" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "includeInCommit" BOOLEAN NOT NULL DEFAULT true,
    "committedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_committedTransactionId_key" ON "ImportRow"("committedTransactionId");

-- CreateIndex
CREATE INDEX "ImportRow_importBatchId_idx" ON "ImportRow"("importBatchId");

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

