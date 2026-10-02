-- CreateTable
CREATE TABLE `sing_requests` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `songId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sing_requests_position_idx`(`position`),
    UNIQUE INDEX `sing_requests_profileId_songId_key`(`profileId`, `songId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sing_requests` ADD CONSTRAINT `sing_requests_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sing_requests` ADD CONSTRAINT `sing_requests_songId_fkey` FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
