-- Add geocoordinate cache columns to members.
-- Populated lazily by the matcher API route via Nominatim; avoids re-geocoding
-- the same zipcode on every monthly run.
alter table postpartumpost.members
  add column if not exists lat float8,
  add column if not exists lng float8;

create index if not exists members_geo_idx
  on postpartumpost.members (lat, lng)
  where lat is not null and lng is not null;
