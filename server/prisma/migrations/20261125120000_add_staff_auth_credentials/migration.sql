-- M05.19: credential material for server-managed staff authentication.
-- This migration is intentionally prepared locally and must not be applied to Neon
-- until staff provisioning and secret management are approved.
ALTER TABLE "users"
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 1;
