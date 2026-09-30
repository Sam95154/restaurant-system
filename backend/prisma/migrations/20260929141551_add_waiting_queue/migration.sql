-- CreateEnum
CREATE TYPE "WaitingQueueStatus" AS ENUM ('WAITING', 'CALLED', 'SEATED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "WaitingQueue" (
    "id" TEXT NOT NULL,
    "tokenNumber" INTEGER NOT NULL,
    "queueToken" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "WaitingQueueStatus" NOT NULL DEFAULT 'WAITING',
    "branchId" TEXT NOT NULL,
    "assignedTableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "WaitingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitingQueue_queueToken_key" ON "WaitingQueue"("queueToken");

-- CreateIndex
CREATE INDEX "WaitingQueue_branchId_status_idx" ON "WaitingQueue"("branchId", "status");

-- CreateIndex
CREATE INDEX "WaitingQueue_branchId_createdAt_idx" ON "WaitingQueue"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "WaitingQueue_assignedTableId_idx" ON "WaitingQueue"("assignedTableId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitingQueue_branchId_tokenNumber_key" ON "WaitingQueue"("branchId", "tokenNumber");

-- AddForeignKey
ALTER TABLE "WaitingQueue" ADD CONSTRAINT "WaitingQueue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitingQueue" ADD CONSTRAINT "WaitingQueue_assignedTableId_fkey" FOREIGN KEY ("assignedTableId") REFERENCES "RestaurantTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
