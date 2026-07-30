/*
# Update reset_game to clear players on reset

1. Modified Functions
   - `reset_game(p_session_id)`: Now also deletes all session_players so old
     disconnected players are removed and the lobby starts fresh.

2. Notes
   - Players will need to rejoin with the session code after a reset.
   - player_answers are deleted via CASCADE from rounds deletion.
*/

CREATE OR REPLACE FUNCTION reset_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin uuid;
BEGIN
  SELECT admin_id INTO v_admin FROM quiz_sessions WHERE id = p_session_id;
  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;

  DELETE FROM round_blocks WHERE round_id IN (SELECT id FROM rounds WHERE session_id = p_session_id);
  DELETE FROM rounds WHERE session_id = p_session_id;
  DELETE FROM session_players WHERE session_id = p_session_id;

  UPDATE quiz_sessions SET status='waiting', winner_id=NULL, current_round_id=NULL WHERE id = p_session_id;

  INSERT INTO game_events(session_id, type, payload) VALUES (p_session_id, 'game_reset', '{}'::jsonb);
END;
$$;
