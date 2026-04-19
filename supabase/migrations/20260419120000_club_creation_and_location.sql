-- Club creation for authenticated users, automatic owner membership, join-policy fix,
-- and location_label for regional discovery.

-- 1) Location (city / metro / region) — required for new clubs; backfill existing rows.
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS location_label text;

UPDATE public.clubs
SET location_label = 'San Diego, CA'
WHERE location_label IS NULL OR trim(location_label) = '';

ALTER TABLE public.clubs
  ALTER COLUMN location_label SET NOT NULL;

COMMENT ON COLUMN public.clubs.location_label IS 'Human-readable city, metro, or region for discovery and search.';

CREATE INDEX IF NOT EXISTS idx_clubs_location_label_lower ON public.clubs (lower(location_label));

-- 2) After a club row is inserted, add the creator as owner (bypasses fragile client-side ordering).
CREATE OR REPLACE FUNCTION public.add_club_owner_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_club_created_insert_owner ON public.clubs;
CREATE TRIGGER on_club_created_insert_owner
  AFTER INSERT ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.add_club_owner_after_insert();

-- 3) Allow any authenticated user to create a club they own (created_by must match auth uid).
CREATE POLICY "Authenticated users create clubs"
  ON public.clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 4) Self-join open clubs must be as member only — prevents claiming owner on someone else's club.
DROP POLICY IF EXISTS "Users join open clubs" ON public.club_members;
CREATE POLICY "Users join open clubs"
  ON public.club_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'member'
    AND (SELECT c.membership_type FROM public.clubs c WHERE c.id = club_id) = 'open'
  );
