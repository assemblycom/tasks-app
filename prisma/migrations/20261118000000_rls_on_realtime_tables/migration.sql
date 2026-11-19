ALTER TABLE "Tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskTemplates" ENABLE ROW LEVEL SECURITY;

-- Copilot tokens aren't Supabase JWTs, so rows can't be scoped per workspace here; the client filters.
CREATE POLICY realtime_read ON "Tasks" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY realtime_read ON "TaskTemplates" FOR SELECT TO anon, authenticated USING (true);
