/*
  Warnings:

  - You are about to drop the column `createdAt` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `hashedKey` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `key` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `lastUsedAt` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `api_keys` table. All the data in the column will be lost.
  - The `permissions` column on the `api_keys` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[key_id]` on the table `api_keys` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `hashed_key` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `key_id` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_userId_fkey";

-- DropIndex
DROP INDEX "api_keys_key_key";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "createdAt",
DROP COLUMN "expiresAt",
DROP COLUMN "hashedKey",
DROP COLUMN "isActive",
DROP COLUMN "key",
DROP COLUMN "lastUsedAt",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "hashed_key" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "key_id" TEXT NOT NULL,
ADD COLUMN     "last_used_at" TIMESTAMP(3),
ADD COLUMN     "rate_limit" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
DROP COLUMN "permissions",
ADD COLUMN     "permissions" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "createdAt",
DROP COLUMN "firstName",
DROP COLUMN "isActive",
DROP COLUMN "lastName",
DROP COLUMN "role",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_id_key" ON "api_keys"("key_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
