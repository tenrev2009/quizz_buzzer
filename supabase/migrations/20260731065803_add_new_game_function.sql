/*
# Add new_game function (keeps players, resets scores/rounds only)

1. New Functions
   - `new_game(p_session_id)`: Resets scores to 0, deletes all rounds/answers/blocks,
     but KEEPS the players connected. The session goes back to 'playing' status so the
     admin can start new questions immediately with the same players.

2. Modified Functions
   - `reset_game(p_session_id)`: Unchanged - still does a full reset including removing players.
     Use this only when you want players to rejoin from scratch.

3. Notes
   - new_game is for "play again with same players"
   - reset_game is for "start completely fresh, players must rejoin"
*/

CREATE OR REPLACE FUNCTION new_game(p_session_id uuid)
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

  -- Clean rounds data but keep players
  DELETE FROM player_answers WHERE round_id IN (SELECT id FROM rounds WHERE session_id = p_session_id);
  DELETE FROM round_blocks WHERE round_id IN (SELECT id FROM rounds WHERE session_id = p_session_id);
  DELETE FROM rounds WHERE session_id = p_session_id;

  -- Reset all player scores to 0
  UPDATE session_players SET score = 0 WHERE session_id = p_session_id;

  -- Set session back to playing (players are already there)
  UPDATE quiz_sessions SET status = 'playing', winner_id = NULL, current_round_id = NULL WHERE id = p_session_id;

  INSERT INTO game_events(session_id, type, payload) VALUES (p_session_id, 'new_game', '{}'::jsonb);
END;
$$;
