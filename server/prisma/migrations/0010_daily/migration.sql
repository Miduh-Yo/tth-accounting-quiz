-- CreateTable
CREATE TABLE "DailyDeck" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "questionIds" TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySession" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "total" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "bestCombo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAnswer" (
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "selectedIds" TEXT[],
    "isCorrect" BOOLEAN NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAnswer_pkey" PRIMARY KEY ("sessionId","questionId")
);

-- CreateTable
CREATE TABLE "UserProgress" (
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastCreditedDate" TEXT,

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","code")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "date" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "DailySetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "questionsPerDeck" INTEGER NOT NULL DEFAULT 10,
    "repeatGapDays" INTEGER NOT NULL DEFAULT 30,
    "leaderboardEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DailySetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyDeck_date_key" ON "DailyDeck"("date");

-- CreateIndex
CREATE INDEX "DailySession_userId_idx" ON "DailySession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySession_deckId_userId_key" ON "DailySession"("deckId", "userId");

-- AddForeignKey
ALTER TABLE "DailySession" ADD CONSTRAINT "DailySession_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "DailyDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySession" ADD CONSTRAINT "DailySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAnswer" ADD CONSTRAINT "DailyAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DailySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
