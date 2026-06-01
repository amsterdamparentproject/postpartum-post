-- Migration 009: add lat/lng to activities.events and activities.resources
-- Enables proximity filtering on the match page without PostGIS.
-- Populate via geocoding backfill after running this migration.

ALTER TABLE activities.events ADD COLUMN latitude numeric(9, 6);
ALTER TABLE activities.events ADD COLUMN longitude numeric(9, 6);
ALTER TABLE activities.resources ADD COLUMN latitude numeric(9, 6);
ALTER TABLE activities.resources ADD COLUMN longitude numeric(9, 6);

-- Indexes
CREATE INDEX events_lat_lng_idx    ON activities.events    (latitude, longitude);
CREATE INDEX resources_lat_lng_idx ON activities.resources (latitude, longitude);
