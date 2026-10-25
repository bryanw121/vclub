# vteam — Steering Document

## What This App Is
A volleyball club app. Members find and join open play sessions and tournaments, track their stats and reputation, and get notified about club activity. Built with React Native + Expo for iOS, Android, and web.

---

## Product Roadmap & User Stories

### ✅ Done / In Progress
- **Calendar view for events** — week and month views, event dots, daily event list

### 🔲 To Do

#### Event Tags
- Events are tagged as **"open play"** or **"tournament"** (predefined list, extensible later)
- Host selects the tag(s) when creating an event
- Users can filter the event feed by tag

#### Teams
- Both open play and tournament events support teams
- Teams are **randomized by default**
- Host can pin specific players to be on the same team before randomization runs
- Team assignment happens after the RSVP window closes / host triggers it

#### Points System
- Users earn points by attending events — points are awarded **only after the event ends**
- If a user leaves an event before it ends, they earn **no points**
- Point values by event type:
  - Open play → **2 points**
  - Tournament → **5 points**
- Points accumulate on the user's profile (no spending mechanic yet — designed so one can be added later without restructuring)

#### Kudos
- After an event ends, attendees can give kudos to other players who attended the **same event**
- Each user can give up to **5 kudos per event** (distributed however they like across other attendees)
- Kudos are displayed as a count on the recipient's profile

#### Profile — Position & Kudos
- Users set their volleyball position on their profile
- Positions: **Setter, Libero, Outside Hitter (OH), Defensive Specialist (DS), Opposite Hitter (OPP)**
- Profile shows total kudos received and points accumulated
- Profile shows previous events attended

#### Notifications
- Build notification infrastructure so triggers can be added incrementally
- Example trigger: user receives kudos
- Full trigger list to be defined later — do not hardcode a fixed set

#### Tournaments Tab
- Separate tab showing upcoming and past tournaments
- Tournament structure:
  1. **Pool play** (group stage)
  2. **Single elimination bracket** (default; bracket type configurable by host)
  3. **Trophies** for 1st, 2nd, 3rd place (ties for 3rd are allowed)
- Host configures rules when creating the tournament (bracket type, tie rules, team pinning, etc.)
- Trophy winners are stored on the winner's profile

#### Feature Requests & Bug Submission
- A form in the Profile tab lets users submit feedback
- On submit, sends an email to **bryan.wu.121@gmail.com**
- The destination email should be stored in a single config constant (not hardcoded in the form) so it can be changed easily

#### Forgot Password
- Standard password reset flow via Supabase Auth email

#### Security
- Details TBD — implement standard best practices (input validation, RLS policies in Supabase, no secrets in client code)

#### Ads *(future — design with this in mind)*
- Two ad formats planned: **banner ads** and **sponsored events** in the feed
- Points will eventually be usable to remove ads
- No implementation needed now, but avoid coupling the feed and profile screens in ways that make inserting ads painful

#### Migrate Reclub Profile *(parked — details TBD)*
- Users will eventually be able to import their profile from a separate platform called "reclub"
- Scope and data mapping TBD

---

## Tech Stack
- **React Native 0.81 / Expo SDK 54** with Expo Router (file-based routing)
- **React Native Web** for browser support
- **Supabase** for auth (email/password) and PostgreSQL database
- **TypeScript** (strict mode)

