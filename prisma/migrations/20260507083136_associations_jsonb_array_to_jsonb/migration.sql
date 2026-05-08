-- Convert "Tasks"."associations" from jsonb[] (Postgres array of jsonb) to jsonb (single jsonb holding an array).
-- Existing values are preserved: to_jsonb() turns the postgres array into an equivalent jsonb array.
-- Any NULL rows are coalesced to '[]'.
ALTER TABLE "Tasks"
  ALTER COLUMN "associations" DROP DEFAULT,
  ALTER COLUMN "associations" TYPE JSONB
    USING coalesce(to_jsonb("associations"), '[]'::jsonb),
  ALTER COLUMN "associations" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "associations" SET NOT NULL;
