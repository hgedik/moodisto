-- A venue may never hold two active queue slots at the same position.
--
-- The index is partial: completed, removed and failed items keep their historical position value
-- without competing for the live slot. Every queue mutation serialises on the venue row
-- (SELECT ... FROM venues WHERE id = $1 FOR UPDATE), so this index is a safety net that turns a
-- logic bug into a failed transaction rather than a corrupted queue.
CREATE UNIQUE INDEX "queue_items_active_position_key"
    ON "queue_items" ("venueId", "position")
    WHERE "state" IN ('QUEUED', 'PLAYING');

-- A venue may never have two active queue items in the PLAYING state.
CREATE UNIQUE INDEX "queue_items_single_playing_key"
    ON "queue_items" ("venueId")
    WHERE "state" = 'PLAYING';
