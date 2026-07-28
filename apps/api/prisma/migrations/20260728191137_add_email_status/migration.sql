-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "status" "EmailStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Email_userId_status_idx" ON "Email"("userId", "status");
