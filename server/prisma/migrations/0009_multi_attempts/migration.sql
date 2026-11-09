-- DropIndex
DROP INDEX "Attempt_examId_userId_key";

-- CreateIndex
CREATE INDEX "Attempt_examId_userId_idx" ON "Attempt"("examId", "userId");
