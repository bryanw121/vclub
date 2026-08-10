-- Grant the Vex Spirit badge to jexyissexy.
--
-- vex_spirit is never auto-awarded: constants/badges.ts sets
-- VEX_MEMBER_ACTIVE = false ("grant manually via DB insert per user"), so
-- membership badges are handed out by statements like this one.
--
-- Selects the target by username rather than hardcoding the UUID, which keeps
-- this replay-safe: it is a no-op on any environment where that member does
-- not exist, instead of failing the FK and breaking a bootstrap.
-- `on conflict do nothing` makes re-running it idempotent.
insert into user_badges (user_id, badge_type, tier)
select id, 'vex_spirit', 1
from profiles
where username = 'jexyissexy'
on conflict do nothing;
