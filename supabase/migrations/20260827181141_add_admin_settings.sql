CREATE TABLE IF NOT EXISTS admin_settings (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  anthropic_api_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_admin_settings" ON admin_settings;
CREATE POLICY "insert_own_admin_settings" ON admin_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_admin_settings" ON admin_settings;
CREATE POLICY "update_own_admin_settings" ON admin_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_admin_settings" ON admin_settings;
CREATE POLICY "delete_own_admin_settings" ON admin_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

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