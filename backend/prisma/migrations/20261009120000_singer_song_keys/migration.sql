-- AlterTable
ALTER TABLE `songs` DROP COLUMN `keyShift`;

-- CreateTable
CREATE TABLE `singer_song_keys` (
    `profileId` VARCHAR(191) NOT NULL,
    `songId` VARCHAR(191) NOT NULL,
    `keyShift` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `singer_song_keys_songId_idx`(`songId`),
    PRIMARY KEY (`profileId`, `songId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `singer_song_keys` ADD CONSTRAINT `singer_song_keys_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `singer_song_keys` ADD CONSTRAINT `singer_song_keys_songId_fkey` FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
