-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('auto', 'manual');

-- AlterTable
ALTER TABLE "ImportRow" ADD COLUMN     "categorySource" "CategorySource" NOT NULL DEFAULT 'auto';
