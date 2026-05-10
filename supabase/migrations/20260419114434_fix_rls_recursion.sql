/*
  # Fix infinite recursion in RLS policies

  1. Problem
    - quiz_sessions SELECT policy references session_players
    - session_players SELECT policy references quiz_sessions
    - This creates infinite recursion when either table is queried

  2. Solution
    - Create SECURITY DEFINER helper functions that bypass RLS when
      checking membership/admin relationships
    - Replace the recursive EXISTS subqueries in the policies with calls
      to these helper functions

  3. Security
    - Helper functions only return booleans based on auth.uid()
    - No data is leaked; same access model is preserved
*/

CREATE OR REPLACE FUNCTION public.is_session_admin(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE id = p_session_id AND admin_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_session_member(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session_players
    WHERE session_id = p_session_id AND player_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_session_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admin or member can select sessions" ON quiz_sessions;
CREATE POLICY "Admin or member can select sessions"
  ON quiz_sessions FOR SELECT
  TO authenticated
  USING (
    admin_id = auth.uid() OR public.is_session_member(id)
  );

DROP POLICY IF EXISTS "Members and admin can view session players" ON session_players;
CREATE POLICY "Members and admin can view session players"
  ON session_players FOR SELECT
  TO authenticated
  USING (
    player_id = auth.uid() OR public.is_session_admin(session_id)
  );

DROP POLICY IF EXISTS "Admin or self can update session_players" ON session_players;
CREATE POLICY "Admin or self can update session_players"
  ON session_players FOR UPDATE
  TO authenticated
  USING (
    player_id = auth.uid() OR public.is_session_admin(session_id)
  )
  WITH CHECK (
    player_id = auth.uid() OR public.is_session_admin(session_id)
  );

DROP POLICY IF EXISTS "Admin or self can delete session_players" ON session_players;
CREATE POLICY "Admin or self can delete session_players"
  ON session_players FOR DELETE
  TO authenticated
  USING (
    player_id = auth.uid() OR public.is_session_admin(session_id)
  );
