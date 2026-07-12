-- Live driver GPS tracking
-- One row per driver, upserted every ~30s by the driver portal / mobile app.

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  heading NUMERIC,
  speed_kmh NUMERIC,
  accuracy_m NUMERIC,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- History table for playback / performance analysis (optional insert, kept 30 days)
CREATE TABLE IF NOT EXISTS driver_location_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  driver_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_loc_history ON driver_location_history(driver_id, recorded_at DESC);

ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_location_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_locations_all" ON driver_locations;
CREATE POLICY "driver_locations_all" ON driver_locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "driver_loc_history_all" ON driver_location_history;
CREATE POLICY "driver_loc_history_all" ON driver_location_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
