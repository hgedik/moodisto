-- CreateEnum
CREATE TYPE "MusicProvider" AS ENUM ('YOUTUBE');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('NORMAL', 'PRIORITY', 'DJ', 'PLAY_NEXT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'QUEUED', 'PLAYING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "QueueItemState" AS ENUM ('QUEUED', 'PLAYING', 'COMPLETED', 'REMOVED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlaybackState" AS ENUM ('IDLE', 'LOADING', 'PLAYING', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BlockedRuleType" AS ENUM ('TRACK', 'CHANNEL', 'KEYWORD');

-- CreateEnum
CREATE TYPE "VenueUserRole" AS ENUM ('OWNER', 'MANAGER', 'DJ');

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "logoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "duplicateCooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_users" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "VenueUserRole" NOT NULL DEFAULT 'MANAGER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_request_pricing" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "normalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "normalPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "priorityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priorityPriceMinor" INTEGER NOT NULL DEFAULT 2000,
    "djEnabled" BOOLEAN NOT NULL DEFAULT true,
    "djPriceMinor" INTEGER NOT NULL DEFAULT 3000,
    "playNextEnabled" BOOLEAN NOT NULL DEFAULT true,
    "playNextPriceMinor" INTEGER NOT NULL DEFAULT 5000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_request_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_qr_codes" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tableLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "venue_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "venueId" TEXT,
    "tableLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "providerTrackId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "channelName" TEXT,
    "channelId" TEXT,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_search_cache" (
    "id" TEXT NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_requests" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "customerSessionId" TEXT,
    "trackId" TEXT NOT NULL,
    "requestType" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "tableLabel" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3),
    "playingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "song_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_items" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "songRequestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "state" "QueueItemState" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_states" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "queueItemId" TEXT,
    "trackId" TEXT,
    "state" "PlaybackState" NOT NULL DEFAULT 'IDLE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_leases" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "songRequestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_music_rules" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "type" "BlockedRuleType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_music_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");

-- CreateIndex
CREATE INDEX "venues_active_idx" ON "venues"("active");

-- CreateIndex
CREATE INDEX "venues_latitude_longitude_idx" ON "venues"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "venue_users_email_key" ON "venue_users"("email");

-- CreateIndex
CREATE INDEX "venue_users_venueId_idx" ON "venue_users"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "venue_request_pricing_venueId_key" ON "venue_request_pricing"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "venue_qr_codes_token_key" ON "venue_qr_codes"("token");

-- CreateIndex
CREATE INDEX "venue_qr_codes_venueId_active_idx" ON "venue_qr_codes"("venueId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_sessionToken_key" ON "customer_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "customer_sessions_venueId_idx" ON "customer_sessions"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_provider_providerTrackId_key" ON "tracks"("provider", "providerTrackId");

-- CreateIndex
CREATE INDEX "music_search_cache_expiresAt_idx" ON "music_search_cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "music_search_cache_provider_normalizedQuery_key" ON "music_search_cache"("provider", "normalizedQuery");

-- CreateIndex
CREATE INDEX "song_requests_venueId_status_createdAt_idx" ON "song_requests"("venueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "song_requests_venueId_trackId_status_idx" ON "song_requests"("venueId", "trackId", "status");

-- CreateIndex
CREATE INDEX "song_requests_venueId_createdAt_idx" ON "song_requests"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "song_requests_customerSessionId_createdAt_idx" ON "song_requests"("customerSessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "queue_items_songRequestId_key" ON "queue_items"("songRequestId");

-- CreateIndex
CREATE INDEX "queue_items_venueId_state_position_idx" ON "queue_items"("venueId", "state", "position");

-- CreateIndex
CREATE UNIQUE INDEX "player_states_venueId_key" ON "player_states"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "player_states_queueItemId_key" ON "player_states"("queueItemId");

-- CreateIndex
CREATE UNIQUE INDEX "player_leases_venueId_key" ON "player_leases"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_songRequestId_key" ON "payments"("songRequestId");

-- CreateIndex
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_providerPaymentId_key" ON "payments"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "blocked_music_rules_venueId_idx" ON "blocked_music_rules"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_music_rules_venueId_type_value_key" ON "blocked_music_rules"("venueId", "type", "value");

-- AddForeignKey
ALTER TABLE "venue_users" ADD CONSTRAINT "venue_users_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_request_pricing" ADD CONSTRAINT "venue_request_pricing_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_qr_codes" ADD CONSTRAINT "venue_qr_codes_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_requests" ADD CONSTRAINT "song_requests_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_requests" ADD CONSTRAINT "song_requests_customerSessionId_fkey" FOREIGN KEY ("customerSessionId") REFERENCES "customer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_requests" ADD CONSTRAINT "song_requests_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_songRequestId_fkey" FOREIGN KEY ("songRequestId") REFERENCES "song_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "queue_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_leases" ADD CONSTRAINT "player_leases_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_songRequestId_fkey" FOREIGN KEY ("songRequestId") REFERENCES "song_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_music_rules" ADD CONSTRAINT "blocked_music_rules_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