## Project Layout
```
app/                         # Expo Router routes (screens compose hooks + components)
  _layout.tsx                # Root: providers, auth redirect (guest gate via utils/authGate)
  +html.tsx                  # Web document shell
  (auth)/                    # login, register, reset-password
  (app)/
    _layout.tsx              # Stack + desktop-web sidebar (derives from constants/navigation)
    (tabs)/
      _layout.tsx            # Mobile bottom tab bar + create menu
      (main)/
        _layout.tsx          # Pager hosting the four tabs (swipe on native + web)
        index.tsx            # Events tab (calendar + feed)
        profile/index.tsx    # Profile tab
      clubs.tsx              # Clubs tab
      chat.tsx               # Chat tab (conversation list)
      settings/              # account, hosted, history, cheers, silenced, notifications, feedback, badges
    event/[id].tsx           # Event detail
    club/[id].tsx, club/create.tsx
    chat/[id].tsx            # Conversation
    profile/[id].tsx         # Another user's profile
    tournament/[id].tsx, tournament/create.tsx
    host.tsx                 # Create / edit event, templates
    notifications.tsx
components/
  ui/                        # Design-system primitives (see "UI primitives")
  event/ events/ host/ profile/ tournament/   # Feature components for those screens
  (top level)                # Shared widgets: Button, Input, EventCard, Pager, Toast, MessageBubble, ...
hooks/
  event/                     # useEventData, useEventAttendance, useEventComments, ... (keys.ts, derive.ts)
  tournament/                # api.ts + useTournamentData / useTournamentActions
  (top level)                # One hook per concern: useMyProfile, useMonthEvents, useConversations, useMessages, ...
lib/
  query.ts                   # useQuery / useMutation / invalidate / setQueryData (module-level cache)
  realtime.ts                # useRealtimeChannel (ref-counted channel registry)
  supabase.ts                # createClient (the only client)
  env.ts, sentry.ts, sessionUser.ts, ...
contexts/                    # session.tsx (the one auth listener), tabs.ts (pager/shell state), webNav.ts
constants/
  theme.ts                   # Design tokens (colors, gradients, spacing, font, radius, shadow)
  styles.ts                  # Shared StyleSheet (`shared.*`)
  navigation.ts              # TABS, CREATE_MENU, tab helpers: the only definition of the tab bar
  layout.ts                  # BREAKPOINTS
  cache.ts                   # STALE windows
  selects.ts                 # PostgREST select fragments
  copy.ts, tournamentCopy.ts # User-facing strings and labels
  index.ts                   # Barrel: import { theme, shared, STALE, ... } from constants
types/
  database.ts                # GENERATED from the live schema: do not edit by hand
  index.ts                   # App types derived from it
utils/
  routes.ts                  # routes.* builders, isAppPath, toRoute
  authGate.ts                # Which paths need an account; post-sign-in redirect
  index.ts                   # Date and formatting helpers (cleanDate, formatEventDate, ...)
e2e/, __tests__/, supabase/ (functions + migrations), scripts/, docs/
```

## Database Schema
The schema lives in Supabase; `types/database.ts` is generated from it
(`supabase gen types`) and is the source of truth for tables, columns, views and RPC
signatures. Regenerate it after every schema change; never hand-edit it. Key domain tables:

- **profiles**: one row per user (auto-created on signup); public columns are in `PROFILE_BRIEF_SELECT`
- **events** / **event_attendees** (and the `event_attendees_attending` / `_waitlisted` views) / **event_guests** / **event_cohosts** / **event_comments** / **event_tags** + **tags**
- **user_event_templates**: saved host templates
- **external_sessions**: sessions from other Austin venues (read-only here)
- **clubs** / **club_members** / **club_posts** (+ comments, likes)
- **conversations** / **conversation_members** / **messages** / **message_reactions** / **chat_silences**
- **tournaments** and its children (`tournament_teams`, `_team_members`, `_matches`, `_pools`, `_rules`, `_prizes`, invitations, join requests, comments)
- **cheers**, **user_badges**, **notifications**, **push_tokens**, **feedback_submissions**
- **app_events**: insert-only usage metrics (see "Usage metrics")

Also **user_settings** (private per-user settings: home city, seen banners).

Custom RPCs include `get_email_by_username` (username login), `get_my_conversations`,
`get_event_card_attendee_previews`, `get_feed_span` (the Events feed for a date range in one call; `useMonthEvents` falls back to separate queries if it is missing), `mark_conversation_read`, `mark_notification_read`.

## Key Architectural Decisions

### No third-party state management
Only React hooks (`useState`, `useRef`, `useContext`). Server state lives in `lib/query` (module-level cache behind `useQuery`/`useMutation`); global UI state lives in context (`SessionProvider` for auth, `TabsShellContext`/`TabsActiveContext` for the pager).

