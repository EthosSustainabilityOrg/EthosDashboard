-- Migration 028: users nullable columns for Google sign-up
-- POST /api/applications auto-creates a bare users row from Google profile
-- data on first application. Google provides no date of birth or guardian
-- info, so these three columns can no longer be NOT NULL at insert time.
-- All three feed compliance-relevant flows (under-13/14 age gate, parental
-- consent via OpenSign) — we insert NULL rather than fabricated placeholder
-- values, and the real values are collected and backfilled later in the
-- application flow.

ALTER TABLE public.users
  ALTER COLUMN date_of_birth DROP NOT NULL;

ALTER TABLE public.users
  ALTER COLUMN guardian_name DROP NOT NULL;

ALTER TABLE public.users
  ALTER COLUMN guardian_email DROP NOT NULL;
