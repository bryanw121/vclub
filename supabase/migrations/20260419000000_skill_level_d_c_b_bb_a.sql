-- Migrate profiles.skill_level from verbose labels to short tier codes
-- matching the event skill_level tag names: D (Newbie), C, B, BB, A, AA+

-- Drop old check constraint
ALTER TABLE profiles DROP CONSTRAINT profiles_skill_level_valid;

-- Migrate existing data to new values (best-effort mapping)
UPDATE profiles SET skill_level = CASE skill_level
  WHEN 'recreational' THEN 'd'
  WHEN 'beginner'     THEN 'd'
  WHEN 'intermediate' THEN 'c'
  WHEN 'advanced'     THEN 'b'
  WHEN 'competitive'  THEN 'a'
  ELSE NULL
END WHERE skill_level IS NOT NULL;

-- Add new check constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_skill_level_valid
  CHECK (skill_level IS NULL OR skill_level = ANY(ARRAY['d','c','b','bb','a','aa_plus']));
