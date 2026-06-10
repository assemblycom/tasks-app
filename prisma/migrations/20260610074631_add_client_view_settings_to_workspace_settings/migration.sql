-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "clientDefaultViewMode" "ViewMode" NOT NULL DEFAULT 'board',
ADD COLUMN     "clientHideSubtasks" BOOLEAN NOT NULL DEFAULT false;