### Custom tab navigation
The app does NOT use Expo Router's built-in `<Tabs>`. Instead: a custom `<Pager>` (`(tabs)/(main)/_layout.tsx`) + a custom bottom bar (`(tabs)/_layout.tsx`) on mobile and a sidebar (`(app)/_layout.tsx`) on wide web. This enables swipe animations that work on web too. All three derive from `TABS` / `CREATE_MENU` in `constants/navigation.ts`: add, reorder or rename a tab there and nowhere else. `useTabsShell()` (`contexts/tabs.ts`) lets child screens call `goToTab(index)` without circular imports; use `useTabsActive()` only where the active index is needed (it re-renders on every switch).

### Cross-platform components use `.web.tsx`
`DatePickerField.tsx` = native (`@react-native-community/datetimepicker`).
`DatePickerField.web.tsx` = HTML5 `<input type="datetime-local">`.
Metro/webpack picks the right file automatically.

### Web static render and hydration
The web export pre-renders HTML at build time, with no viewport, session, clock or device storage. On web the root layout (`app/_layout.tsx`) renders only the splash until the client has hydrated, then mounts the app tree (still under the splash). So screens may branch on window size, `useSession()`, `Date` or `localStorage` freely; don't move app UI outside that gate, or React error #418 (hydration mismatch) comes back. The guest e2e spec checks for it.

### Sentry
Import `Sentry` from `lib/sentry`, never `@sentry/react-native` directly. On web, `lib/sentry.web.ts` loads the SDK in its own chunk after first paint and queues calls until then; `components/SentryErrorBoundary.web.tsx` is the matching boundary. Native uses `lib/sentry.ts` unchanged.

### Bundle size (web)
Import icons per family (`import Ionicons from '@expo/vector-icons/Ionicons'`), never from the `@expo/vector-icons` barrel: that pulls every icon set's glyph map into the main bundle.

### Gesture layering
The `Pager` uses `onMoveShouldSetPanResponder` (bubble phase) to claim tab swipes. Inner components (WeekStrip, Calendar wrapper) also use bubble phase — since they're more inner, their handlers fire first and absorb the gesture before it reaches Pager. Do not use capture phase (`onMoveShouldSetPanResponderCapture`) for inner gesture handlers; that breaks the layering.

### Guest browsing
Nobody has to sign in to look around. Guests see Events, Clubs, event pages, club pages and other players' profiles; the Chat and Profile tabs render `SignInPrompt`, and the Events/Clubs headers show `SignInButton` (top right) instead of the bell / Create.
- Read the user with `useSession()` (`userId`, `isGuest`), never `supabase.auth.getUser()` — that is a network call to the Auth server every time. Outside React, use `getSessionUser()` from `lib/sessionUser`.
- Actions that need an account call `const requireSignIn = useRequireSignIn()` and `if (!requireSignIn()) return` — guests go to login and come back to the same page.
- Account-only routes are listed in `utils/authGate.ts` (`isProtectedPath`); the root layout bounces guests on those to login. Add new account-only routes there.
- RLS: anything a guest screen reads must have a SELECT policy for `anon` (events, attendees, profiles, clubs, tags already do).

### Sessions from other Austin venues (Schelagg)
`external_sessions` holds sessions other venues and groups run (Volleyworld, ACES, ATX Beach, Reclub meets...). They come from Schelagg ("schedule aggregator", `bryanw121/schelagg`), a separate project that scrapes schedules for any sport and region.

**Schelagg is independent of this database, and must stay that way.** It has no credentials here and never writes here; vteam imports none of its code. Schelagg publishes a public feed (`https://bryanw121.github.io/schelagg/data/occurrences.json`: dated occurrences for every sport and region, sport-specific fields under `attributes`), and vteam pulls it: the `ingest-schelagg-feed` pg_cron job runs `public.ingest_schelagg_feed()` hourly at :25. That function (migration `20261025193000_ingest_schelagg_feed.sql`, uses the `http` extension, fixed URL, no client EXECUTE) keeps only `sport = volleyball`, `region = austin`, upserts rows, and deletes upcoming rows no longer in the feed (cancellations). It skips a feed older than 12h and never deletes when the feed has no matching rows. Change the mapping there, not in Schelagg.

