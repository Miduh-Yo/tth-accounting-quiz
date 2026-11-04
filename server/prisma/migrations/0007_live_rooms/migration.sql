-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "live" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liveStartedAt" TIMESTAMP(3);

