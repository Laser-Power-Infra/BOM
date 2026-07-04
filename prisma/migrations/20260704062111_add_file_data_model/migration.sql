-- CreateTable
CREATE TABLE "FileData" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheetName" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileData_pkey" PRIMARY KEY ("id")
);