vteam only reads the table (anon SELECT policy). `useMonthEvents` fetches it with events/tournaments, skipping rows not refreshed within `EXTERNAL_SESSION_MAX_AGE_MS` (a stopped ingest shows nothing rather than possibly-cancelled sessions), and `utils/feedItems.ts` normalizes rows into `EventWithDetails` with `_external` set; the feed renders those with `ExternalSessionCard`, which links out to the venue's sign-up (no RSVP). They show only for the viewer's region (`external_sessions.region`, matched against the home city in `user_settings` via `useFeedRegion()`; guests and people without a city get `DEFAULT_FEED_REGION`, Austin, while we pilot there), under All and the type/surface filters, never under Mine or Not Full.

### Location and private settings
`user_settings` (owner-only RLS) holds per-user settings that don't belong on the public `profiles` row: `home_city_id` (→ `major_cities`, set from the profile editor) and `seen_banners`. Read and write it with `useUserSettings()`; it is cache-scoped to the user (`settings` prefix in `useCacheUserScope`).

### One-time banners
For information someone needs once, the first time they open a screen (e.g. "we're piloting in Austin"): add an entry to `BANNERS` in `constants/banners.ts` and render `<OneTimeBanner banner={BANNERS.x} />` where it should appear. It shows on the first visit and is recorded as seen immediately (on the device, and in `user_settings.seen_banners` when signed in), so it never returns even if not dismissed. To show an updated message to everyone again, change the entry's `id`. Don't use it for anything a person must act on.

### Guided tours
A tour is an ordered list of steps in `TOURS` (`constants/tours.ts`): target id, title, one plain sentence, optional `tab` (the tour switches there first) and `placement`. Mark what a step points at with `<TourTarget id={TOUR_TARGETS.x}>` (`components/tour/TourTarget`) or `useTourTarget(id)` on an existing view; register the same id on every surface that shows it (mobile tab bar and desktop sidebar), and a step whose target isn't on screen is skipped. `TourProvider` (in `app/(app)/_layout.tsx`) draws the overlay as an absolute layer (no Modal); the tabs layout hands it tab switching via `useTourShell`. Start one with `useTour().start('intro', source)`. A banner can start one through its `action` (`{ type: 'startTour', tourId }`). Finishing records `tour-<id>-done` next to seen banners; tours can always be restarted ("Take the tour" on Profile).

### Usage metrics
`track(name, props)` from `lib/analytics` records a small event (names in `ANALYTICS_EVENTS`, `constants/analytics.ts`; flat props only, at most about 1 KB). Events are buffered and sent to `app_events` in one insert every 10s, or when the app goes to the background or the page is hidden. It never throws, drops a batch the server rejects, and turns itself off if the table is missing. It is off under Jest and in automated browsers (`navigator.webdriver`) unless localStorage `vteam.analytics = 'on'`, which `e2e/metrics.spec.ts` sets before intercepting the insert. `app_events` is insert-only for clients: there is no SELECT policy, and `user_id` comes from the `auth.uid()` default. pg_cron (`prune-app-events`) deletes rows older than 180 days. Currently instrumented: one-time banners (shown / action / dismissed) and tours (started / step viewed / completed / skipped). Read counts in the SQL editor (or with the Supabase MCP `execute_sql`):
```sql
-- Daily counts per event, last 30 days
select date_trunc('day', created_at)::date as day, name, count(*) as events,
       count(distinct coalesce(user_id::text, anon_id)) as people
from app_events where created_at > now() - interval '30 days'
group by 1, 2 order by 1 desc, 2;

-- Tour funnel: how many saw each step, and where people skipped
select (props->>'step')::int as step, props->>'target' as target,
       count(*) filter (where name = 'tour_step_viewed') as viewed,
       count(*) filter (where name = 'tour_skipped') as skipped_here
from app_events where props->>'tour' = 'intro' and name in ('tour_step_viewed', 'tour_skipped')
group by 1, 2 order by 1;

-- Started vs completed vs skipped, per source
select props->>'source' as source, count(*) as started from app_events where name = 'tour_started' group by 1;
select name, count(*) from app_events where name in ('tour_completed', 'tour_skipped') group by 1;
```

