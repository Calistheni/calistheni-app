/*
  Warnings:

  - Added the required column `updatedAt` to the `Park` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ParkEquipment" DROP CONSTRAINT "ParkEquipment_equipmentId_fkey";

-- DropForeignKey
ALTER TABLE "ParkEquipment" DROP CONSTRAINT "ParkEquipment_parkId_fkey";

-- AlterTable
ALTER TABLE "Park" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "ParkEquipment" ADD CONSTRAINT "ParkEquipment_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkEquipment" ADD CONSTRAINT "ParkEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
