-- Grant the Vex Spirit badge to rikaboy0.
-- See 20260810044943_grant_vex_spirit_badge_jexyissexy.sql for why this selects
-- by username and uses `on conflict do nothing`.
insert into user_badges (user_id, badge_type, tier)
select id, 'vex_spirit', 1
from profiles
where username = 'rikaboy0'
on conflict do nothing;
