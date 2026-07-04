/*
  Warnings:

  - Added the required column `output` to the `Map` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Map" ADD COLUMN     "output" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "mapId" INTEGER;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE SET NULL ON UPDATE CASCADE;
