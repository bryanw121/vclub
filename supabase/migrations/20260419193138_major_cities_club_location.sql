-- Curated major cities for club location (dropdown + autocomplete in the app).
-- Clubs reference a single row so labels stay consistent.

CREATE TABLE public.major_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  city_name text NOT NULL,
  admin_region text,
  country_code text NOT NULL DEFAULT 'US',
  CONSTRAINT major_cities_display_name_key UNIQUE (display_name)
);

COMMENT ON TABLE public.major_cities IS 'Curated metros for club location; app uses read-only list with autocomplete.';
COMMENT ON COLUMN public.major_cities.display_name IS 'Unique label shown in UI, e.g. Austin, TX';

CREATE INDEX major_cities_display_name_lower_idx ON public.major_cities (lower(display_name) text_pattern_ops);
CREATE INDEX major_cities_city_name_lower_idx ON public.major_cities (lower(city_name) text_pattern_ops);

-- Seed before RLS (migration role inserts rows).
INSERT INTO public.major_cities (display_name, city_name, admin_region, country_code) VALUES
('Albuquerque, NM', 'Albuquerque', 'NM', 'US'),
('Anchorage, AK', 'Anchorage', 'AK', 'US'),
('Arlington, TX', 'Arlington', 'TX', 'US'),
('Atlanta, GA', 'Atlanta', 'GA', 'US'),
('Austin, TX', 'Austin', 'TX', 'US'),
('Bakersfield, CA', 'Bakersfield', 'CA', 'US'),
('Baltimore, MD', 'Baltimore', 'MD', 'US'),
('Baton Rouge, LA', 'Baton Rouge', 'LA', 'US'),
('Birmingham, AL', 'Birmingham', 'AL', 'US'),
('Boise, ID', 'Boise', 'ID', 'US'),
('Boston, MA', 'Boston', 'MA', 'US'),
('Buffalo, NY', 'Buffalo', 'NY', 'US'),
('Chandler, AZ', 'Chandler', 'AZ', 'US'),
('Charlotte, NC', 'Charlotte', 'NC', 'US'),
('Chicago, IL', 'Chicago', 'IL', 'US'),
('Chula Vista, CA', 'Chula Vista', 'CA', 'US'),
('Cincinnati, OH', 'Cincinnati', 'OH', 'US'),
('Cleveland, OH', 'Cleveland', 'OH', 'US'),
('Colorado Springs, CO', 'Colorado Springs', 'CO', 'US'),
('Columbus, OH', 'Columbus', 'OH', 'US'),
('Corpus Christi, TX', 'Corpus Christi', 'TX', 'US'),
('Dallas, TX', 'Dallas', 'TX', 'US'),
('Denver, CO', 'Denver', 'CO', 'US'),
('Des Moines, IA', 'Des Moines', 'IA', 'US'),
('Detroit, MI', 'Detroit', 'MI', 'US'),
('Durham, NC', 'Durham', 'NC', 'US'),
('El Paso, TX', 'El Paso', 'TX', 'US'),
('Fort Lauderdale, FL', 'Fort Lauderdale', 'FL', 'US'),
('Fort Wayne, IN', 'Fort Wayne', 'IN', 'US'),
('Fort Worth, TX', 'Fort Worth', 'TX', 'US'),
('Fremont, CA', 'Fremont', 'CA', 'US'),
('Fresno, CA', 'Fresno', 'CA', 'US'),
('Garland, TX', 'Garland', 'TX', 'US'),
('Gilbert, AZ', 'Gilbert', 'AZ', 'US'),
('Glendale, AZ', 'Glendale', 'AZ', 'US'),
('Greensboro, NC', 'Greensboro', 'NC', 'US'),
('Henderson, NV', 'Henderson', 'NV', 'US'),
('Honolulu, HI', 'Honolulu', 'HI', 'US'),
('Houston, TX', 'Houston', 'TX', 'US'),
('Huntington Beach, CA', 'Huntington Beach', 'CA', 'US'),
('Indianapolis, IN', 'Indianapolis', 'IN', 'US'),
('Irvine, CA', 'Irvine', 'CA', 'US'),
('Irving, TX', 'Irving', 'TX', 'US'),
('Jacksonville, FL', 'Jacksonville', 'FL', 'US'),
('Jersey City, NJ', 'Jersey City', 'NJ', 'US'),
('Kansas City, MO', 'Kansas City', 'MO', 'US'),
('Laredo, TX', 'Laredo', 'TX', 'US'),
('Las Vegas, NV', 'Las Vegas', 'NV', 'US'),
('Lexington, KY', 'Lexington', 'KY', 'US'),
('Lincoln, NE', 'Lincoln', 'NE', 'US'),
('Little Rock, AR', 'Little Rock', 'AR', 'US'),
('Long Beach, CA', 'Long Beach', 'CA', 'US'),
('Los Angeles, CA', 'Los Angeles', 'CA', 'US'),
('Louisville, KY', 'Louisville', 'KY', 'US'),
('Lubbock, TX', 'Lubbock', 'TX', 'US'),
('Madison, WI', 'Madison', 'WI', 'US'),
('Memphis, TN', 'Memphis', 'TN', 'US'),
('Mesa, AZ', 'Mesa', 'AZ', 'US'),
('Miami, FL', 'Miami', 'FL', 'US'),
('Milwaukee, WI', 'Milwaukee', 'WI', 'US'),
('Minneapolis, MN', 'Minneapolis', 'MN', 'US'),
('Modesto, CA', 'Modesto', 'CA', 'US'),
('Montgomery, AL', 'Montgomery', 'AL', 'US'),
('Nashville, TN', 'Nashville', 'TN', 'US'),
('New Orleans, LA', 'New Orleans', 'LA', 'US'),
('New York, NY', 'New York', 'NY', 'US'),
('Newark, NJ', 'Newark', 'NJ', 'US'),
('Norfolk, VA', 'Norfolk', 'VA', 'US'),
('North Las Vegas, NV', 'North Las Vegas', 'NV', 'US'),
('Oakland, CA', 'Oakland', 'CA', 'US'),
('Oklahoma City, OK', 'Oklahoma City', 'OK', 'US'),
('Omaha, NE', 'Omaha', 'NE', 'US'),
('Orlando, FL', 'Orlando', 'FL', 'US'),
('Philadelphia, PA', 'Philadelphia', 'PA', 'US'),
('Phoenix, AZ', 'Phoenix', 'AZ', 'US'),
('Pittsburgh, PA', 'Pittsburgh', 'PA', 'US'),
('Plano, TX', 'Plano', 'TX', 'US'),
('Portland, OR', 'Portland', 'OR', 'US'),
('Raleigh, NC', 'Raleigh', 'NC', 'US'),
('Reno, NV', 'Reno', 'NV', 'US'),
('Richmond, VA', 'Richmond', 'VA', 'US'),
('Riverside, CA', 'Riverside', 'CA', 'US'),
('Rochester, NY', 'Rochester', 'NY', 'US'),
('Sacramento, CA', 'Sacramento', 'CA', 'US'),
('Salt Lake City, UT', 'Salt Lake City', 'UT', 'US'),
('San Antonio, TX', 'San Antonio', 'TX', 'US'),
('San Diego, CA', 'San Diego', 'CA', 'US'),
('San Francisco, CA', 'San Francisco', 'CA', 'US'),
('San Jose, CA', 'San Jose', 'CA', 'US'),
('Santa Ana, CA', 'Santa Ana', 'CA', 'US'),
('Scottsdale, AZ', 'Scottsdale', 'AZ', 'US'),
('Seattle, WA', 'Seattle', 'WA', 'US'),
('Shreveport, LA', 'Shreveport', 'LA', 'US'),
('Spokane, WA', 'Spokane', 'WA', 'US'),
('St. Louis, MO', 'St. Louis', 'MO', 'US'),
('St. Paul, MN', 'St. Paul', 'MN', 'US'),
('Stockton, CA', 'Stockton', 'CA', 'US'),
('Tacoma, WA', 'Tacoma', 'WA', 'US'),
('Tampa, FL', 'Tampa', 'FL', 'US'),
('Toledo, OH', 'Toledo', 'OH', 'US'),
('Tucson, AZ', 'Tucson', 'AZ', 'US'),
('Tulsa, OK', 'Tulsa', 'OK', 'US'),
('Virginia Beach, VA', 'Virginia Beach', 'VA', 'US'),
('Washington, DC', 'Washington', 'DC', 'US'),
('Wichita, KS', 'Wichita', 'KS', 'US'),
('Winston-Salem, NC', 'Winston-Salem', 'NC', 'US'),
('La Jolla, CA', 'La Jolla', 'CA', 'US'),
('Calgary, AB', 'Calgary', 'AB', 'CA'),
('Montreal, QC', 'Montreal', 'QC', 'CA'),
('Toronto, ON', 'Toronto', 'ON', 'CA'),
('Vancouver, BC', 'Vancouver', 'BC', 'CA');

ALTER TABLE public.major_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read major_cities"
  ON public.major_cities
  FOR SELECT
  USING (true);

ALTER TABLE public.clubs
  ADD COLUMN major_city_id uuid REFERENCES public.major_cities (id) ON DELETE RESTRICT;

UPDATE public.clubs c
SET major_city_id = m.id
FROM public.major_cities m
WHERE m.display_name = 'San Diego, CA';

UPDATE public.clubs c
SET major_city_id = (SELECT id FROM public.major_cities WHERE display_name = 'San Diego, CA' LIMIT 1)
WHERE c.major_city_id IS NULL;

ALTER TABLE public.clubs
  ALTER COLUMN major_city_id SET NOT NULL;

DROP INDEX IF EXISTS public.idx_clubs_location_label_lower;

ALTER TABLE public.clubs
  DROP COLUMN IF EXISTS location_label;

COMMENT ON COLUMN public.clubs.major_city_id IS 'FK to major_cities; canonical club metro for search and display.';
