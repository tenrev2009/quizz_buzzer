/*
# Update reset_game to also clean player_answers

1. Modified Functions
   - `reset_game(p_session_id)`: Now also deletes player_answers for all rounds
     of the session before deleting rounds and session_players. This ensures a
     completely clean slate when the admin resets a game.

2. Notes
   - player_answers reference round_id, so they must be deleted before rounds.
   - game_events are kept for audit trail.
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

  DELETE FROM player_answers WHERE round_id IN (SELECT id FROM rounds WHERE session_id = p_session_id);
  DELETE FROM round_blocks WHERE round_id IN (SELECT id FROM rounds WHERE session_id = p_session_id);
  DELETE FROM rounds WHERE session_id = p_session_id;
  DELETE FROM session_players WHERE session_id = p_session_id;

  UPDATE quiz_sessions SET status='waiting', winner_id=NULL, current_round_id=NULL WHERE id = p_session_id;

  INSERT INTO game_events(session_id, type, payload) VALUES (p_session_id, 'game_reset', '{}'::jsonb);
END;
$$;
