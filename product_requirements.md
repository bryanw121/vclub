# Product Requirements Document (PRD)

## vclub — Volleyball Events Platform

### Document Purpose
Define the product problem, goals, users, functional requirements, KPIs, risks, and a roadmap for `vclub`.

### Current State (from code)
The app is an Expo Router + React Native client backed by Supabase.

- Auth
  - Register with `username`, `email`, `password`
  - Login with email or username (username is resolved to email via RPC `get_email_by_user_id`)
- Main (custom bottom tabs with swipe pager)
  - `Events`: week strip + month calendar; lists events for the selected day (events are filtered to `event_date >= startOfToday()`)
  - `Create`: create an event with `title`, `description`, `location`, `date/time`, optional `max_attendees`
  - `Profile`: view username + account created date and sign out
- Event detail
  - Fetches event + host profile + attendee list
  - Join/Leave for non-owners
  - Host-only actions: delete event and remove attendees

What is NOT implemented yet (referenced in steering docs but absent from current UI/data flows):
- Tournament mode (pool + bracket + trophies)
- Teams (randomization + pinning)
- Points, kudos, notifications, and richer profile (position + stats)

---

## 1. Problem Statement
Volleyball players need a reliable way to discover nearby/available open play sessions and RSVP quickly. Hosts need a simple tool to publish events and manage attendance. The product should also establish a foundation for future competitive features: tournaments, teams, stats, and reputation.

---

## 2. Goals
1. Make joining volleyball events effortless.
2. Give hosts clear control (capacity + roster management) without adding complexity for players.
3. Create an extensible foundation for future offerings: tournaments, teams, stats/reputation, and notifications.

---

## 3. Non-Goals (for the current MVP)
- Full tournament lifecycle and bracket runner
- Team randomization + host pinning workflow
- Points system, kudos, and player reputation UI
- Notification framework (push/email/in-app triggers)
- Monetization features (ads/sponsored events)

---

## 4. Target Users & Personas
1. Casual Player
   - Wants to quickly see what is happening soon and RSVP with minimal effort.
2. Event Host
   - Wants to create an event fast, optionally set capacity, and manage attendee list.
3. Organizer / Club Admin (future)
   - Wants tournament structure, progression, and reporting.
4. Power Player (future)
   - Wants stats, reputation signals, and engagement loops.

---

## 5. Product Offerings (bundled experiences)

### Offering A: Open Play Discovery & RSVP (Player Companion)
**Core value:** Find the next best session and confirm attendance.

**In-scope (v1, current behavior):**
- Week and month date navigation with event markers
- Day-scoped event list
- Event detail with Join/Leave
- Visual capacity status:
  - `max_attendees` -> “Full” and remaining spots badge

**User stories:**
- As a player, I can browse upcoming events by date and RSVP in seconds.
- As a player, I can see who else is going to an event.

### Offering B: Event Creation & Host Management (Host Toolkit)
**Core value:** Publish sessions and manage the roster up to capacity.

**In-scope (v1, current behavior):**
- Create event form (title, description, location, date/time, optional max attendees)
- Host-only actions:
  - Delete event
  - Remove attendee
- Host and players see attendance changes after RSVP actions

**User stories:**
- As a host, I can create an event in under a minute.
- As a host, I can keep my event within capacity and manage the attendee list.

### Offering C: Tournament Mode (Organizer Console)
**Core value:** Run tournaments with predictable structure and results visibility.

**In-scope (v2+):**
- Tournament creation with host-configured rules
- Pool play and single-elimination bracket
- Tie rules for bracket advancement (and 3rd place handling per requirements)
- Trophy winners persisted on a winner’s profile

**User stories:**
- As an organizer, I can create a tournament and configure bracket settings.
- As a player, I can view upcoming/past tournament results and placements.

### Offering D: Teams & Pairing Engine
**Core value:** Convert participation into fair teams.

**In-scope (v2+):**
- Works for both open play and tournament contexts
- Teams randomized by default
- Host pinning: select specific players to be on the same team before randomization
- Team assignment happens after RSVP closes or when host triggers it

**User stories:**
- As a host, I can pin players before teams are generated.
- As a player, I can view my assigned team for an event.

### Offering E: Reputation & Engagement (Points + Kudos + Notifications)
**Core value:** Reward participation and increase engagement via social reinforcement.

**In-scope (v2+):**
- Points awarded only after the event ends:
  - Open play: 2 points
  - Tournament: 5 points
- Kudos after event ends:
  - Each attendee can give up to 5 kudos per event
  - Kudos increments a recipient’s displayed count on profile
- Notifications infrastructure (incremental triggers; not hard-coded to a fixed set)

**User stories:**
- As a player, I can build a reputation using points and kudos over time.
- As a player, I receive a notification when someone gives kudos to me.

---

## 6. Functional Requirements

### 6.1 Authentication & Profiles
Current:
- Register and login with email or username resolution through RPC.
Planned:
- Allow profile fields beyond username/created_at:
  - Position selection (Setter, Libero, OH, DS, OPP)
  - Display points accumulated
  - Display total kudos received
  - Display previous events attended

### 6.2 Events (MVP)
Current:
- List upcoming events from today onward
- Week strip and month calendar navigation
- Event detail:
  - Join/Leave toggling via insert/delete in `event_attendees`
  - Host-only delete/remove

Planned:
- Add tagging and filters:
  - Tags are predefined (e.g., “open play” / “tournament”) and extensible later
- Ensure server-side constraints for capacity under concurrency

### 6.3 Attendance, Teams, and Tournaments (Future)
Planned:
- Add tournament models and bracket progression
- Add team member models and pairing workflow

---

## 7. Metrics and KPIs
MVP KPIs:
- Activation: % of new signups who create their first event or join their first event
- Event discovery conversion: event card tap -> event detail view
- RSVP conversion: event detail view -> join
- Retention: user active within 7 and 30 days
- Host success: % of created events that reach at least N attendees

Future KPIs:
- Tournament participation rate
- Team assignment completion rate
- Kudos engagement (kudos recipients per event, kudos sent per attendee)
- Notification performance (CTR/open rate)

---

## 8. Assumptions
- Supabase RLS policies and database constraints prevent invalid attendance states.
- Capacity limits should be enforced server-side for correctness under concurrent RSVP actions.

---

## 9. Risks & Mitigations
1. Race conditions on capacity
   - Risk: concurrent joins can exceed `max_attendees`.
   - Mitigation: enforce constraints and/or atomic operations server-side (DB/RPC), not only UI gating.

2. Data model growth complexity
   - Risk: layering tournaments/teams/stats on top of the “events” abstraction can create coupling.
   - Mitigation: introduce tournament entities and relationship tables cleanly; keep open play and tournament flows coherent.

3. Notifications scope creep
   - Risk: too many triggers too early.
   - Mitigation: build a trigger framework and start with one narrow trigger (e.g., “kudos received”), iterating incrementally.

---

## 10. Roadmap (High Level)
Phase 1 (MVP): Open Play Discovery, RSVP, and Host Toolkit (implemented)
Phase 2: Teams & Pairing Engine + Tournament structure
Phase 3: Points + Kudos + Profile reputation surfaces
Phase 4: Notifications + feedback/submissions + monetization experiments

---

## 11. Open Questions
1. Should open play and tournament share the same event detail UI, or be separate experiences?
2. How should RSVP closure work for tournaments/teams:
   - fixed time window vs host-triggered?
3. Should kudos be visible immediately when the event ends or after a processing window?
4. Monetization direction:
   - player-facing ads/sponsored events vs an organizer subscription model?

