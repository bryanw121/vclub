# vclub — Steering Document

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
app/
  _layout.tsx              # Root: auth redirect logic
  (auth)/                  # login.tsx, register.tsx
  (app)/
    _layout.tsx            # Stack navigator
    (tabs)/
      _layout.tsx          # Custom tab bar + Pager
      index.tsx            # Events screen (calendar + list)
      create.tsx           # Create event form
      profile/index.tsx    # User profile + sign out
    event/[id].tsx         # Event detail, join/leave/delete
components/                # Reusable UI (Button, Input, EventCard, Pager, DatePickerField)
contexts/tabs.ts           # TabsContext — exposes goToTab()
hooks/                     # useAuth, useEvents
lib/supabase.ts            # Supabase client
types/index.ts             # All TypeScript types (single source of truth)
constants/                 # theme.ts (design tokens), styles.ts (shared StyleSheet)
utils/index.ts             # Date helpers (cleanDate, formatEventDate)
```

## Database Schema
Three tables currently in Supabase:

**profiles** — auto-created by DB trigger on auth signup
- `id` UUID PK (matches auth.users.id)
- `username` text unique
- `avatar_url` text | null
- `created_at` timestamp

**events**
- `id` UUID PK
- `created_by` UUID → profiles.id
- `title`, `description`, `location` text
- `event_date` timestamp
- `max_attendees` int | null (null = unlimited)
- `created_at` timestamp

**event_attendees** (join table)
- `event_id` UUID → events.id
- `user_id` UUID → profiles.id
- `joined_at` timestamp

**Custom RPC**: `get_email_by_user_id(user_id UUID)` — used for username-based login.

*Upcoming tables to add: `teams`, `team_members`, `kudos`, `trophies`, `tournament_brackets`, `notifications`, `feedback_submissions`*

## Key Architectural Decisions

### No third-party state management
Only React hooks (`useState`, `useRef`, `useContext`). Global state lives in hooks (`useAuth`, `useEvents`) and context (`TabsContext`).

### Custom tab navigation
`(tabs)/_layout.tsx` does NOT use Expo Router's built-in `<Tabs>`. Instead: custom `<Pager>` component + custom bottom bar. This enables swipe animations that work on web too. `TabsContext` lets child screens call `goToTab(index)` without circular imports.

### Cross-platform components use `.web.tsx`
`DatePickerField.tsx` = native (`@react-native-community/datetimepicker`).
`DatePickerField.web.tsx` = HTML5 `<input type="datetime-local">`.
Metro/webpack picks the right file automatically.

### Gesture layering
The `Pager` uses `onMoveShouldSetPanResponder` (bubble phase) to claim tab swipes. Inner components (WeekStrip, Calendar wrapper) also use bubble phase — since they're more inner, their handlers fire first and absorb the gesture before it reaches Pager. Do not use capture phase (`onMoveShouldSetPanResponderCapture`) for inner gesture handlers; that breaks the layering.

### Login accepts email or username
If the login field doesn't look like an email, `login.tsx` queries `profiles` for that username, calls the `get_email_by_user_id` RPC, then signs in with the resolved email.

## Code Conventions

- **Functional components only**, explicitly typed `type Props = { ... }`
- **Types all live in `types/index.ts`** — add new types there, never inline in components
- **Shared styles in `constants/styles.ts`** via a single `StyleSheet.create` — reference as `shared.xyz`. Add new shared styles there rather than inline
- **Design tokens in `constants/theme.ts`** (`theme.colors`, `theme.spacing`, `theme.font`, `theme.radius`) — never hardcode colors or font sizes
- **File names**: components PascalCase, hooks/utils camelCase, routes lowercase
- **One hook per concern**: `useAuth` for session, `useEvents` for event list. If a screen needs more fetching, do it locally in the component
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

## Common Patterns

### Fetching data in a component
```typescript
const [data, setData] = useState<Foo | null>(null)
const [loading, setLoading] = useState(true)
useEffect(() => { fetchData() }, [])
async function fetchData() { ... setLoading(false) }
```

### Navigating tabs programmatically
```typescript
const { goToTab } = useTabsContext()
goToTab(0) // 0=Events, 1=Create, 2=Profile
```

### Adding a new screen
Drop a file in `app/(app)/` — Expo Router picks it up automatically. Use `useRouter().push('/path')` or `<Link href="/path">` to navigate.

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
- **Cache with staleness**: use a `lastFetchedAt` ref and skip re-fetching within a 60-second window (see `useEvents` and `fetchProfile` for the pattern). Only bypass the cache on explicit user actions (pull-to-refresh, post/delete that invalidates the data).
- **Fetch on demand**: don't pre-fetch data for tabs or screens the user hasn't opened yet. Fetch when the tab becomes active (`useFocusEffect` or an `activeTab` effect).
- **Avoid N+1 patterns**: if you're iterating over a list and fetching per-item, restructure to a single `IN (...)` query or an embedded join instead.
- **Count with PostgREST**: use `select('id', { count: 'exact', head: true })` for counts — don't fetch full rows just to call `.length`.

## Environments & Deployment

### Two Supabase projects
- **Beta**: used during development, connected to the `beta` GitHub branch
- **Prod**: connected to `main`, only receives changes after beta validation

### Schema migrations (programmatic — no manual tracking)
Never write migration SQL by hand. After any schema change in the Supabase beta dashboard, run:
```bash
supabase db diff --use-migra -f describe_your_change
```
This auto-generates a numbered `.sql` file in `supabase/migrations/`. Commit it alongside the code change.

To promote to prod:
```bash
supabase link --project-ref <prod-ref>
supabase db push
```
Supabase tracks applied migrations automatically via its internal `supabase_migrations` table.

### GitHub branch → environment mapping
| Branch | Environment | Supabase project |
|--------|------------|-----------------|
| `beta` | Beta | Beta project |
| `main` | Production | Prod project |

Merging `beta → main` triggers the prod build and `supabase db push` via GitHub Actions.

### What is / isn't captured by migrations
- ✅ Tables, columns, indexes, RLS policies, functions, triggers
- ❌ Storage bucket creation (manual one-time setup)
- ❌ Auth settings (email templates, OAuth providers)
- ❌ Data (prod data is always separate from beta)

## Things to Avoid
- Don't use `react-native-pager-view` — it's native-only. The custom `Pager` component is the cross-platform replacement.
- Don't hardcode colors/spacing — always use `theme.*`
- Don't put types inline in component files — add them to `types/index.ts`
- Don't use capture-phase PanResponder (`onMoveShouldSetPanResponderCapture`) for inner gesture handlers inside the tab Pager — use bubble phase so inner handlers win
- Don't add navigation logic inside reusable components — pass callbacks as props or use `useTabsContext`
- Don't hardcode the feedback email address — store it in a config constant