### Login accepts email or username
If the login field doesn't look like an email, `login.tsx` calls the `get_email_by_username` RPC, then signs in with the resolved email.

## Code Conventions

- **Functional components only**, explicitly typed `type Props = { ... }`
- **Types live in `types/`**, never inline in components. `types/database.ts` is generated; app-level types are derived from it in `types/index.ts` (or a sibling file there)
- **Shared styles in `constants/styles.ts`** via a single `StyleSheet.create` — reference as `shared.xyz`. Add new shared styles there rather than inline
- **Design tokens in `constants/theme.ts`** (`theme.colors`, `theme.spacing`, `theme.font`, `theme.radius`) — never hardcode colors or font sizes
- **File names**: components PascalCase, hooks/utils camelCase, routes lowercase
- **One hook per concern**, built on `lib/query`: `useSession` for the signed-in user, `useMyProfile`, `useMonthEvents` for the event feed, `hooks/event/*` for event detail. A new read gets a hook (or a `useQuery` in the screen if it is used once); new code never calls `supabase.from()` for reads inside effects (older settings/history, settings/hosted and profile/[id] still do; migrate them when you touch them)
- **Values come from constants**: colors/gradients from `theme` (including `theme.colors.white` / `black`, `medal*`, `theme.gradients.brand`), breakpoints from `BREAKPOINTS`, route strings from `routes.*`, user-facing strings shared by 2+ places from `constants/copy.ts` (`GENERIC_ERROR_MESSAGE`, `NETWORK_ERROR_MESSAGE`, `SKILL_LEVEL_LABELS`)
- **Dates**: always use `cleanDate(date: Date)` from `utils/` to convert to ISO string before inserting into Supabase
- **Keep it simple**: don't abstract until there are at least 3 real use cases. Prefer a few extra lines of clear code over a premature helper

## Environment Variables
Stored in `.env` (not committed):
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Running the App
```bash
npx expo start          # opens Expo dev tools
npx expo start --web    # test web experience directly
```

## UI primitives
Use `components/ui` (import from `components/ui`) before hand-rolling UI:
- `ScreenHeader` for page headers and back rows (no hand-built headers)
- `Chip` for pill filters (`solid` or `tint` variant)
- `IconButton` for square icon buttons (38pt default, 44 where touch targets matter)
- `ScreenState` decides loading / error / empty / content for a data screen; `EmptyState` is the empty block
- `ConfirmDialog` for confirm/cancel prompts; `BottomSheet` for slide-up sheets (no inline `Modal`s)
- `ScreenContainer` centers content on wide desktop web

## Routes
Always navigate with `routes.*` from `utils/routes.ts`: `router.push(routes.event(id))`, `routes.profileOf(id)`, `routes.eventFrom(id, from)`, `routes.host({ edit })`, `routes.settings('account')`, `routes.app()`. Never build `/event/${id}` strings or cast to `any` in screens. A path that arrives at runtime (notification deep link, `?from=`, post-sign-in redirect) must pass `isAppPath(path)` before `router.push(toRoute(path))`. Add a new route as a builder in `routes.ts` (and, if account-only, in `utils/authGate.ts`; if dynamic, in `public/serve.json`).

## Common Patterns

### Fetching data in a component
```typescript
const { data, isLoading, error, refetch } = useQuery(
  queryKey('foo', id),
  async () => {
    const { data, error } = await supabase.from('foos').select(FOO_SELECT).eq('id', id).single()
    if (error) throw error
    return data
  },
  { staleMs: STALE.detail },
)
// <ScreenState loading={isLoading} error={error ? "Could not load foo." : null} ready={!!data} onRetry={() => void refetch({ force: true })}> ... </ScreenState>
```
Cached by key across unmounts; a failed refetch keeps `data` and sets `error`. See "Database / Data Fetching" for mutations and realtime.

