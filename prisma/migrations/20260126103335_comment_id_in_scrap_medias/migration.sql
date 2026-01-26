-- AlterTable
ALTER TABLE "ScrapMedias" ADD COLUMN     "commentId" UUID;

-- AddForeignKey
ALTER TABLE "ScrapMedias" ADD CONSTRAINT "ScrapMedias_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
