/*
# Write the Anthropic key through a function instead of an upsert

1. Problem
   - `admin_settings` has no SELECT policy on purpose: without one the stored
     key can never be read back from the browser.
   - The client wrote it with `upsert()`, which PostgREST turns into
     `INSERT ... ON CONFLICT DO UPDATE`. Resolving a conflict requires reading
     the existing row, which RLS forbids here — so the write failed with
     "new row violates row-level security policy".
   - The protection and the write path contradicted each other.

2. Fix
   - `set_anthropic_key(text)` and `clear_anthropic_key()` are SECURITY DEFINER,
     so they perform the upsert with the definer's rights, past RLS.
   - They derive the owner from `auth.uid()` server-side rather than trusting a
     `user_id` sent by the client, so one admin cannot write another's key.
   - `search_path` is pinned, and EXECUTE is granted to `authenticated` only.

3. Notes
   - The table keeps no SELECT policy. Reading is still impossible from the
     client; `anthropic_key_status()` remains the only way to learn whether a
     key exists, and it returns just that plus the last four characters.
*/

CREATE OR REPLACE FUNCTION set_anthropic_key(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;

  IF p_key IS NULL OR length(btrim(p_key)) = 0 THEN
    RAISE EXCEPTION 'Cle vide';
  END IF;

  INSERT INTO admin_settings (user_id, anthropic_api_key, updated_at)
  VALUES (auth.uid(), btrim(p_key), now())
  ON CONFLICT (user_id) DO UPDATE
    SET anthropic_api_key = EXCLUDED.anthropic_api_key,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION clear_anthropic_key()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;

  DELETE FROM admin_settings WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION set_anthropic_key(text) FROM public;
REVOKE ALL ON FUNCTION clear_anthropic_key() FROM public;
GRANT EXECUTE ON FUNCTION set_anthropic_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_anthropic_key() TO authenticated;
