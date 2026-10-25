-- Tournament multi-step writes as single transactions.
--
-- Both functions are SECURITY INVOKER: every statement runs as the caller, so the
-- existing row-level-security policies on the tournament_* tables are the
-- authorization (invitee may update their own invitation, a free agent captains
-- their own one-person team, the organizer manages pools/matches). The functions
-- only add the checks RLS cannot express ("is this invitation mine and still
-- pending?", "am I the organizer?") and make the steps all-or-nothing.
--
-- Idempotent: safe to re-run (CREATE OR REPLACE, GRANT/REVOKE are no-ops when repeated).
-- NOT applied by the app build; apply with the Supabase MCP / dashboard before the
-- client that calls them ships.

-- ─── accept_tournament_invite ─────────────────────────────────────────────────
-- Accept a pending team invitation: leave the caller's free-agent team in the same
-- tournament (if any), join the inviting team, and mark the invitation accepted.
-- Returns the team id the caller joined.
CREATE OR REPLACE FUNCTION public.accept_tournament_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.tournament_team_invitations%ROWTYPE;
  v_old record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to accept an invitation' USING ERRCODE = '28000';
  END IF;

  -- Lock the invitation so a double tap / second device cannot accept it twice.
  SELECT * INTO v_inv
  FROM public.tournament_team_invitations
  WHERE id = p_invite_id AND invitee_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer pending' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.tournament_teams
  WHERE id = v_inv.team_id AND tournament_id = v_inv.tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That team no longer exists' USING ERRCODE = 'P0002';
  END IF;

  -- Any other team the caller is on in this tournament: a free-agent placeholder is
  -- dissolved; a real team has to be left explicitly first.
  FOR v_old IN
    SELECT tt.id, tt.status
    FROM public.tournament_team_members m
    JOIN public.tournament_teams tt ON tt.id = m.team_id
    WHERE m.user_id = v_uid
      AND tt.tournament_id = v_inv.tournament_id
      AND tt.id <> v_inv.team_id
  LOOP
    IF v_old.status <> 'free_agent' THEN
      RAISE EXCEPTION 'Withdraw from your current team before accepting an invitation'
        USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.tournament_teams WHERE id = v_old.id;  -- members cascade
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not leave your free-agent entry' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  INSERT INTO public.tournament_team_members (team_id, user_id, is_captain)
  VALUES (v_inv.team_id, v_uid, false)
  ON CONFLICT (team_id, user_id) DO NOTHING;

  UPDATE public.tournament_team_invitations
  SET status = 'accepted'
  WHERE id = v_inv.id;

  RETURN v_inv.team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tournament_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_tournament_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_tournament_invite(uuid) TO authenticated;

-- ─── replace_tournament_schedule ──────────────────────────────────────────────
-- Replace a tournament's whole schedule atomically: drop the old matches and pools,
-- create the new pools (+ their team assignments) and matches, and stamp
-- tournaments.schedule_generated_at. If any step fails nothing changes.
--
-- p_matches: jsonb array of
--   { pool_key text|null, stage, round, match_number, team_a_id, team_b_id,
--     court, scheduled_at, status?, bracket_round_name? }
-- p_pools (optional, pool formats): jsonb array of
--   { key text, name text, display_order int, team_ids uuid[] }
-- A match's pool_key points at a pool's key; the pool ids are generated here.
-- Returns the number of matches inserted.
CREATE OR REPLACE FUNCTION public.replace_tournament_schedule(
  p_tournament_id uuid,
  p_matches jsonb,
  p_pools jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pool jsonb;
  v_pool_id uuid;
  v_pool_ids jsonb := '{}'::jsonb;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to edit the schedule' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments WHERE id = p_tournament_id AND created_by = v_uid
  ) THEN
    RAISE EXCEPTION 'Only the organizer can change the schedule' USING ERRCODE = '42501';
  END IF;
  IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' THEN
    RAISE EXCEPTION 'p_matches must be a JSON array' USING ERRCODE = '22023';
  END IF;

  -- Matches reference pools (no cascade), so they go first; pool_teams cascade from pools.
  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament_id;
  DELETE FROM public.tournament_pools   WHERE tournament_id = p_tournament_id;

  FOR v_pool IN SELECT * FROM jsonb_array_elements(COALESCE(p_pools, '[]'::jsonb)) LOOP
    INSERT INTO public.tournament_pools (tournament_id, name, display_order)
    VALUES (p_tournament_id, v_pool->>'name', COALESCE((v_pool->>'display_order')::int, 0))
    RETURNING id INTO v_pool_id;

    v_pool_ids := v_pool_ids || jsonb_build_object(v_pool->>'key', v_pool_id);

    INSERT INTO public.tournament_pool_teams (pool_id, team_id)
    SELECT v_pool_id, t::uuid
    FROM jsonb_array_elements_text(COALESCE(v_pool->'team_ids', '[]'::jsonb)) AS t;
  END LOOP;

  INSERT INTO public.tournament_matches (
    tournament_id, pool_id, stage, round, match_number,
    team_a_id, team_b_id, court, scheduled_at, status, bracket_round_name
  )
  SELECT
    p_tournament_id,
    CASE WHEN m.pool_key IS NULL THEN NULL ELSE (v_pool_ids->>m.pool_key)::uuid END,
    m.stage, m.round, m.match_number,
    m.team_a_id, m.team_b_id, m.court, m.scheduled_at,
    COALESCE(m.status, 'scheduled'), m.bracket_round_name
  FROM jsonb_to_recordset(p_matches) AS m(
    pool_key text, stage text, round int, match_number int,
    team_a_id uuid, team_b_id uuid, court text, scheduled_at timestamptz,
    status text, bracket_round_name text
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.tournaments
  SET schedule_generated_at = now()
  WHERE id = p_tournament_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_tournament_schedule(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_tournament_schedule(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_tournament_schedule(uuid, jsonb, jsonb) TO authenticated;
