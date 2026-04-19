-- Upcoming-events feed: WHERE event_date >= ? ORDER BY event_date
-- (Child tables are usually covered by composite PKs starting with event_id.)
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events (event_date);
