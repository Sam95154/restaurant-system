-- CreateEnum
CREATE TYPE "PayrollMode" AS ENUM ('MANUAL');

-- AlterTable
ALTER TABLE "PayrollRecord" ADD COLUMN     "payrollMode" "PayrollMode" NOT NULL DEFAULT 'MANUAL';
