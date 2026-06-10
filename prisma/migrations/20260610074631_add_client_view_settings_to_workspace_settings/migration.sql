-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "clientDefaultViewMode" "ViewMode",
ADD COLUMN     "clientLockShowSubtasks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientLockViewMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientShowSubtasks" BOOLEAN;