### Navigating tabs programmatically
```typescript
import { TABS, tabIndexOf } from '../constants/navigation'
router.replace(TABS[tabIndexOf('clubs')].path)      // route-level
const { goToTab } = useTabsShell()
goToTab(tabIndexOf('chat'))                          // inside the pager
```
Never hard-code tab indexes; use `TABS`, `tabIndexOf`, or the `*_TAB_INDEX` constants.

### Adding a new screen
Drop a file in `app/(app)/` (Expo Router picks it up), add a `routes.*` builder, and navigate with `router.push(routes.thing())` or `<Link href={routes.thing()}>`.

### Adding a new shared style
Add to `constants/styles.ts` inside the existing `StyleSheet.create({})` call, then reference as `shared.newStyle`.

## Collaboration
- It is okay — and encouraged — to ask the user clarifying questions before starting a task when the requirements are ambiguous or a decision would significantly affect the approach.

## UI Best Practices
When implementing any UI feature, follow best practices for all three target surfaces:
- **Mobile app (iOS/Android)**: touch targets ≥44pt, gesture-friendly interactions, safe area insets via `useSafeAreaInsets`, no hover-only affordances
- **Mobile web**: same touch target sizes, no iOS input-zoom (font-size ≥16px on inputs), `touch-action: manipulation` on interactive elements, `viewport-fit=cover` for safe areas, no double-tap zoom
- **Desktop web**: pointer/hover states where appropriate, keyboard navigation, sidebar layout at ≥768px breakpoint, reasonable max-width constraints so content doesn't stretch across a 27" monitor

Test each surface mentally when building. If a component behaves differently across surfaces, use `Platform.select` or `.web.tsx` file variants rather than runtime branching scattered throughout the component.

## Database / Data Fetching
- **Batch queries**: prefer one query with joins over multiple sequential round-trips. Use Supabase's embedded select syntax (`relation(columns)`) to fetch related data in a single request.
- **Select only what you need**: always specify columns explicitly. Never use `select('*')` on large tables — it wastes bandwidth and can expose columns unintentionally.
- **Go through `lib/query` / `lib/realtime`** (no hand-rolled `lastFetchedAt` refs in new code):
  - Reads: `useQuery(queryKey('event', id), fetcher, { staleMs: STALE.x })` (`STALE` windows live in `constants/cache.ts`) — module-level cache, deduped, survives unmount; a failed refetch keeps `data` and sets `error`. Add `useFocusRefetch(key)` to refetch on focus/foreground only when stale. `refetch({ force: true })` only for explicit user actions (pull-to-refresh).
  - Writes: `useMutation(fn, { onMutate, invalidates })` — `fn` must throw on a Supabase `{ error }`; optimistic changes go through `setQueryData` and return a rollback from `onMutate`. Outside a mutation, call `invalidate(prefix)` after a write.
  - Realtime: `useRealtimeChannel(topic, bindings, { onReconnect })`, never `supabase.channel()` directly. Subscribers sharing a topic must pass identical bindings; otherwise use a distinct topic.
- **Fetch on demand**: don't pre-fetch data for tabs or screens the user hasn't opened yet. Fetch when the tab becomes active (`useFocusEffect` or an `activeTab` effect).
- **Avoid N+1 patterns**: if you're iterating over a list and fetching per-item, restructure to a single `IN (...)` query or an embedded join instead.
- **Count with PostgREST**: use `select('id', { count: 'exact', head: true })` for counts — don't fetch full rows just to call `.length`.

## Environments & Deployment

