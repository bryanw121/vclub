-- ─── Tournaments ──────────────────────────────────────────────────────────────

CREATE TABLE tournaments (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by             UUID        NOT NULL REFERENCES profiles(id),
  title                  TEXT        NOT NULL,
  description            TEXT,
  location               TEXT,
  skill_levels           TEXT[]      NOT NULL DEFAULT '{}',
  start_date             TIMESTAMPTZ NOT NULL,
  registration_deadline  TIMESTAMPTZ,
  status                 TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'cancelled')),
  format                 TEXT        NOT NULL
    CHECK (format IN ('pool_play', 'bracket', 'pool_bracket', 'round_robin')),
  bracket_type           TEXT        CHECK (bracket_type IN ('single', 'double')),
  max_teams              INT,
  min_roster_size        INT         NOT NULL DEFAULT 6,
  max_roster_size        INT         NOT NULL DEFAULT 10,
  teams_advance_per_pool INT         NOT NULL DEFAULT 2,
  has_refs               BOOLEAN     NOT NULL DEFAULT false,
  price                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  schedule_published     BOOLEAN     NOT NULL DEFAULT false,
  published_at           TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tournament Rules ─────────────────────────────────────────────────────────

CREATE TABLE tournament_rules (
  tournament_id       UUID  PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  starting_score      INT   NOT NULL DEFAULT 0,
  winning_score       INT   NOT NULL DEFAULT 25,
  deciding_set_score  INT   NOT NULL DEFAULT 15,
  win_by_margin       INT   NOT NULL DEFAULT 2,
  point_cap           INT,            -- NULL = no cap
  sets_to_win         INT   NOT NULL DEFAULT 2  -- sets needed to win the match
);

-- ─── Tournament Teams ─────────────────────────────────────────────────────────

CREATE TABLE tournament_teams (
  id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID  NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name           TEXT  NOT NULL,
  captain_user_id UUID REFERENCES profiles(id),
  status         TEXT  NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'waitlisted', 'free_agent', 'disqualified')),
  is_locked      BOOLEAN NOT NULL DEFAULT false,  -- locked teams skip auto-match
  seed           INT,                             -- bracket seeding; NULL until set
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX tournament_teams_name_unique
  ON tournament_teams (tournament_id, LOWER(name));

-- ─── Tournament Team Members ──────────────────────────────────────────────────

CREATE TABLE tournament_team_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id),
  is_captain  BOOLEAN     NOT NULL DEFAULT false,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

-- ─── Tournament Pools ─────────────────────────────────────────────────────────

CREATE TABLE tournament_pools (
  id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID  NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name           TEXT  NOT NULL,           -- e.g. "Pool A"
  display_order  INT   NOT NULL DEFAULT 0
);

-- ─── Pool ↔ Team assignment ───────────────────────────────────────────────────

CREATE TABLE tournament_pool_teams (
  pool_id  UUID NOT NULL REFERENCES tournament_pools(id) ON DELETE CASCADE,
  team_id  UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  PRIMARY KEY (pool_id, team_id)
);

-- ─── Tournament Matches ───────────────────────────────────────────────────────

CREATE TABLE tournament_matches (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id       UUID    NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  pool_id             UUID    REFERENCES tournament_pools(id),   -- NULL for bracket matches
  stage               TEXT    NOT NULL
    CHECK (stage IN ('pool_play', 'bracket', 'round_robin')),
  round               INT     NOT NULL,     -- round number within stage
  match_number        INT     NOT NULL,     -- position within round
  team_a_id           UUID    REFERENCES tournament_teams(id),
  team_b_id           UUID    REFERENCES tournament_teams(id),
  ref_team_id         UUID    REFERENCES tournament_teams(id),
  court               TEXT,
  scheduled_at        TIMESTAMPTZ,
  status              TEXT    NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'forfeit')),
  winner_id           UUID    REFERENCES tournament_teams(id),
  is_losers_bracket   BOOLEAN NOT NULL DEFAULT false,  -- double elim losers side
  bracket_round_name  TEXT,                            -- "Quarterfinal", "Final", etc.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Set Scores ───────────────────────────────────────────────────────────────

CREATE TABLE tournament_sets (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID    NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  set_number    INT     NOT NULL,
  team_a_score  INT     NOT NULL DEFAULT 0,
  team_b_score  INT     NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  UNIQUE (match_id, set_number)
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE tournaments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_pools         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_pool_teams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_sets          ENABLE ROW LEVEL SECURITY;

-- Published tournaments are visible to club members; drafts only to creator
CREATE POLICY "club members can view published tournaments"
  ON tournaments FOR SELECT USING (
    status != 'draft'
    AND EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = tournaments.club_id
        AND club_members.user_id = auth.uid()
    )
  );

