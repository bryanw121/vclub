-- Decouple "host must approve joins" from "this event costs money".
--
-- Before this migration there was no approval setting at all: the client
-- inferred it from `price > 0` (event/[id].tsx — `const isPaidEvent =
-- (event?.price ?? 0) > 0`). That meant setting a price silently turned on
-- screening, a free event could never be screened, and nothing in the UI told
-- a player which rule applied to the event they were looking at.
--
-- Approval is now an explicit per-event flag the host sets with a checkbox.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.requires_approval IS
  'Host must approve each join request. Independent of price — a free event can require approval and a paid one can be open.';

-- Backfill preserves today's observable behaviour exactly: every currently
-- paid event keeps its approval gate, every free event stays open. The app has
-- live users mid-season, so deploying this must be a no-op for events people
-- have already joined or are waiting on.
--
-- Guarded so re-running the migration can't clobber a host's later choice:
-- only rows still at the column default are touched.
UPDATE public.events
SET requires_approval = true
WHERE COALESCE(price, 0) > 0
  AND requires_approval = false;

-- Feed and detail queries filter/expose this column on every event read.
CREATE INDEX IF NOT EXISTS events_requires_approval_idx
  ON public.events (requires_approval)
  WHERE requires_approval = true;
