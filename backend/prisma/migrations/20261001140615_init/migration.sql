-- CreateTable
CREATE TABLE `profiles` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `avatar` VARCHAR(40) NOT NULL,
    `theme` VARCHAR(20) NOT NULL DEFAULT 'cinema',
    `isGuest` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `songs` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `artist` VARCHAR(200) NOT NULL,
    `durationSec` INTEGER NULL,
    `source` ENUM('YOUTUBE', 'UPLOAD') NOT NULL,
    `youtubeId` VARCHAR(20) NULL,
    `originalFilename` VARCHAR(255) NULL,
    `status` ENUM('QUEUED', 'PROCESSING', 'READY', 'ERROR') NOT NULL DEFAULT 'QUEUED',
    `hasInstrumental` BOOLEAN NOT NULL DEFAULT false,
    `hasVocals` BOOLEAN NOT NULL DEFAULT false,
    `hasCover` BOOLEAN NOT NULL DEFAULT false,
    `hasMelody` BOOLEAN NOT NULL DEFAULT false,
    `lyricsSource` ENUM('NONE', 'LRCLIB', 'PLAIN', 'ALIGNED', 'TRANSCRIBED', 'MANUAL') NOT NULL DEFAULT 'NONE',
    `lyricsNeedsReview` BOOLEAN NOT NULL DEFAULT false,
    `lyricsOffsetMs` INTEGER NOT NULL DEFAULT 0,
    `playCount` INTEGER NOT NULL DEFAULT 0,
    `addedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `songs_youtubeId_key`(`youtubeId`),
    INDEX `songs_status_idx`(`status`),
    INDEX `songs_artist_idx`(`artist`),
    FULLTEXT INDEX `songs_title_artist_idx`(`title`, `artist`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` VARCHAR(191) NOT NULL,
    `songId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `step` ENUM('DOWNLOAD', 'SEPARATE', 'LYRICS', 'COVER', 'MELODY', 'FINALIZE') NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `message` VARCHAR(255) NULL,
    `position` INTEGER NOT NULL,
    `sourcePath` VARCHAR(500) NULL,
    `device` VARCHAR(40) NULL,
    `error` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `jobs_status_position_idx`(`status`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `playlists` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `playlist_items` (
    `playlistId` VARCHAR(191) NOT NULL,
    `songId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `playlist_items_playlistId_position_idx`(`playlistId`, `position`),
    PRIMARY KEY (`playlistId`, `songId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorites` (
    `profileId` VARCHAR(191) NOT NULL,
    `songId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`profileId`, `songId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `performances` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `songId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `voiceGuideUsed` BOOLEAN NOT NULL DEFAULT false,
    `pitchScore` INTEGER NULL,
    `audienceScore` INTEGER NULL,
    `finalScore` INTEGER NULL,

    INDEX `performances_profileId_startedAt_idx`(`profileId`, `startedAt`),
    INDEX `performances_songId_idx`(`songId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `votes` (
    `id` VARCHAR(191) NOT NULL,
    `performanceId` VARCHAR(191) NOT NULL,
    `voterToken` VARCHAR(64) NOT NULL,
    `stars` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `votes_performanceId_voterToken_key`(`performanceId`, `voterToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(60) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `songs` ADD CONSTRAINT `songs_addedById_fkey` FOREIGN KEY (`addedById`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_songId_fkey` FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `playlists` ADD CONSTRAINT `playlists_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `playlist_items` ADD CONSTRAINT `playlist_items_playlistId_fkey` FOREIGN KEY (`playlistId`) REFERENCES `playlists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `playlist_items` ADD CONSTRAINT `playlist_items_songId_fkey` FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_songId_fkey` FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `performances` ADD CONSTRAINT `performances_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `performances` ADD CONSTRAINT `performances_songId_fkey` FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `votes` ADD CONSTRAINT `votes_performanceId_fkey` FOREIGN KEY (`performanceId`) REFERENCES `performances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
