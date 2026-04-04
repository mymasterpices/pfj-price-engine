-- CreateTable
CREATE TABLE "DailyRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "gold18k" REAL NOT NULL DEFAULT 0,
    "gold14k" REAL NOT NULL DEFAULT 0,
    "gold9k" REAL NOT NULL DEFAULT 0,
    "diaNat" REAL NOT NULL DEFAULT 0,
    "diaLab" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyRate_shop_key" ON "DailyRate"("shop");
