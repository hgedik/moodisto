-- Local catalogue search: trigram matching over the tracks we already know about, so a query
-- reworded by the guest does not spend provider quota on a track we have stored for months.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "tracks"
  ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastPlayedOkAt" TIMESTAMP(3),
  ADD COLUMN "playbackBlockedAt" TIMESTAMP(3);

-- Rough backfill for rows that predate the column. It is deliberately not the application's
-- folding rule: existing rows get refreshed with the exact value the next time a search or a
-- request touches them, and an approximate value still beats an empty index in the meantime.
UPDATE "tracks"
SET "searchText" = lower(
  regexp_replace(
    concat_ws(' ', "title", "artist", "channelName"),
    '[^[:alnum:][:space:]]+', ' ', 'g'
  )
);

CREATE INDEX "tracks_searchText_idx" ON "tracks" USING GIN ("searchText" gin_trgm_ops);
