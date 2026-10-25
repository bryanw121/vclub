-- Decouple "host must approve joins" from "this event costs money" (#42).
--
-- Approval used to be inferred client-side from `price > 0`. It is now an
-- explicit per-event flag the host sets in the create/edit form.
--
-- Already applied to the live project; idempotent so replaying it is a no-op.
-- The original branch also backfilled `requires_approval = true WHERE price > 0`;
-- that has already been done on the live data and is deliberately not repeated
-- here, since a replay would override hosts who have since turned approval off.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.requires_approval IS
  'Host must approve each join request. Independent of price: a free event can require approval and a paid one can be open.';
