/*
# Add per-admin settings (Anthropic API key)

1. New Tables
   - `admin_settings`
     - `user_id` (uuid, PK, references profiles) — the admin who owns the key
     - `anthropic_api_key` (text) — used server-side by the generate-quiz function
     - `created_at`, `updated_at` (timestamptz)

2. Security
   - RLS enabled.
   - Admins may INSERT / UPDATE / DELETE their own row.
   - There is deliberately **no SELECT policy**: without one, PostgREST cannot
     read the table at all, so the stored key can never travel back to the
     browser — not through the app, and not through a crafted request with the
     anon key. Writes must therefore use `returning: 'minimal'`, since the
     default representation response would require SELECT.
   - `anthropic_key_status()` is SECURITY DEFINER so the UI can still show
     whether a key is set and its last 4 characters, without exposing the key.
     Its search_path is pinned to resist search_path hijacking.

3. Notes
   - The generate-quiz edge function reads this table with the service role,
     which bypasses RLS. Anyone holding the service role key or dashboard
     access can read the key — that is inherent to storing a secret in the
     database rather than in the function's own secrets.
*/

CREATE TABLE IF NOT EXISTS admin_settings (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  anthropic_api_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- No SELECT policy on purpose: the key must never be readable from the client.
DROP POLICY IF EXISTS "insert_own_admin_settings" ON admin_settings;
CREATE POLICY "insert_own_admin_settings" ON admin_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_admin_settings" ON admin_settings;
CREATE POLICY "update_own_admin_settings" ON admin_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_admin_settings" ON admin_settings;
CREATE POLICY "delete_own_admin_settings" ON admin_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Lets the UI report "a key is configured, ending in ...abcd" without ever
-- returning the key itself.
CREATE OR REPLACE FUNCTION anthropic_key_status()
RETURNS TABLE (configured boolean, hint text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    (s.anthropic_api_key IS NOT NULL AND length(s.anthropic_api_key) > 0) AS configured,
    CASE
      WHEN s.anthropic_api_key IS NULL OR length(s.anthropic_api_key) < 4 THEN NULL
      ELSE right(s.anthropic_api_key, 4)
    END AS hint
  FROM admin_settings s
  WHERE s.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION anthropic_key_status() FROM public;
GRANT EXECUTE ON FUNCTION anthropic_key_status() TO authenticated;
