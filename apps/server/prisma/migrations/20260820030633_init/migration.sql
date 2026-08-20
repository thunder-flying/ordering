-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `openidDigest` CHAR(64) NOT NULL,
    `nickname` VARCHAR(40) NOT NULL DEFAULT '微信用户',
    `avatarUploadId` VARCHAR(191) NULL,
    `onboardingCompletedAt` DATETIME(3) NULL,
    `firstLoginAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastLoginAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_openidDigest_key`(`openidDigest`),
    UNIQUE INDEX `users_avatarUploadId_key`(`avatarUploadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_sessions_tokenHash_key`(`tokenHash`),
    INDEX `user_sessions_userId_idx`(`userId`),
    INDEX `user_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(20) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `categories_enabled_deletedAt_sortOrder_idx`(`enabled`, `deletedAt`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dishes` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `imageUploadId` VARCHAR(191) NULL,
    `name` VARCHAR(40) NOT NULL,
    `description` VARCHAR(300) NOT NULL DEFAULT '',
    `priceCents` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dishes_imageUploadId_key`(`imageUploadId`),
    INDEX `dishes_categoryId_published_deletedAt_sortOrder_idx`(`categoryId`, `published`, `deletedAt`, `sortOrder`),
    INDEX `dishes_published_deletedAt_name_idx`(`published`, `deletedAt`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorites` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `dishId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `favorites_dishId_idx`(`dishId`),
    UNIQUE INDEX `favorites_userId_dishId_key`(`userId`, `dishId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_lists` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `totalCents` INTEGER NOT NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `saved_lists_userId_updatedAt_idx`(`userId`, `updatedAt`),
    UNIQUE INDEX `saved_lists_userId_idempotencyKey_key`(`userId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `list_items` (
    `id` VARCHAR(191) NOT NULL,
    `savedListId` VARCHAR(191) NOT NULL,
    `dishId` VARCHAR(191) NULL,
    `dishNameSnapshot` VARCHAR(40) NOT NULL,
    `priceCentsSnapshot` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `note` VARCHAR(100) NOT NULL DEFAULT '',
    `position` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `list_items_dishId_idx`(`dishId`),
    UNIQUE INDEX `list_items_savedListId_position_key`(`savedListId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `uploads` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `purpose` ENUM('DISH_IMAGE', 'AVATAR') NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `originalMediaType` VARCHAR(100) NOT NULL,
    `detectedMediaType` VARCHAR(100) NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `referenceState` ENUM('UNREFERENCED', 'REFERENCED', 'PENDING_DELETE') NOT NULL DEFAULT 'UNREFERENCED',
    `pendingDeleteAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uploads_storageKey_key`(`storageKey`),
    INDEX `uploads_ownerUserId_idx`(`ownerUserId`),
    INDEX `uploads_referenceState_pendingDeleteAt_idx`(`referenceState`, `pendingDeleteAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_avatarUploadId_fkey` FOREIGN KEY (`avatarUploadId`) REFERENCES `uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dishes` ADD CONSTRAINT `dishes_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dishes` ADD CONSTRAINT `dishes_imageUploadId_fkey` FOREIGN KEY (`imageUploadId`) REFERENCES `uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_dishId_fkey` FOREIGN KEY (`dishId`) REFERENCES `dishes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_lists` ADD CONSTRAINT `saved_lists_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `list_items` ADD CONSTRAINT `list_items_savedListId_fkey` FOREIGN KEY (`savedListId`) REFERENCES `saved_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `list_items` ADD CONSTRAINT `list_items_dishId_fkey` FOREIGN KEY (`dishId`) REFERENCES `dishes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `uploads` ADD CONSTRAINT `uploads_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
