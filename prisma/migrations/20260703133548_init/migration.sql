-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('gt', 'lt', 'eq');

-- CreateEnum
CREATE TYPE "RuleOutput" AS ENUM ('PLUS_PLUS', 'PLUS', 'ZERO', 'MINUS', 'MINUS_MINUS');

-- CreateTable
CREATE TABLE "Map" (
    "id" SERIAL NOT NULL,
    "mapA" TEXT NOT NULL,
    "mapB" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" SERIAL NOT NULL,
    "file1Name" TEXT NOT NULL,
    "file2Name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "output" "RuleOutput" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemSchedule" (
    "id" SERIAL NOT NULL,
    "uploadSessionId" INTEGER NOT NULL,
    "itemScheduleName" TEXT NOT NULL,
    "bomType" TEXT,
    "option2" TEXT,
    "ccvSioplas" TEXT,
    "cuTape" TEXT,
    "cuTapePlusMinus" TEXT,
    "alCu" TEXT,
    "alCuPlusMinus" TEXT,
    "alloy" TEXT,
    "alloyPlusMinus" TEXT,
    "armour" TEXT,
    "armourPlusMinus" TEXT,
    "semicon" TEXT,
    "semiconPlusMinus" TEXT,
    "insulation" TEXT,
    "insulationPlusMinus" TEXT,
    "pvcInner" TEXT,
    "pvcInnerPlusMinus" TEXT,
    "pvcOuter" TEXT,
    "pvcOuterPlusMinus" TEXT,
    "filler" TEXT,
    "fillerPlusMinus" TEXT,
    "polyt" TEXT,
    "polytPlusMinus" TEXT,
    "spclConstruction" TEXT,
    "spclConstructionPlusMinus" TEXT,
    "finalOutput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemSchedule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ItemSchedule" ADD CONSTRAINT "ItemSchedule_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
