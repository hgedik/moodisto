-- Tracks what has already been spent of a provider's daily allowance, so the ledger survives an
-- API restart and is shared by every instance.
CREATE TABLE "provider_quota_usage" (
    "id" TEXT NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "spentUnits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_quota_usage_pkey" PRIMARY KEY ("id")
);

-- One row per provider per quota day; the atomic upsert that books units relies on this.
CREATE UNIQUE INDEX "provider_quota_usage_provider_periodKey_key" ON "provider_quota_usage"("provider", "periodKey");
