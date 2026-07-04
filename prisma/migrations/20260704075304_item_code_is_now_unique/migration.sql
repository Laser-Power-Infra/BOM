/*
  Warnings:

  - You are about to drop the column `uploadSessionId` on the `ItemSchedule` table. All the data in the column will be lost.
  - You are about to drop the `UploadSession` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[itemCode]` on the table `ItemSchedule` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ItemSchedule" DROP CONSTRAINT "ItemSchedule_uploadSessionId_fkey";

-- AlterTable
ALTER TABLE "ItemSchedule" DROP COLUMN "uploadSessionId";

-- DropTable
DROP TABLE "UploadSession";

-- CreateIndex
CREATE UNIQUE INDEX "ItemSchedule_itemCode_key" ON "ItemSchedule"("itemCode");
