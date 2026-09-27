-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "staffKeyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_staffKeyHash_key" ON "Restaurant"("staffKeyHash");