CREATE POLICY "creator can view own drafts"
  ON tournaments FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "creator can insert tournaments"
  ON tournaments FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "creator can update tournaments"
  ON tournaments FOR UPDATE USING (created_by = auth.uid());

-- Rules: same visibility as the parent tournament
CREATE POLICY "rules visible with tournament"
  ON tournament_rules FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_rules.tournament_id
        AND (t.created_by = auth.uid() OR (
          t.status != 'draft'
          AND EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = t.club_id AND cm.user_id = auth.uid())
        ))
    )
  );

CREATE POLICY "creator can manage rules"
  ON tournament_rules FOR ALL USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_rules.tournament_id AND created_by = auth.uid())
  );

-- Teams: visible to club members for published tournaments
CREATE POLICY "club members can view teams"
  ON tournament_teams FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      JOIN club_members cm ON cm.club_id = t.club_id
      WHERE t.id = tournament_teams.tournament_id
        AND cm.user_id = auth.uid()
        AND t.status != 'draft'
    )
  );

CREATE POLICY "creator can manage teams"
  ON tournament_teams FOR ALL USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_teams.tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "authenticated users can register teams"
  ON tournament_teams FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "captain can update own team"
  ON tournament_teams FOR UPDATE USING (captain_user_id = auth.uid());

-- Team members
CREATE POLICY "club members can view team members"
  ON tournament_team_members FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tournament_teams tt
      JOIN tournaments t ON t.id = tt.tournament_id
      JOIN club_members cm ON cm.club_id = t.club_id
      WHERE tt.id = tournament_team_members.team_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "captain can manage team members"
  ON tournament_team_members FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tournament_teams WHERE id = tournament_team_members.team_id
        AND captain_user_id = auth.uid()
    )
  );

CREATE POLICY "creator can manage all team members"
  ON tournament_team_members FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tournament_teams tt
      JOIN tournaments t ON t.id = tt.tournament_id
      WHERE tt.id = tournament_team_members.team_id AND t.created_by = auth.uid()
    )
  );

-- Pools, pool_teams, matches, sets: creator manages; club members can read published
CREATE POLICY "club members can view pools"
  ON tournament_pools FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tournaments t JOIN club_members cm ON cm.club_id = t.club_id
      WHERE t.id = tournament_pools.tournament_id AND cm.user_id = auth.uid() AND t.status != 'draft'
    )
  );

CREATE POLICY "creator can manage pools"
  ON tournament_pools FOR ALL USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_pools.tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "club members can view pool teams"
  ON tournament_pool_teams FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tournament_pools p
      JOIN tournaments t ON t.id = p.tournament_id
      JOIN club_members cm ON cm.club_id = t.club_id
      WHERE p.id = tournament_pool_teams.pool_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "creator can manage pool teams"
  ON tournament_pool_teams FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tournament_pools p
      JOIN tournaments t ON t.id = p.tournament_id
      WHERE p.id = tournament_pool_teams.pool_id AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "club members can view matches"
  ON tournament_matches FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tournaments t JOIN club_members cm ON cm.club_id = t.club_id
      WHERE t.id = tournament_matches.tournament_id AND cm.user_id = auth.uid()
        AND (t.status != 'draft' OR t.schedule_published)
    )
  );

CREATE POLICY "creator can manage matches"
  ON tournament_matches FOR ALL USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_matches.tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "club members can view sets"
  ON tournament_sets FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tournament_matches m
      JOIN tournaments t ON t.id = m.tournament_id
      JOIN club_members cm ON cm.club_id = t.club_id
      WHERE m.id = tournament_sets.match_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "creator can manage sets"
  ON tournament_sets FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tournament_matches m
      JOIN tournaments t ON t.id = m.tournament_id
      WHERE m.id = tournament_sets.match_id AND t.created_by = auth.uid()
    )
  );

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX tournaments_club_id_idx         ON tournaments (club_id);
CREATE INDEX tournaments_created_by_idx      ON tournaments (created_by);
CREATE INDEX tournaments_status_idx          ON tournaments (status);
CREATE INDEX tournament_teams_tournament_idx ON tournament_teams (tournament_id);
CREATE INDEX tournament_members_team_idx     ON tournament_team_members (team_id);
CREATE INDEX tournament_members_user_idx     ON tournament_team_members (user_id);
CREATE INDEX tournament_matches_tournament_idx ON tournament_matches (tournament_id);
CREATE INDEX tournament_matches_pool_idx     ON tournament_matches (pool_id);
CREATE INDEX tournament_sets_match_idx       ON tournament_sets (match_id);