### Single mainline (since July 2026)
- All development happens on `main` — there is no `beta` branch or beta GitHub environment
- One live Supabase project (`rmelsdqgrpfjzqisycdl`, "Vteam") serves the app; a second, **vteam beta** (`uifolvbwtrbcmfrvelnl`), exists only for CI
- CI (`.github/workflows/ci.yml`) runs unit tests on every push/PR to `main` and Playwright e2e on pull requests only; secrets are repository-level Actions secrets
- **CI never touches the live project.** The web build and e2e in CI use the **vteam beta** Supabase project (`uifolvbwtrbcmfrvelnl`; URL and public anon key are in `ci.yml`). Beta is a schema copy of live with no real user data: only reference tables (`tags`, `major_cities`, `app_config`), `external_sessions` (its own hourly Schelagg ingest), the e2e account `e2ebot` (same credentials as the `E2E_*` secrets), a fake second user `e2ebuddy`, and the seed DM between them (id in `e2e/chat.spec.ts`). Edge functions and auth email settings are not deployed there.
- **Schema changes go to both projects** (see "Schema migrations"); CI's schema drift check fails while they differ.
- Only one PR's suite runs at a time (each shard is in a repo-wide `e2e-beta-supabase-<shard>` concurrency group) because runs share the e2e account and seed conversation. Overlapping suites from several PRs on the live project once exhausted its disk IO budget and made real sign-ins time out. If a queued shard shows "cancelled", re-run its failed jobs; don't remove the group

### CI e2e specifics
- The e2e job serves the static export with `npx serve dist` — dynamic routes (`/chat/[id]`, `/event/[id]`, etc.) only resolve because of the rewrite rules in `public/serve.json` (copied into `dist` on export). Add a rewrite there whenever a new dynamic route is created.
- E2e tests sign in with the `E2E_USERNAME` / `E2E_PASSWORD` repository secrets (locally: `.env`, see `.env.example`); never commit credentials. `e2e/env.ts` is the only place e2e code reads env. A seed conversation id lives in `e2e/chat.spec.ts`.

### Schema migrations
**Every schema change is applied to BOTH projects, live (`rmelsdqgrpfjzqisycdl`) and beta (`uifolvbwtrbcmfrvelnl`), with the identical SQL, in the same session, and committed as a file in `supabase/migrations/`.** Apply to beta first (a mistake there costs nothing), then live. Reference-table rows (`tags`, `major_cities`, `app_config`) count as schema: change them in both.

Drift is caught automatically: `public.schema_fingerprint()` (on both projects) returns an md5 per schema object, and `npm run db:drift` (`scripts/schema-drift.mjs`) compares live and beta. It runs in CI's Web build job on every PR and push (a PR cannot merge while they differ) and daily (`.github/workflows/schema-drift.yml`; GitHub emails on failure). Intentional differences are listed in `ALLOWED` in that script (today only the `kudos-reminders` cron job, which notifies real people and must not run on beta). Never "fix" drift by adding to `ALLOWED`; apply the missing SQL instead. Never edit either project's schema in the Supabase dashboard.

Schema changes are usually applied directly via the Supabase MCP (`apply_migration`). Note: the migration files in `supabase/migrations/` are NOT in sync with the applied migration history — if a separate prod project is ever created, baseline it from `supabase db dump` of the live schema rather than replaying the migration files.

`types/database.ts` is generated from the live schema: after any schema change, regenerate it with `npx supabase gen types typescript --project-id rmelsdqgrpfjzqisycdl > types/database.ts` (or the Supabase MCP `generate_typescript_types`) and commit it with the change. Never hand-edit it; row types in `types/index.ts` derive from it.

### Not captured by migrations (manual setup if replicating the project)
- Storage bucket creation
- Auth settings (email templates, OAuth providers)
- Edge function secrets (`GOOGLE_MAPS_KEY`, push credentials)

## Things to Avoid
- Don't use `react-native-pager-view` — it's native-only. The custom `Pager` component is the cross-platform replacement.
- Don't hardcode colors/spacing — always use `theme.*` (no hex or `rgba(...)` literals for colors that have a token)
- Don't write route strings or `router.push(... as any)` — use `routes.*`
- Don't put types inline in component files — add them to `types/index.ts`
- Don't use capture-phase PanResponder (`onMoveShouldSetPanResponderCapture`) for inner gesture handlers inside the tab Pager — use bubble phase so inner handlers win
- Don't add navigation logic inside reusable components — pass callbacks as props or use `useTabsShell`
- Don't hardcode the feedback email address — store it in a config constant
