-- List/card aggregates: PostgREST embed counts must use attending-only rows to match
-- event detail (non-waitlisted attendees + attending +1 guests).
CREATE OR REPLACE VIEW public.event_attendees_attending
WITH (security_invoker = true) AS
SELECT *
FROM public.event_attendees
WHERE status = 'attending';

CREATE OR REPLACE VIEW public.event_guests_attending
WITH (security_invoker = true) AS
SELECT *
FROM public.event_guests
WHERE status = 'attending';

GRANT SELECT ON public.event_attendees_attending TO anon, authenticated, service_role;
GRANT SELECT ON public.event_guests_attending TO anon, authenticated, service_role;
