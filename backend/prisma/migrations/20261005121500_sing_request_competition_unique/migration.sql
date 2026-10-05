-- CreateIndex
CREATE UNIQUE INDEX `sing_requests_profileId_songId_competitionId_key` ON `sing_requests`(`profileId`, `songId`, `competitionId`);

-- DropIndex
DROP INDEX `sing_requests_profileId_songId_key` ON `sing_requests`;
