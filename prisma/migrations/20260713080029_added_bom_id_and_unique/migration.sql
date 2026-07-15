/*
  Warnings:

  - A unique constraint covering the columns `[itemCode,bomId]` on the table `ItemSchedule` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `bomId` to the `ItemSchedule` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ItemSchedule_itemCode_key";

-- AlterTable
ALTER TABLE "ItemSchedule" ADD COLUMN     "bomId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ItemSchedule_itemCode_bomId_key" ON "ItemSchedule"("itemCode", "bomId");
