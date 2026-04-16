ALTER TABLE "events"
  ADD COLUMN "latitude"          DOUBLE PRECISION,
  ADD COLUMN "longitude"         DOUBLE PRECISION,
  ADD COLUMN "meeting_point"     TEXT,
  ADD COLUMN "meeting_point_lat" DOUBLE PRECISION,
  ADD COLUMN "meeting_point_lng" DOUBLE PRECISION;
