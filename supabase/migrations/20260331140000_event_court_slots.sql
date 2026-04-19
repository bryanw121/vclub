-- Host-assigned court positions for team lineup (half-court zones).
-- Independent of profiles.position (player preference).

ALTER TABLE public.event_attendees
  ADD COLUMN IF NOT EXISTS court_slot text
  CHECK (court_slot IS NULL OR court_slot IN ('O1', 'MB', 'R', 'L', 'O2', 'S'));

ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS court_slot text
  CHECK (court_slot IS NULL OR court_slot IN ('O1', 'MB', 'R', 'L', 'O2', 'S'));

COMMENT ON COLUMN public.event_attendees.court_slot IS 'Volleyball half-court zone for this event roster (host court editor).';
COMMENT ON COLUMN public.event_guests.court_slot IS 'Volleyball half-court zone for this event roster (host court editor).';
