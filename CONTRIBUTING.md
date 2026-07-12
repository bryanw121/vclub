# Contributing

This repo follows a lightweight, gated trunk-based workflow. Everything lands
on `main` behind a green CI run — there is no beta branch or staging
environment (single mainline + one Supabase project since July 2026).

Code conventions (types, theme tokens, shared styles, gesture layering, data
fetching rules) live in [`CLAUDE.md`](CLAUDE.md) — read it before your first
change. This file covers **process**: how work is tracked, branched, verified,
and merged.

## Workflow

1. **Pick or create an issue.** Work is tracked as **GitHub Issues**;
   milestones set direction. Parallelization labels order the backlog:
   - `wave-1` — ready now, no code dependencies
   - `wave-2` — blocked by another issue (the body says which)
   - `needs-design` — design-first; resolve the open questions in the issue
     before writing code
2. **Comment "in progress" on the issue** the moment you pick it up, so the
   board shows who's on what.
3. **Branch from `main`**: `area/short-slug` (e.g. `perf/loading-optimizations-p1`,
   `docs/contributing`, `feat/points-ledger`). One issue = one lane = one branch = one PR.
4. **Open a PR into `main`.** Fill in the PR template (see **PR requirements**).
5. **CI must be green** before merge. Watch the checks after every push —
   don't fire-and-forget.

## PR requirements

- **"How to verify / reproduce" is filled with concrete steps** — runnable
  commands and/or a click-through. This is how changes get verified without
  reading the diff. Be honest about scope: state what was actually exercised
  vs. what is assumed.
- **Design decisions are stated explicitly** — a short numbered list of the
  non-obvious calls you made and why (e.g. "kept the explicit FK name over the
  column hint because…").
- **E2E tests at the outermost affected surface are the default, not a bonus.**
  A behavior change ships with a test that drives the flow a user sees:
  - user-visible web/app behavior → a Playwright spec in `e2e/` driving the
    static export (add `testID`s as needed — filter chips and event tabs
    already follow this pattern);
  - pure internal logic with no observable flow change → unit tests are
    enough, but say so in the PR body.

  **Coverage comes first when refactoring thinly-tested code**: land a
  safety-net e2e that drives the surface as its *own* commit, then refactor
  against it (this is how the `event/[id].tsx` god-component was split).
- **New dynamic routes need a rewrite rule.** CI serves the static export with
  `npx serve dist`; dynamic routes (`/event/[id]`, `/chat/[id]`, …) only
  resolve because of `public/serve.json` (copied into `dist` on export). Add a
  rewrite there whenever you create one, in the same PR.

## CI

Every push/PR to `main` runs `.github/workflows/ci.yml`:

- **Unit tests** — `npm test` (Jest) + `npm run typecheck` (tsc, strict).
- **Playwright E2E** — builds the real web export, serves it, and runs
  `e2e/` against it. This is the same artifact users get; a dev server is not
  a substitute.

### Reading a red e2e — noise vs. signal

- **Ambient `TypeError: Failed to fetch` console noise** appears throughout
  runs (even fully green ones): it indicates a degraded runner↔Supabase link
  and aborted in-flight fetches. It's a *symptom*, not usually the failing
  assertion — don't stop your diagnosis at it; find the actual `expect(...)`
  error for the failing test.
- **The historic flaky family** (chat context-menu, edit banner, reply
  quotes, reactions, delete) was a fixed-wait race, not network: the app
  intentionally ignores right-click on a message still in its optimistic
  `_sending` state, and on a slow link the send confirmation outlived the
  test's fixed sleep. Fixed by making `openContextMenu` retry until the menu
  opens. If e2e flakes regress, prefer condition-based waits
  (`expect().toPass()`, `waitFor`) over `waitForTimeout` sleeps — don't just
  widen timeouts.
- A test failing **twice with the same real assertion error** is real.
  Genuine one-off infra failures still happen; `gh run rerun <id> --failed`
  is fine *after* you've read the error, not instead of reading it.
- The e2e write-tests (chat sends, events join/leave) hit the **live shared
  DB** — a red can also mean seed data drifted (see **Database & test data**).

## Running locally

```bash
npm ci
npx expo start            # dev: iOS / Android / web from Expo dev tools
npx expo start --web      # dev: web directly

npm run typecheck         # gate 1
npm test                  # gate 2

# Gate 3 — mirror CI exactly (static export, not the dev server):
npm run build:web
npx serve dist -p 8081 &
npx playwright test       # or: npx playwright test e2e/events.spec.ts
```

Environment: put `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
in `.env` (never committed).

## Database & test data

- **One Supabase project** serves dev, e2e, and production. There is no
  isolated test database — e2e write-tests (join/leave, comments) hit live
  tables. Be deliberate about destructive changes.
- **Schema changes** are applied directly (Supabase MCP `apply_migration` or
  the dashboard). The files in `supabase/migrations/` are **not in sync** with
  the applied history — never replay them onto a fresh project; baseline from
  `supabase db dump` instead.
- **E2E seeds**: tests log in as `bryanw121` and rely on seeded events
  ("Friday Night Open Play", "Monday Night Round Robin") plus a seed
  conversation defined in `e2e/chat.spec.ts`. Seeds are fixed-date and can age
  out of the *upcoming* feed, which reds the tag-filter test through no fault
  of your diff — bump the seed dates forward if that happens (a durable
  relative-date fix is tracked in #12).
- **RLS is the security boundary.** Anything the client shouldn't be able to
  do must be blocked by policy, not by UI.

## Releases & change tracking

The app deploys continuously (Vercel builds `main` on every merge), so a
"release" here is a **dated checkpoint with notes**, not an install artifact.
Change tracking is mechanical, not manual:

- **PR titles are the changelog.** Squash-merge keeps one descriptive commit
  per change; there is no hand-maintained `CHANGELOG.md` to rot.
- **Label your PRs** (`enhancement`, `performance`, `bug`, `security`, `test`,
  `ci`, `documentation`) — `.github/release.yml` groups release notes by
  those labels. Unlabeled PRs fall into "Other changes"; `skip-changelog`
  excludes a PR entirely.
- **Cutting a release** (when meaningful work has accumulated — after a
  milestone, or every few weeks):

  ```bash
  gh release create vX.Y.Z --generate-notes
  ```

  Notes auto-generate from merged PRs since the previous tag. Bump
  `package.json`'s `version` in the same breath so the two stay aligned.

## Parallel / agent work

Independent `wave-1` issues can be developed concurrently — including by
separate agents in isolated git worktrees — each in its own lane
(branch + PR). Each issue body has a **Dependencies / Parallelization**
section listing file/area collisions; respect it. Coordinate on shared
surfaces (`types/index.ts`, `constants/styles.ts`, shared components) via the
issue tracker rather than racing edits.

**Stacked branches** (B based on A's unmerged PR): set the open PR's branch as
your base; the moment the base merges, rebase onto `main`, retarget the PR,
and push — GitHub's auto-retarget can leave a stale diff failing CI otherwise.

**Sync before starting new work**: `git fetch` + fast-forward `main`, prune
merged branches, and re-read files others changed. When mainline moves under
an open lane, rebase promptly.
