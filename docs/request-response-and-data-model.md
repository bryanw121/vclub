# Frontend/backend request, response, and data model

The human-written explanation was reviewed against `main` at commit `c70ead2`.
The generated inventory later in this file is refreshed from the checked-out
code by `npm run docs:update` and enforced by CI.

This document describes the contracts that are visible in this repository. It
does **not** claim that the checked-in migrations reproduce the live Supabase
project: the migration folder is known to be incomplete, so the live database
must be checked before changing a table, policy, trigger, or function.

## Start here

| If you want to… | Read… |
|---|---|
| Understand the system in two minutes | [Architecture at a glance](#architecture-at-a-glance) |
| See the shape of a Supabase request and response | [What a request and response look like](#what-a-request-and-response-look-like) |
| Follow a feature end to end | [Main request flows](#main-request-flows) |
| Find every table, RPC, auth, Realtime, Storage, model, or constrained value currently referenced by code | [Generated code inventory](#generated-code-inventory) |
| Check known type/schema hazards before backend work | [Known contract gaps](#known-contract-gaps-to-resolve-before-schema-work) |

The prose and diagrams are deliberately written for humans. The repetitive
inventory is generated and committed in this same file so GitHub renders one
readable source of truth. Run:

```bash
npm run docs:update   # rewrite the generated inventory after code changes
npm run docs:check    # verify it is already current; CI runs this on every PR
```

CI does not make a follow-up commit after merge. It blocks the PR before merge
if the inventory is stale, so code and its documentation land atomically.

## Architecture at a glance

vclub does not have a conventional application API with controllers and DTOs.
The Expo/React Native frontend usually calls Supabase directly with
`@supabase/supabase-js`. The public project URL and anon key create the client;
after sign-in, Supabase attaches the user's JWT and PostgreSQL Row Level
Security (RLS) decides what that user may read or change
([`lib/supabase.ts:6`](../lib/supabase.ts#L6),
[`lib/supabase.ts:17`](../lib/supabase.ts#L17)).

```mermaid
flowchart LR
  UI[Expo Router screens / components] --> H[hooks and utilities]
  UI --> S[Supabase JS client]
  H --> S
  S --> A[Supabase Auth]
  S --> P[PostgREST tables and views]
  S --> R[PostgreSQL RPC functions]
  S --> RT[Realtime channels]
  S --> ST[Supabase Storage]
  S --> EF[Supabase Edge Functions]
  P --> DB[(PostgreSQL + RLS)]
  R --> DB
  RT --> DB
  ST --> OBJ[(Object storage)]
  EF --> GP[Google Places]
  DB -. messages INSERT webhook .-> PUSH[send-chat-push Edge Function]
  PUSH --> EXPO[Expo Push API]
  UI -. Sentry envelope .-> VT[Vercel /api/tunnel]
  VT --> SENTRY[Sentry]
```

The server-only exceptions are:

- `places-proxy`, which accepts a small JSON request and keeps the Google Maps
  key off the client
  ([`components/LocationPickerField.tsx:73`](../components/LocationPickerField.tsx#L73),
  [`supabase/functions/places-proxy/index.ts:35`](../supabase/functions/places-proxy/index.ts#L35));
- `send-chat-push`, which receives a database webhook after a message insert,
  uses the service role to find recipients, and calls Expo Push
  ([`supabase/functions/send-chat-push/index.ts:1`](../supabase/functions/send-chat-push/index.ts#L1));
- `/api/tunnel`, a Vercel function that validates and forwards Sentry envelopes
  ([`api/tunnel.ts:5`](../api/tunnel.ts#L5)).

### Why the venue picker calls Places the way it does

Google Places is the only metered third-party API in the app, so the client
side of `places-proxy` is shaped around *not* spending it. Five deliberate
mechanisms, all in
[`components/LocationPickerField.tsx`](../components/LocationPickerField.tsx):

1. **A session token per modal open.** Autocomplete requests and the closing
   Place Details lookup share one `sessiontoken`, so Google bills the whole
   search as a single session instead of per keystroke. A fresh token is minted
   on each open, and the token is spent by the Details call on selection.
2. **A three-character floor and a 600ms debounce.** Nothing reaches the
   network until the query is worth running, which collapses a typed venue name
   into roughly one request.
3. **A two-layer cache.** A module-level `Map` for the session and a 24h
   `AsyncStorage` entry keyed `gmaps:<v>:<query>` across launches. A cache hit
   returns predictions without a request *and* without consuming the session
   token.
4. **Recent and common venues are answered locally.** Re-picking a venue the
   host has used before, or one of the `LOCATIONS` constants, resolves from
   state with zero Places traffic — which is the dominant case for a club that
   plays the same gyms every week.
5. **`fields=geometry` on Details.** The narrowest Basic-Data field set, so the
   closing call stays in the cheapest tier.

Note that `latitude`/`longitude` are currently **write-only**: they are stored
and round-tripped through the host form, but nothing reads them — "Show in
Maps" builds a text query from `location` instead
([`components/event/DetailsTab.tsx:22`](../components/event/DetailsTab.tsx#L22)).
The Details call is kept anyway because it fires once per *saved event* rather
than per keystroke, so its volume is negligible, and dropping it would discard
the coordinates that a future distance sort or map view would need.

## What a request and response look like

| Interface | Request shape | Response shape | Contract location |
|---|---|---|---|
| Auth | `supabase.auth.<operation>(payload)` | Supabase `{ data, error }`; session changes also arrive through `onAuthStateChange` | [`app/(auth)/login.tsx:98`](../app/%28auth%29/login.tsx#L98), [`lib/socialAuth.ts:11`](../lib/socialAuth.ts#L11), [`hooks/useAuth.ts:15`](../hooks/useAuth.ts#L15) |
| Table/view read | `.from(table).select(projection)` plus filters, ordering, range, or count options | `{ data, error, count, status, ... }`; `data` is an array unless `.single()`/`.maybeSingle()` is used | [`hooks/useMonthEvents.ts`](../hooks/useMonthEvents.ts), [`hooks/useNotifications.ts:29`](../hooks/useNotifications.ts#L29) |
| Table write | `.insert()`, `.upsert()`, `.update()`, or `.delete()`; append `.select()` only when returned rows are needed | Metadata/error only by default; inserted/updated rows when followed by `.select()` | [`app/(app)/host.tsx:276`](../app/%28app%29/host.tsx#L276), [`hooks/useMessages.ts:180`](../hooks/useMessages.ts#L180) |
| Database RPC | `supabase.rpc(name, namedArguments?)` | Function-specific `data` plus `error` | [`hooks/useConversations.ts:14`](../hooks/useConversations.ts#L14), [`utils/eventCardPreviews.ts:23`](../utils/eventCardPreviews.ts#L23) |
| Realtime | `.channel().on('postgres_changes', filter, callback).subscribe()` | Change payload (`new`/`old` rows); the app often re-fetches a fully joined row after receiving it | [`hooks/useMessages.ts:82`](../hooks/useMessages.ts#L82), [`hooks/useConversations.ts:48`](../hooks/useConversations.ts#L48) |
| Storage | bucket-scoped `upload`, `remove`, `getPublicUrl`, or signed URL operations | `{ data, error }`; database rows store an object path or URL | [`hooks/useMessages.ts:258`](../hooks/useMessages.ts#L258), [`constants/storage.ts:1`](../constants/storage.ts#L1) |
| Edge Function | `supabase.functions.invoke(name, { body })` | Parsed response body as `data` plus `error` | [`components/LocationPickerField.tsx:73`](../components/LocationPickerField.tsx#L73) |

PostgREST projections are also response schemas. For example, a relationship
selection such as `profiles!events_created_by_fkey (...)` produces a nested
`profiles` object, while `event_attendees_attending(count)` produces a
one-element count array. Aliases such as
`my_attendance:event_attendees_attending(user_id)` become response property
names. The canonical event-card projection is centralized in
[`constants/events.ts:92`](../constants/events.ts#L92), and the matching joined
response is `EventWithDetails`
([`types/index.ts:253`](../types/index.ts#L253)).

The TypeScript types are handwritten assertions about those response shapes;
there is no generated Supabase `Database` type parameter on `createClient`.
Many call sites therefore cast returned rows with `as`, `as unknown as`, or
`any`. TypeScript validates use after the cast, but it cannot prove the live
database returned the claimed shape.

## Main request flows

### Authentication and session

```mermaid
sequenceDiagram
  participant Screen as Login/register screen
  participant Auth as Supabase Auth
  participant DB as Postgres
  participant App as Auth hook/router
  Screen->>DB: get_email_by_username(username), when login uses username
  DB-->>Screen: email or null
  Screen->>Auth: signInWithPassword / signUp / OAuth / OTP
  Auth-->>Screen: user, session, or error
  Auth-->>App: onAuthStateChange(session)
  App->>DB: profile reads under the user's JWT and RLS
```

- Password login optionally resolves a username through
  `get_email_by_username(p_username)` and then calls
  `signInWithPassword({ email, password })`
  ([`app/(auth)/login.tsx:103`](../app/%28auth%29/login.tsx#L103)).
- Registration checks `profiles.username`, calls `auth.signUp`, and updates the
  trigger-created profile with names
  ([`app/(auth)/register.tsx:55`](../app/%28auth%29/register.tsx#L55)).
- OAuth supports authorization-code or access/refresh-token callbacks; native
  Apple login can exchange an identity token directly
  ([`lib/socialAuth.ts:11`](../lib/socialAuth.ts#L11),
  [`lib/socialAuth.ts:66`](../lib/socialAuth.ts#L66)).
- The session is persisted in AsyncStorage on client platforms. Static web
  export uses no-op storage and does not persist a server-render session
  ([`lib/supabase.ts:9`](../lib/supabase.ts#L9)).

### Event lists and event detail

```mermaid
sequenceDiagram
  participant UI as Events screen
  participant Hook as useMonthEvents
  participant REST as PostgREST
  participant RPC as get_event_card_attendee_previews
  UI->>Hook: mount, select month, or refresh
  Hook->>REST: events + host + counts + tags + club + viewer RSVP
  REST-->>Hook: EventWithDetails[] without avatar previews
  Hook-->>UI: date-ordered cards (painted immediately)
  Hook->>RPC: p_event_ids: uuid[]
  RPC-->>Hook: up to 3 attendee profiles per event
  Hook-->>UI: same cards with avatar previews
```

- The feed paints as soon as the event rows arrive; at most three attendee
  previews per event follow from a second RPC and are merged into the cached
  month only if no newer fetch replaced it meanwhile
  ([`hooks/useMonthEvents.ts`](../hooks/useMonthEvents.ts),
  [`utils/eventCardPreviews.ts`](../utils/eventCardPreviews.ts)). The
  preview RPC is `SECURITY INVOKER`, so it retains the caller's database
  permissions
  ([`supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql:2`](../supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql#L2)).
- `useMonthEvents` performs the event and tournament reads in parallel over a
  month span, normalizes tournaments into the `EventWithDetails` card shape, and
  marks them with the UI-only `_isTournament` flag
  ([`hooks/useMonthEvents.ts:28`](../hooks/useMonthEvents.ts#L28),
  [`hooks/useMonthEvents.ts:127`](../hooks/useMonthEvents.ts#L127)).
- `events.event_date` is an instant, but calendars group it by the viewer's
  local day. Suffix-less PostgREST timestamps are interpreted as UTC before
  `eventLocalDateKey` derives the shared `YYYY-MM-DD` key used by dots and
  feed sections; month queries use local-midnight boundaries converted to ISO
  instants
  ([`utils/index.ts:170`](../utils/index.ts#L170),
  [`utils/index.ts:193`](../utils/index.ts#L193),
  [`utils/monthKeys.ts:19`](../utils/monthKeys.ts#L19)).
- Event detail fetches the event, creator, full attendee/profile rows, and tags.
  It then fetches comments plus guests/cohosts in additional requests
  ([`app/(app)/event/[id].tsx:464`](../app/%28app%29/event/%5Bid%5D.tsx#L464)).
- Creating or editing an event is a client-orchestrated series of writes:
  `events`, then `event_tags`, optionally `user_event_templates`, plus waitlist
  updates on capacity changes
  ([`app/(app)/host.tsx:270`](../app/%28app%29/host.tsx#L270)). These steps are not
  wrapped in one database transaction, so a later failure can leave an earlier
  write committed. On edit, tag writes are narrowed to the difference between
  the loaded database set and current form selection: additions are inserted,
  removals target only dropped IDs, and an unchanged set performs no tag write.
  If removal fails after additions land, the client compensates by deleting
  those additions before showing the partial-save warning; a failed
  compensation is reported as an uncertain tag state rather than as unchanged
  ([`app/(app)/host.tsx:327`](../app/%28app%29/host.tsx#L327),
  [`utils/index.ts:471`](../utils/index.ts#L471)).
- Price has separate form and persistence contracts. `CreateEventForm.priceText`
  preserves in-progress decimal input as text; the submit boundary sanitizes
  and converts it once to the `events.price` number, rounded to cents, with
  empty or zero represented as `null`. Response formatting then renders
  fractional values with two decimal places
  ([`types/index.ts:305`](../types/index.ts#L305),
  [`utils/index.ts:171`](../utils/index.ts#L171),
  [`utils/index.ts:190`](../utils/index.ts#L190),
  [`app/(app)/host.tsx:278`](../app/%28app%29/host.tsx#L278)).

The event entity cluster is:

```mermaid
erDiagram
  PROFILE ||--o{ EVENT : creates
  PROFILE ||--o{ EVENT_ATTENDEE : joins
  EVENT ||--o{ EVENT_ATTENDEE : has
  EVENT ||--o{ EVENT_GUEST : has
  PROFILE ||--o{ EVENT_GUEST : adds
  EVENT ||--o{ EVENT_COHOST : delegates
  PROFILE ||--o{ EVENT_COHOST : cohosts
  EVENT ||--o{ EVENT_COMMENT : discusses
  PROFILE ||--o{ EVENT_COMMENT : authors
  EVENT_COMMENT o|--o{ EVENT_COMMENT : replies
  EVENT ||--o{ CHEER : recognizes
  PROFILE ||--o{ CHEER : gives
  PROFILE ||--o{ CHEER : receives
  EVENT ||--o{ EVENT_TAG : categorized_by
  TAG ||--o{ EVENT_TAG : categorizes
  CLUB o|--o{ EVENT : owns
```

### Profiles and cheers

- The own-profile screen loads the signed-in `profiles` row and an exact,
  head-only count of `cheers` rows where that profile is the receiver in
  parallel. Pull-to-refresh repeats both the profile and Cheers reads; a failed
  count refresh retains the last known value instead of replacing it with a
  misleading zero. The same receiver relationship drives the existing Cheers
  detail screen, so the card total and detail total share one database contract
  ([`app/(app)/(tabs)/(main)/profile/index.tsx`](../app/%28app%29/%28tabs%29/%28main%29/profile/index.tsx),
  [`app/(app)/(tabs)/settings/cheers.tsx`](../app/%28app%29/%28tabs%29/settings/cheers.tsx)).

### Clubs

Club screens use direct PostgREST reads and writes:

- `clubs` belongs to a `major_cities` row and has many `club_members`; the
  creator is inserted as an owner by a database trigger
  ([`types/index.ts:337`](../types/index.ts#L337),
  [`supabase/migrations/20260419120000_club_creation_and_location.sql:20`](../supabase/migrations/20260419120000_club_creation_and_location.sql#L20)).
- A club has events and a feed of `club_posts`; posts have `club_post_likes` and
  `club_post_comments`. The checked-in RLS policies allow members to read and
  interact while only owners create posts
  ([`supabase/migrations/20260421120000_club_posts.sql:47`](../supabase/migrations/20260421120000_club_posts.sql#L47)).
- Club images are uploaded to `club-avatars`; the database stores their object
  path
  ([`app/(app)/club/[id].tsx:257`](../app/%28app%29/club/%5Bid%5D.tsx#L257)).

```mermaid
erDiagram
  MAJOR_CITY ||--o{ CLUB : locates
  PROFILE ||--o{ CLUB : creates
  CLUB ||--o{ CLUB_MEMBER : has
  PROFILE ||--o{ CLUB_MEMBER : joins
  CLUB ||--o{ CLUB_POST : publishes
  PROFILE ||--o{ CLUB_POST : authors
  CLUB_POST ||--o{ CLUB_POST_LIKE : receives
  PROFILE ||--o{ CLUB_POST_LIKE : gives
  CLUB_POST ||--o{ CLUB_POST_COMMENT : has
  PROFILE ||--o{ CLUB_POST_COMMENT : authors
```

### Chat

- The conversation list is not assembled in the client. The frontend invokes
  `get_my_conversations()` and casts its result to `ConversationRow[]`; that row
  includes the last message, unread count, other DM member, or club identity
  ([`hooks/useConversations.ts:14`](../hooks/useConversations.ts#L14),
  [`types/index.ts:480`](../types/index.ts#L480)).
- Opening a DM invokes `find_or_create_dm(other_user_id)` and expects one
  conversation UUID
  ([`app/(app)/(tabs)/chat.tsx:193`](../app/%28app%29/%28tabs%29/chat.tsx#L193)).
- A message page fetches 40 messages at a time with sender and reaction embeds,
  then separately fetches referenced reply messages to avoid an ambiguous
  self-join
  ([`hooks/useMessages.ts:6`](../hooks/useMessages.ts#L6),
  [`hooks/useMessages.ts:17`](../hooks/useMessages.ts#L17)).
- Sending inserts a `messages` row and asks PostgREST to return the joined
  `MessageWithDetails` projection. An optimistic `_sending` row exists only in
  client memory until confirmation
  ([`hooks/useMessages.ts:137`](../hooks/useMessages.ts#L137),
  [`types/index.ts:524`](../types/index.ts#L524)).
- Realtime `messages` and `message_reactions` changes update or re-fetch client
  state. `mark_conversation_read(p_conversation_id)` updates server-side read
  state
  ([`hooks/useMessages.ts:88`](../hooks/useMessages.ts#L88),
  [`hooks/useMessages.ts:292`](../hooks/useMessages.ts#L292)).
- Image messages upload to the public `chat-images` bucket and store the public
  URL in `messages.image_url`
  ([`hooks/useMessages.ts:258`](../hooks/useMessages.ts#L258)).
- A message insert can independently trigger the `send-chat-push` database
  webhook. That service-role flow does not participate in the frontend insert
  response; push delivery is asynchronous and best-effort.

```mermaid
erDiagram
  CONVERSATION ||--o{ CONVERSATION_MEMBER : includes
  PROFILE ||--o{ CONVERSATION_MEMBER : participates
  CLUB o|--o| CONVERSATION : owns
  CONVERSATION ||--o{ MESSAGE : contains
  PROFILE ||--o{ MESSAGE : sends
  MESSAGE o|--o{ MESSAGE : replies_to
  MESSAGE ||--o{ MESSAGE_REACTION : receives
  PROFILE ||--o{ MESSAGE_REACTION : reacts
  PROFILE ||--o{ CHAT_SILENCE : configures
  PROFILE ||--o{ CHAT_SILENCE : is_hidden
  PROFILE ||--o{ PUSH_TOKEN : registers
```

`Conversation` and `ConversationMember` raw-row types are notably absent from
`types/index.ts`; the principal client contract is the RPC response
`ConversationRow`.

### Notifications and badges

- The inbox reads at most 80 `notifications` rows. The unread badge uses an
  exact, `head: true` count so row bodies are not downloaded
  ([`hooks/useNotifications.ts:23`](../hooks/useNotifications.ts#L23),
  [`hooks/useNotifications.ts:38`](../hooks/useNotifications.ts#L38)).
- `mark_notification_read` and `mark_all_notifications_read` are
  security-definer RPCs that still scope updates to `auth.uid()`
  ([`supabase/migrations/20260402120000_notifications_inbox.sql:97`](../supabase/migrations/20260402120000_notifications_inbox.sql#L97)).
- Checked-in triggers fan out event announcements, material event changes,
  cancellations, and waitlist promotions into inbox rows
  ([`supabase/migrations/20260402120100_notifications_triggers.sql:7`](../supabase/migrations/20260402120100_notifications_triggers.sql#L7)).
- Badge qualification is currently client-orchestrated: the utility reads
  attendance/events/cheers, plans awards, inserts or updates `user_badges`, and
  inserts badge notifications
  ([`utils/badges.ts:25`](../utils/badges.ts#L25),
  [`utils/badges.ts:178`](../utils/badges.ts#L178)).
- Notification preferences are JSON in `profiles.notification_prefs`, keyed by
  notification type and channel (`in_app` or `push`)
  ([`types/index.ts:69`](../types/index.ts#L69)).

### Tournaments

Tournament creation inserts the parent `tournaments` row and then its
one-to-one `tournament_rules` row; this is another client-orchestrated,
non-transactional sequence
([`app/(app)/tournament/create.tsx:668`](../app/%28app%29/tournament/create.tsx#L668)).
Tournament detail then loads the parent/rules/prizes in parallel and separately
loads teams, members, invitations, join requests, discussion, pools, matches,
and sets as the screen needs them
([`app/(app)/tournament/[id].tsx:168`](../app/%28app%29/tournament/%5Bid%5D.tsx#L168)).

```mermaid
erDiagram
  CLUB ||--o{ TOURNAMENT : hosts
  PROFILE ||--o{ TOURNAMENT : creates
  TOURNAMENT ||--|| TOURNAMENT_RULES : has
  TOURNAMENT ||--o{ TOURNAMENT_TEAM : registers
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_TEAM_MEMBER : rosters
  PROFILE ||--o{ TOURNAMENT_TEAM_MEMBER : joins
  TOURNAMENT ||--o{ TOURNAMENT_POOL : divides
  TOURNAMENT_POOL ||--o{ TOURNAMENT_POOL_TEAM : assigns
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_POOL_TEAM : placed_in
  TOURNAMENT ||--o{ TOURNAMENT_MATCH : schedules
  TOURNAMENT_MATCH ||--o{ TOURNAMENT_SET : scores
  TOURNAMENT ||--o{ TOURNAMENT_COMMENT : discusses
  TOURNAMENT ||--o{ TOURNAMENT_PRIZE : awards
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_TEAM_INVITATION : invites
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_TEAM_JOIN_REQUEST : receives
```

### Proxied and asynchronous external calls

These are the only bespoke HTTP request/response contracts in the repository:

| Path | Inbound request | Outbound request | Response to caller |
|---|---|---|---|
| `places-proxy` autocomplete | `POST { action: 'autocomplete', input, sessiontoken }` through `functions.invoke` | Google Places autocomplete query, restricted to the US and biased toward Austin. No `types` filter, so both named establishments and street addresses come back | Google JSON; the component reads `predictions[]` with `place_id`, `description`, `types`, and `structured_formatting` |
| `places-proxy` details | `POST { action: 'details', place_id, sessiontoken }` | Google Place Details query for `geometry` | Google JSON; the component reads `result.geometry.location.{lat,lng}` |
| `send-chat-push` | Database webhook `POST` whose `record` has message `id`, `conversation_id`, `sender_id`, `content`, and `image_url` | One Expo Push message per recipient token | Plain-text `OK`, `No recipients`, or `No tokens`; this response goes to the webhook, not the app |
| `/api/tunnel` | Raw Sentry envelope in an HTTP `POST` | Same envelope to the `sentry.io` project encoded by its DSN | Empty response with the upstream status; invalid envelopes/hosts return 400 and non-POST methods return 405 |

The exact Places bodies and parsed response fields are declared in
[`components/LocationPickerField.tsx:14`](../components/LocationPickerField.tsx#L14)
and validated/routed in
[`supabase/functions/places-proxy/index.ts:35`](../supabase/functions/places-proxy/index.ts#L35).
The push webhook payload starts at
[`supabase/functions/send-chat-push/index.ts:23`](../supabase/functions/send-chat-push/index.ts#L23),
and the Sentry forwarding contract is implemented in
[`api/tunnel.ts:5`](../api/tunnel.ts#L5).

## Model catalog

The canonical frontend model file is [`types/index.ts`](../types/index.ts). Its
types fall into four groups:

| Kind | Models | Meaning |
|---|---|---|
| Database row | `Profile`, `Event`, `EventAttendee`, `EventComment`, `EventGuest`, `EventCohost`, `Cheer`, `Tag`, `UserEventTemplate`, `MajorCity`, `Club`, `ClubMember`, club post models, `Notification`, `Message`, `MessageReaction`, `ChatSilence`, `UserBadge`, and tournament models | Intended to mirror one persisted table row. Optional properties often represent columns added after the original model. |
| Joined/query response | `EventWithDetails`, `EventAttendeeWithProfile`, `EventCommentWithAuthor`, `ClubWithDetails`, `ClubPostWithFeed`, `ConversationRow`, `MessageWithDetails`, `ChatSilenceWithProfile`, `TournamentCommentWithAuthor`, `TournamentTeamWithRoster` | Match a particular PostgREST projection or RPC, including nested relationship aliases and aggregates. |
| Form/request | `CreateEventForm`, `TournamentDraft`, `LocationValue` | Local UI state. Dates may be `Date` objects and names may be camelCase; submit handlers convert them to database columns/ISO strings. |
| Derived/UI-only | `AttendanceStatus`, `TeamAssignment`; `_isTournament`, `_sending`, `attendee_previews`, and `my_attendance` fields | Calculated or transient state that must never be assumed to be a database column. |

<!-- BEGIN GENERATED: code-inventory -->
## Generated code inventory

> Do not edit this section by hand. Run `npm run docs:update` and commit the
> result. CI runs `npm run docs:check` and blocks a merge if it is stale.
>
> Contract source fingerprint: `a543902e808f`

This inventory is generated from the repository's TypeScript and SQL. It is the
fast lookup layer; the surrounding prose explains intent and relationships.

### Direct table and view calls

<details>
<summary>37 tables/views referenced by code</summary>

| Table or view | Frontend/server call sites |
|---|---|
| `app_config` | [`hooks/useMinVersion.ts:19`](../hooks/useMinVersion.ts#L19) |
| `chat_silences` | [`hooks/useSilencedUsers.ts:26`](../hooks/useSilencedUsers.ts#L26)<br>[`supabase/functions/send-chat-push/index.ts:135`](../supabase/functions/send-chat-push/index.ts#L135) |
| `cheers` | [`app/(app)/(tabs)/settings/cheers.tsx:26`](../app/%28app%29/%28tabs%29/settings/cheers.tsx#L26)<br>[`app/(app)/profile/[id].tsx:54`](../app/%28app%29/profile/%5Bid%5D.tsx#L54)<br>[`hooks/event/useEventCheers.ts:17`](../hooks/event/useEventCheers.ts#L17)<br>[`hooks/useMyProfile.ts:142`](../hooks/useMyProfile.ts#L142)<br>[`utils/badges.ts:48`](../utils/badges.ts#L48) |
| `club_members` | [`app/(app)/(tabs)/clubs.tsx:90`](../app/%28app%29/%28tabs%29/clubs.tsx#L90)<br>[`app/(app)/chat/[id].tsx:95`](../app/%28app%29/chat/%5Bid%5D.tsx#L95)<br>[`app/(app)/club/[id].tsx:135`](../app/%28app%29/club/%5Bid%5D.tsx#L135)<br>[`app/(app)/host.tsx:112`](../app/%28app%29/host.tsx#L112)<br>[`app/(app)/tournament/create.tsx:740`](../app/%28app%29/tournament/create.tsx#L740) |
| `club_post_comments` | [`components/ClubPostCard.tsx:107`](../components/ClubPostCard.tsx#L107) |
| `club_post_likes` | [`components/ClubPostCard.tsx:78`](../components/ClubPostCard.tsx#L78) |
| `club_posts` | [`components/ClubPostCard.tsx:281`](../components/ClubPostCard.tsx#L281)<br>[`hooks/useClub.ts:70`](../hooks/useClub.ts#L70) |
| `clubs` | [`app/(app)/(tabs)/clubs.tsx:213`](../app/%28app%29/%28tabs%29/clubs.tsx#L213)<br>[`app/(app)/club/[id].tsx:191`](../app/%28app%29/club/%5Bid%5D.tsx#L191)<br>[`app/(app)/club/create.tsx:41`](../app/%28app%29/club/create.tsx#L41)<br>[`hooks/useClub.ts:53`](../hooks/useClub.ts#L53) |
| `conversation_members` | [`supabase/functions/send-chat-push/index.ts:119`](../supabase/functions/send-chat-push/index.ts#L119) |
| `conversations` | [`hooks/useConversations.ts:224`](../hooks/useConversations.ts#L224)<br>[`supabase/functions/send-chat-push/index.ts:118`](../supabase/functions/send-chat-push/index.ts#L118) |
| `event_attendees` | [`app/(app)/host.tsx:327`](../app/%28app%29/host.tsx#L327)<br>[`hooks/event/useEventAttendance.ts:107`](../hooks/event/useEventAttendance.ts#L107)<br>[`hooks/event/useEventTeams.ts:75`](../hooks/event/useEventTeams.ts#L75)<br>[`hooks/useMonthEvents.ts:401`](../hooks/useMonthEvents.ts#L401)<br>[`hooks/useMyUpcomingEvents.ts:100`](../hooks/useMyUpcomingEvents.ts#L100)<br>[`utils/badges.ts:33`](../utils/badges.ts#L33) |
| `event_cohosts` | [`hooks/event/useCohosts.ts:60`](../hooks/event/useCohosts.ts#L60)<br>[`hooks/event/useEventData.ts:44`](../hooks/event/useEventData.ts#L44) |
| `event_comments` | [`hooks/event/useEventComments.ts:42`](../hooks/event/useEventComments.ts#L42)<br>[`hooks/event/useEventData.ts:54`](../hooks/event/useEventData.ts#L54) |
| `event_guests` | [`hooks/event/useEventAttendance.ts:279`](../hooks/event/useEventAttendance.ts#L279)<br>[`hooks/event/useEventData.ts:34`](../hooks/event/useEventData.ts#L34)<br>[`hooks/event/useEventTeams.ts:86`](../hooks/event/useEventTeams.ts#L86) |
| `event_tags` | [`app/(app)/host.tsx:291`](../app/%28app%29/host.tsx#L291) |
| `events` | [`app/(app)/(tabs)/settings/history.tsx:51`](../app/%28app%29/%28tabs%29/settings/history.tsx#L51)<br>[`app/(app)/(tabs)/settings/hosted.tsx:21`](../app/%28app%29/%28tabs%29/settings/hosted.tsx#L21)<br>[`app/(app)/event/[id].tsx:181`](../app/%28app%29/event/%5Bid%5D.tsx#L181)<br>[`app/(app)/host.tsx:131`](../app/%28app%29/host.tsx#L131)<br>[`hooks/event/useEventData.ts:27`](../hooks/event/useEventData.ts#L27)<br>[`hooks/useClub.ts:45`](../hooks/useClub.ts#L45)<br>+2 more files |
| `external_sessions` | [`hooks/useMonthEvents.ts:132`](../hooks/useMonthEvents.ts#L132) |
| `feedback_submissions` | [`app/(app)/(tabs)/settings/feedback.tsx:47`](../app/%28app%29/%28tabs%29/settings/feedback.tsx#L47) |
| `major_cities` | [`components/MajorCityAutocomplete.tsx:27`](../components/MajorCityAutocomplete.tsx#L27) |
| `message_reactions` | [`hooks/useMessages.ts:421`](../hooks/useMessages.ts#L421) |
| `messages` | [`hooks/useMessages.ts:83`](../hooks/useMessages.ts#L83) |
| `notifications` | [`hooks/event/useCohosts.ts:72`](../hooks/event/useCohosts.ts#L72)<br>[`hooks/event/useEventAttendance.ts:89`](../hooks/event/useEventAttendance.ts#L89)<br>[`hooks/useNotifications.ts:34`](../hooks/useNotifications.ts#L34)<br>[`utils/badges.ts:237`](../utils/badges.ts#L237) |
| `profiles` | [`app/_layout.tsx:41`](../app/_layout.tsx#L41)<br>[`app/(app)/(tabs)/chat.tsx:52`](../app/%28app%29/%28tabs%29/chat.tsx#L52)<br>[`app/(app)/profile/[id].tsx:53`](../app/%28app%29/profile/%5Bid%5D.tsx#L53)<br>[`app/(auth)/register.tsx:61`](../app/%28auth%29/register.tsx#L61)<br>[`hooks/event/useCohosts.ts:37`](../hooks/event/useCohosts.ts#L37)<br>[`hooks/event/useEventData.ts:63`](../hooks/event/useEventData.ts#L63)<br>+4 more files |
| `push_receipts` | [`supabase/functions/check-push-receipts/index.ts:37`](../supabase/functions/check-push-receipts/index.ts#L37)<br>[`supabase/functions/send-chat-push/index.ts:199`](../supabase/functions/send-chat-push/index.ts#L199) |
| `push_tokens` | [`supabase/functions/check-push-receipts/index.ts:82`](../supabase/functions/check-push-receipts/index.ts#L82)<br>[`supabase/functions/send-chat-push/index.ts:144`](../supabase/functions/send-chat-push/index.ts#L144)<br>[`utils/pushNotifications.ts:47`](../utils/pushNotifications.ts#L47) |
| `tags` | [`hooks/useTags.ts:14`](../hooks/useTags.ts#L14) |
| `tournament_comments` | [`hooks/tournament/api.ts:113`](../hooks/tournament/api.ts#L113) |
| `tournament_matches` | [`hooks/tournament/api.ts:120`](../hooks/tournament/api.ts#L120) |
| `tournament_prizes` | [`hooks/tournament/api.ts:92`](../hooks/tournament/api.ts#L92) |
| `tournament_rules` | [`app/(app)/tournament/create.tsx:701`](../app/%28app%29/tournament/create.tsx#L701)<br>[`hooks/tournament/api.ts:91`](../hooks/tournament/api.ts#L91) |
| `tournament_team_invitations` | [`hooks/tournament/api.ts:138`](../hooks/tournament/api.ts#L138) |
| `tournament_team_join_requests` | [`hooks/tournament/api.ts:142`](../hooks/tournament/api.ts#L142) |
| `tournament_team_members` | [`hooks/tournament/api.ts:134`](../hooks/tournament/api.ts#L134) |
| `tournament_teams` | [`hooks/tournament/api.ts:103`](../hooks/tournament/api.ts#L103) |
| `tournaments` | [`app/(app)/tournament/create.tsx:673`](../app/%28app%29/tournament/create.tsx#L673)<br>[`hooks/tournament/api.ts:90`](../hooks/tournament/api.ts#L90)<br>[`hooks/useMonthEvents.ts:123`](../hooks/useMonthEvents.ts#L123) |
| `user_badges` | [`app/(app)/profile/[id].tsx:55`](../app/%28app%29/profile/%5Bid%5D.tsx#L55)<br>[`hooks/useBadges.ts:51`](../hooks/useBadges.ts#L51)<br>[`utils/badges.ts:190`](../utils/badges.ts#L190) |
| `user_event_templates` | [`app/(app)/host.tsx:157`](../app/%28app%29/host.tsx#L157) |

</details>

### Database RPC calls

| RPC | Call sites | SQL definition |
|---|---|---|
| `accept_tournament_invite` | [`hooks/tournament/api.ts:198`](../hooks/tournament/api.ts#L198) | [`supabase/migrations/20261025120000_tournament_rpcs.sql:18`](../supabase/migrations/20261025120000_tournament_rpcs.sql#L18) |
| `find_or_create_dm` | [`app/(app)/(tabs)/chat.tsx:192`](../app/%28app%29/%28tabs%29/chat.tsx#L192)<br>[`app/(app)/event/[id].tsx:195`](../app/%28app%29/event/%5Bid%5D.tsx#L195)<br>[`app/(app)/profile/[id].tsx:106`](../app/%28app%29/profile/%5Bid%5D.tsx#L106) | Not checked in |
| `get_email_by_username` | [`app/(auth)/login.tsx:110`](../app/%28auth%29/login.tsx#L110) | Not checked in |
| `get_event_card_attendee_previews` | [`utils/eventCardPreviews.ts:24`](../utils/eventCardPreviews.ts#L24) | [`supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql:2`](../supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql#L2) |
| `get_my_conversations` | [`hooks/useConversations.ts:38`](../hooks/useConversations.ts#L38) | Not checked in |
| `mark_all_notifications_read` | [`hooks/useNotifications.ts:99`](../hooks/useNotifications.ts#L99) | [`supabase/migrations/20260402120000_notifications_inbox.sql:112`](../supabase/migrations/20260402120000_notifications_inbox.sql#L112) |
| `mark_conversation_read` | [`hooks/useMessages.ts:160`](../hooks/useMessages.ts#L160) | Not checked in |
| `mark_notification_read` | [`hooks/useNotifications.ts:85`](../hooks/useNotifications.ts#L85) | [`supabase/migrations/20260402120000_notifications_inbox.sql:98`](../supabase/migrations/20260402120000_notifications_inbox.sql#L98) |
| `replace_tournament_schedule` | [`hooks/tournament/api.ts:281`](../hooks/tournament/api.ts#L281) | [`supabase/migrations/20261025120000_tournament_rpcs.sql:100`](../supabase/migrations/20261025120000_tournament_rpcs.sql#L100) |

### Other Supabase surfaces

<details>
<summary>Auth, Realtime, Storage, and Edge Function call sites</summary>

| Surface | Name | Call sites |
|---|---|---|
| Auth | `exchangeCodeForSession` | [`lib/socialAuth.ts:24`](../lib/socialAuth.ts#L24) |
| Auth | `getSession` | [`app/_layout.tsx:37`](../app/_layout.tsx#L37)<br>[`app/(app)/(tabs)/settings/account.tsx:17`](../app/%28app%29/%28tabs%29/settings/account.tsx#L17)<br>[`app/(app)/(tabs)/settings/cheers.tsx:21`](../app/%28app%29/%28tabs%29/settings/cheers.tsx#L21)<br>[`app/(app)/club/create.tsx:33`](../app/%28app%29/club/create.tsx#L33)<br>[`app/(auth)/reset-password.tsx:31`](../app/%28auth%29/reset-password.tsx#L31)<br>[`components/ClubPostCard.tsx:269`](../components/ClubPostCard.tsx#L269)<br>+2 more files |
| Auth | `getUser` | [`contexts/session.tsx:15`](../contexts/session.tsx#L15)<br>[`lib/sessionUser.ts:6`](../lib/sessionUser.ts#L6) |
| Auth | `onAuthStateChange` | [`app/(auth)/reset-password.tsx:26`](../app/%28auth%29/reset-password.tsx#L26)<br>[`contexts/session.tsx:32`](../contexts/session.tsx#L32) |
| Auth | `resetPasswordForEmail` | [`app/(auth)/login.tsx:88`](../app/%28auth%29/login.tsx#L88) |
| Auth | `setSession` | [`lib/socialAuth.ts:27`](../lib/socialAuth.ts#L27) |
| Auth | `signInWithIdToken` | [`lib/socialAuth.ts:78`](../lib/socialAuth.ts#L78) |
| Auth | `signInWithOAuth` | [`lib/socialAuth.ts:38`](../lib/socialAuth.ts#L38) |
| Auth | `signInWithOtp` | [`lib/socialAuth.ts:89`](../lib/socialAuth.ts#L89) |
| Auth | `signInWithPassword` | [`app/(auth)/login.tsx:119`](../app/%28auth%29/login.tsx#L119) |
| Auth | `signOut` | [`app/(app)/(tabs)/settings/account.tsx:25`](../app/%28app%29/%28tabs%29/settings/account.tsx#L25) |
| Auth | `signUp` | [`app/(auth)/register.tsx:71`](../app/%28auth%29/register.tsx#L71) |
| Auth | `startAutoRefresh` | [`lib/supabase.ts:35`](../lib/supabase.ts#L35) |
| Auth | `stopAutoRefresh` | [`lib/supabase.ts:36`](../lib/supabase.ts#L36) |
| Auth | `updateUser` | [`app/(auth)/reset-password.tsx:45`](../app/%28auth%29/reset-password.tsx#L45) |
| Auth | `verifyOtp` | [`lib/socialAuth.ts:97`](../lib/socialAuth.ts#L97) |
| Realtime table | `chat_silences` | [`utils/chatUtils.ts:100`](../utils/chatUtils.ts#L100) |
| Realtime table | `conversation_members` | [`utils/chatUtils.ts:95`](../utils/chatUtils.ts#L95) |
| Realtime table | `message_reactions` | [`utils/chatUtils.ts:79`](../utils/chatUtils.ts#L79) |
| Realtime table | `messages` | [`utils/chatUtils.ts:73`](../utils/chatUtils.ts#L73) |
| Storage bucket | `avatars` | [`components/profile/useAvatarUploader.ts:103`](../components/profile/useAvatarUploader.ts#L103) |
| Storage bucket | `chat-images` | [`hooks/useMessages.ts:459`](../hooks/useMessages.ts#L459) |
| Storage bucket | `club-avatars` | [`app/(app)/club/[id].tsx:209`](../app/%28app%29/club/%5Bid%5D.tsx#L209) |
| Edge Function | `places-proxy` | [`components/LocationPickerField.tsx:69`](../components/LocationPickerField.tsx#L69) |

</details>

### Shared model index

| Section in `types/index.ts` | Exported types |
|---|---|
| Database Row Types | [`VolleyballPosition`](../types/index.ts#L6), [`VolleyballSkillLevel`](../types/index.ts#L15), [`Profile`](../types/index.ts#L28), [`NotificationType`](../types/index.ts#L67), [`NotificationPrefs`](../types/index.ts#L70), [`NotificationData`](../types/index.ts#L76), [`Notification`](../types/index.ts#L87), [`Event`](../types/index.ts#L102), [`CheerType`](../types/index.ts#L121), [`Cheer`](../types/index.ts#L135), [`EventAttendee`](../types/index.ts#L150), [`EventAttendeeWithProfile`](../types/index.ts#L161), [`EventAttendeeCountEmbed`](../types/index.ts#L166), [`EventComment`](../types/index.ts#L172), [`MentionUser`](../types/index.ts#L191), [`EventCommentWithAuthor`](../types/index.ts#L198), [`EventGuest`](../types/index.ts#L206), [`EventCohost`](../types/index.ts#L224), [`EventCohostWithProfile`](../types/index.ts#L232), [`FeedbackSubmission`](../types/index.ts#L240), [`FeedbackKind`](../types/index.ts#L250), [`FeedbackPriority`](../types/index.ts#L251) |
| Query Response Types | [`EventWithDetails`](../types/index.ts#L265), [`ExternalSession`](../types/index.ts#L296) |
| Form Types | [`CreateEventForm`](../types/index.ts#L318), [`Tag`](../types/index.ts#L338), [`UserEventTemplate`](../types/index.ts#L350) |
| Club Types | [`MembershipType`](../types/index.ts#L363), [`MajorCity`](../types/index.ts#L368), [`Club`](../types/index.ts#L380), [`ClubMember`](../types/index.ts#L397), [`ClubWithDetails`](../types/index.ts#L408), [`ClubPost`](../types/index.ts#L418), [`ClubPostLike`](../types/index.ts#L429), [`ClubPostComment`](../types/index.ts#L438), [`ClubPostCommentWithAuthor`](../types/index.ts#L447), [`ClubPostWithFeed`](../types/index.ts#L452) |
| Derived / Computed Types | [`AttendanceStatus`](../types/index.ts#L466), [`TeamAssignment`](../types/index.ts#L481), [`MyEventStatus`](../types/index.ts#L487), [`MyUpcomingEvent`](../types/index.ts#L490) |
| Events Feed Types | [`FeedFilter`](../types/index.ts#L502), [`FeedFilterChip`](../types/index.ts#L504), [`FeedRsvpAction`](../types/index.ts#L506), [`FeedRsvpVars`](../types/index.ts#L508), [`FeedRsvpResult`](../types/index.ts#L511), [`EventsHeaderProps`](../types/index.ts#L513), [`FilterChipsProps`](../types/index.ts#L520), [`FeedEmptyProps`](../types/index.ts#L530), [`NextUpCardProps`](../types/index.ts#L540) |
| Chat Types | [`ConversationType`](../types/index.ts#L547), [`Message`](../types/index.ts#L549), [`MessageReaction`](../types/index.ts#L561), [`ConversationRow`](../types/index.ts#L569), [`ChatSilence`](../types/index.ts#L599), [`ChatSilenceWithProfile`](../types/index.ts#L606), [`MessageWithDetails`](../types/index.ts#L613) |
| Badge Types | [`CardBgType`](../types/index.ts#L627), [`BadgeType`](../types/index.ts#L629), [`UserBadge`](../types/index.ts#L649) |
| Tournament Types | [`TournamentStatus`](../types/index.ts#L661), [`TournamentFormat`](../types/index.ts#L662), [`TournamentBracketType`](../types/index.ts#L663), [`TournamentStage`](../types/index.ts#L664), [`TournamentTeamStatus`](../types/index.ts#L665), [`TournamentMatchStatus`](../types/index.ts#L666), [`Tournament`](../types/index.ts#L668), [`TournamentRules`](../types/index.ts#L698), [`TournamentTeam`](../types/index.ts#L708), [`TournamentTeamMember`](../types/index.ts#L721), [`TournamentPool`](../types/index.ts#L729), [`TournamentMatch`](../types/index.ts#L736), [`TournamentSet`](../types/index.ts#L755), [`TournamentDraft`](../types/index.ts#L765) |
| Tournament Discussion | [`TournamentComment`](../types/index.ts#L799), [`TournamentCommentWithAuthor`](../types/index.ts#L812) |
| Tournament Team Management | [`TournamentTeamInvitationStatus`](../types/index.ts#L819), [`TournamentTeamInvitation`](../types/index.ts#L820), [`TournamentJoinRequestStatus`](../types/index.ts#L830), [`TournamentTeamJoinRequest`](../types/index.ts#L831) |
| Tournament Prizes | [`TournamentPrize`](../types/index.ts#L842) |
| Tournament Team with roster | [`TournamentTeamWithRoster`](../types/index.ts#L854) |
| Google Places prediction | [`GooglePlacePrediction`](../types/index.ts#L868), [`AppConfigRow`](../types/index.ts#L880), [`UpdateRequirement`](../types/index.ts#L888) |
| Session | [`SessionState`](../types/index.ts#L898) |
| UI primitives (components/ui) | [`IoniconName`](../types/index.ts#L908), [`ScreenStateProps`](../types/index.ts#L910), [`EmptyStateProps`](../types/index.ts#L928), [`ChipVariant`](../types/index.ts#L937), [`ChipProps`](../types/index.ts#L939), [`IconButtonProps`](../types/index.ts#L948), [`ScreenHeaderProps`](../types/index.ts#L961), [`ConfirmDialogProps`](../types/index.ts#L976), [`BottomSheetProps`](../types/index.ts#L988), [`ScreenContainerProps`](../types/index.ts#L995) |
| Profile / club / host (Phase B4) | [`ProfilePatch`](../types/index.ts#L1006), [`ToastState`](../types/index.ts#L1010), [`ClubListItem`](../types/index.ts#L1013), [`ClubDetailData`](../types/index.ts#L1020), [`ClubPostsData`](../types/index.ts#L1028), [`OwnedClubOption`](../types/index.ts#L1035) |

### Constrained string values

The codebase uses string-literal unions and `as const` arrays instead of the
TypeScript `enum` keyword.

| Type or field | Values | Source |
|---|---|---|
| `AppConfigRow.platform` | `ios`, `android`, `web` | [`types/index.ts:881`](../types/index.ts#L881) |
| `BadgeStat` | `events_attended_past`, `events_hosted_past`, `cheers_received_total`, `cheers_given_events`, `spike_cheers`, `serve_cheers`, `block_cheers`, `set_cheers`, `dig_pass_cheers`, `communication_cheers`, `beta_active`, `tournament_hosted`, `profile_complete`, `vex_member` | [`constants/badges.ts:43`](../constants/badges.ts#L43) |
| `BadgeType` | `event_attendee`, `event_host`, `cheers_received`, `cheers_given`, `spike_cheer`, `serve_cheer`, `block_cheer`, `set_cheer`, `dig_pass_cheer`, `communication_cheer`, `beta_tester`, `tournament_director`, `profile_complete`, `vex_spirit` | [`types/index.ts:629`](../types/index.ts#L629) |
| `CardBgType` | `ember`, `frost`, `aurora` | [`types/index.ts:627`](../types/index.ts#L627) |
| `CheerType` | `spike`, `block`, `serve`, `dig`, `set`, `pass`, `communication` | [`types/index.ts:121`](../types/index.ts#L121) |
| `ChipVariant` | `solid`, `tint` | [`types/index.ts:937`](../types/index.ts#L937) |
| `ClubMember.role` | `owner`, `member` | [`types/index.ts:400`](../types/index.ts#L400) |
| `ConversationType` | `dm`, `club` | [`types/index.ts:547`](../types/index.ts#L547) |
| `EventAttendee.status` | `attending`, `waitlisted`, `requested`, `denied` | [`types/index.ts:156`](../types/index.ts#L156) |
| `EventGuest.status` | `attending`, `waitlisted` | [`types/index.ts:212`](../types/index.ts#L212) |
| `ExternalSession.surface` | `indoor`, `sand`, `grass` | [`types/index.ts:302`](../types/index.ts#L302) |
| `FeedbackKind` | `feature`, `bug` | [`types/index.ts:250`](../types/index.ts#L250) |
| `FeedbackPriority` | `low`, `medium`, `high` | [`types/index.ts:251`](../types/index.ts#L251) |
| `FeedFilter` | `mine`, `all`, `open_play`, `tournament`, `not_full`, `austin` | [`types/index.ts:502`](../types/index.ts#L502) |
| `FeedRsvpAction` | `join`, `leave` | [`types/index.ts:506`](../types/index.ts#L506) |
| `MembershipType` | `open`, `invite` | [`types/index.ts:363`](../types/index.ts#L363) |
| `MyEventStatus` | `hosting`, `attending`, `waitlisted`, `requested` | [`types/index.ts:487`](../types/index.ts#L487) |
| `NOTIFICATION_TYPES / NotificationType` | `event_announcement`, `cheers_received`, `event_material_change`, `waitlist_promoted`, `event_cancelled`, `badge_earned`, `cohost_added`, `cheers_reminder`, `user_mentioned`, `join_request`, `request_approved`, `request_denied` | [`types/index.ts:52`](../types/index.ts#L52) |
| `Profile.selected_border` | `bronze`, `gold`, `gradient` | [`types/index.ts:44`](../types/index.ts#L44) |
| `ProfileBorderType` | `bronze`, `gold`, `gradient` | [`constants/badges.ts:235`](../constants/badges.ts#L235) |
| `RecurrenceCadence` | `weekly`, `biweekly`, `monthly` | [`constants/events.ts:88`](../constants/events.ts#L88) |
| `TournamentBracketType` | `single`, `double` | [`types/index.ts:663`](../types/index.ts#L663) |
| `TournamentFormat` | `pool_play`, `bracket`, `pool_bracket`, `round_robin` | [`types/index.ts:662`](../types/index.ts#L662) |
| `TournamentJoinRequestStatus` | `pending`, `approved`, `declined` | [`types/index.ts:830`](../types/index.ts#L830) |
| `TournamentMatchStatus` | `scheduled`, `in_progress`, `completed`, `forfeit` | [`types/index.ts:666`](../types/index.ts#L666) |
| `TournamentStage` | `pool_play`, `bracket`, `round_robin` | [`types/index.ts:664`](../types/index.ts#L664) |
| `TournamentStatus` | `draft`, `published`, `in_progress`, `completed`, `cancelled` | [`types/index.ts:661`](../types/index.ts#L661) |
| `TournamentTeamInvitationStatus` | `pending`, `accepted`, `declined` | [`types/index.ts:819`](../types/index.ts#L819) |
| `TournamentTeamStatus` | `registered`, `waitlisted`, `free_agent`, `disqualified` | [`types/index.ts:665`](../types/index.ts#L665) |
| `VolleyballPosition` | `setter`, `libero`, `outside_hitter`, `defensive_specialist`, `opposite_hitter`, `middle_blocker` | [`types/index.ts:6`](../types/index.ts#L6) |
| `VolleyballSkillLevel` | `d`, `c`, `b`, `bb`, `a`, `aa_plus` | [`types/index.ts:15`](../types/index.ts#L15) |
<!-- END GENERATED: code-inventory -->

## Storage contracts

| Bucket | Visibility/use | Database representation |
|---|---|---|
| `avatars` | The active client treats profile photos as public and constructs public object/render URLs | `profiles.avatar_url` normally stores an object path; legacy HTTPS URLs are also accepted |
| `club-avatars` | Club avatar/cover uploads | `clubs.avatar_url` or `clubs.cover_url` stores the object path |
| `chat-images` | Public message images | `messages.image_url` stores the generated public URL |
| `badges` | Public badge artwork referenced by constants | Full public URLs are embedded in badge definitions |

Bucket names are centralized in
[`constants/storage.ts`](../constants/storage.ts). Active avatar URL resolution
is in [`utils/index.ts:284`](../utils/index.ts#L284).

## Known contract gaps to resolve before schema work

These are repository observations, not assumptions about the current live
database:

1. The repository itself says checked-in migrations are not synchronized with
   applied production history ([`CONTRIBUTING.md:150`](../CONTRIBUTING.md#L150)).
   Do not replay this folder as a complete schema or infer that an absent SQL
   definition is absent in production.
2. The notification migration constrains `kudos_received` and says clients do
   not insert inbox rows
   ([`supabase/migrations/20260402120000_notifications_inbox.sql:12`](../supabase/migrations/20260402120000_notifications_inbox.sql#L12)),
   while the current TypeScript enum uses `cheers_received` and current client
   paths directly insert several notification types
   ([`types/index.ts:51`](../types/index.ts#L51),
   [`app/(app)/event/[id].tsx:627`](../app/%28app%29/event/%5Bid%5D.tsx#L627)).
   The live constraint/policies must be inspected before editing this contract.
3. Event create/edit writes `latitude` and `longitude`, but the base `Event`
   type does not declare them
   ([`app/(app)/host.tsx:278`](../app/%28app%29/host.tsx#L278),
   [`types/index.ts:102`](../types/index.ts#L102)).
4. Current tournament code reads and writes fields/tables such as
   `venmo_handle`, scheduling columns, `is_approved`, comments, prizes,
   invitations, and join requests that are not all represented in the one
   checked-in tournament migration
   ([`types/index.ts:578`](../types/index.ts#L578),
   [`supabase/migrations/20260423120000_tournaments.sql:3`](../supabase/migrations/20260423120000_tournaments.sql#L3)).
5. Avatar privacy comments and implementation disagree. `types/index.ts` and
   `constants/storage.ts` describe a private bucket and signed URL lifetime,
   but the active resolver and splash prefetch build `/object/public` and
   `/render/image/public` URLs; there is no `createSignedUrl` call
   ([`types/index.ts:33`](../types/index.ts#L33),
   [`constants/storage.ts:7`](../constants/storage.ts#L7),
   [`utils/index.ts:290`](../utils/index.ts#L290),
   [`app/_layout.tsx:32`](../app/_layout.tsx#L32)). Confirm the live bucket's
   intended privacy before changing uploads or URL handling.
6. Because response types are handwritten and many queries are embedded in
   screens, changing a column or relationship requires checking the query
   projection, its cast, the shared type, the rendered consumers, RLS, and old
   installed native clients together.

For future contract changes, the safest order is: inspect the live schema and
policies; add backward-compatible database fields/functions; update shared
types and centralized projections; update consumers; then attach test evidence
covering the final request/response path.
