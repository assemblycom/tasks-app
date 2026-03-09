/*
  - This query renames viewers to associations and add isShared column.
*/
-- AlterTable
ALTER TABLE "Tasks" 
RENAME COLUMN "viewers" TO "associations";

ALTER TABLE "Tasks" 
ADD COLUMN "isShared" BOOLEAN NOT NULL DEFAULT false;
