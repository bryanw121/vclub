-- Cap EventCard avatar embeds: list queries call this instead of embedding all attendees+profiles.
CREATE OR REPLACE FUNCTION public.get_event_card_attendee_previews(p_event_ids uuid[])
RETURNS TABLE (
  event_id uuid,
  user_id uuid,
  username text,
  first_name text,
  last_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ranked.event_id,
    ranked.user_id,
    p.username,
    p.first_name,
    p.last_name,
    p.avatar_url
  FROM (
    SELECT
      ea.event_id,
      ea.user_id,
      row_number() OVER (PARTITION BY ea.event_id ORDER BY ea.joined_at ASC) AS rn
    FROM event_attendees ea
    WHERE ea.status = 'attending'
      AND ea.event_id = ANY (p_event_ids)
  ) ranked
  JOIN profiles p ON p.id = ranked.user_id
  WHERE ranked.rn <= 3;
$$;

REVOKE ALL ON FUNCTION public.get_event_card_attendee_previews(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_card_attendee_previews(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_card_attendee_previews(uuid[]) TO service_role;
