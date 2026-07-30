/*
# Remove auto-finish from QCM resolve functions

1. Modified Functions
   - `resolve_qcm_round(p_round_id)`: Removed the winner check / auto-finish logic.
     The round is closed and points awarded, but the session stays in 'playing' state
     until the admin explicitly finishes it.
   - `resolve_round(p_round_id, p_correct)`: For QCM mode sessions, removed auto-finish.
     For pure buzzer sessions (game_mode='buzzer'), kept the target_score auto-finish.
   - `finish_game(p_session_id)`: New function allowing admin to manually end a game,
     determining the winner by highest score at that point.

2. Notes
   - In QCM mode, ALL questions are played regardless of scores.
   - The game only ends when the admin calls finish_game.
   - Winner is determined by highest score when admin finishes.
*/

-- resolve_qcm_round: no longer auto-finishes
CREATE OR REPLACE FUNCTION resolve_qcm_round(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_question_id uuid;
  v_correct_index int;
  v_question_type text;
  v_points int;
BEGIN
  SELECT session_id, question_id INTO v_session_id, v_question_id
  FROM rounds WHERE id = p_round_id;

  SELECT correct_index, question_type INTO v_correct_index, v_question_type
  FROM quiz_questions WHERE id = v_question_id;

  v_points := CASE v_question_type
    WHEN 'choice_2' THEN 1
    WHEN 'choice_4' THEN 2
    WHEN 'buzzer' THEN 3
    ELSE 1
  END;

  IF v_correct_index IS NOT NULL THEN
    UPDATE session_players sp
    SET score = score + v_points
    WHERE sp.session_id = v_session_id
    AND sp.player_id IN (
      SELECT pa.player_id FROM player_answers pa
      WHERE pa.round_id = p_round_id AND pa.answer_index = v_correct_index
    );
  END IF;

  UPDATE rounds SET status = 'closed', outcome = 'correct', resolved_at = now()
  WHERE id = p_round_id;

  UPDATE quiz_sessions SET current_round_id = NULL
  WHERE id = v_session_id;
END;
$$;

-- resolve_round: no auto-finish in QCM mode
CREATE OR REPLACE FUNCTION resolve_round(p_round_id uuid, p_correct boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session uuid;
  v_admin uuid;
  v_buzzer uuid;
  v_target int;
  v_new_score int;
  v_question_id uuid;
  v_question_type text;
  v_points int;
  v_game_mode text;
BEGIN
  SELECT r.session_id, s.admin_id, r.first_buzzer_id, s.target_score, r.question_id, s.game_mode
  INTO v_session, v_admin, v_buzzer, v_target, v_question_id, v_game_mode
  FROM rounds r JOIN quiz_sessions s ON s.id = r.session_id
  WHERE r.id = p_round_id;

  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;
  IF v_buzzer IS NULL THEN RAISE EXCEPTION 'No buzzer'; END IF;

  IF v_question_id IS NOT NULL THEN
    SELECT question_type INTO v_question_type FROM quiz_questions WHERE id = v_question_id;
    v_points := CASE v_question_type
      WHEN 'choice_2' THEN 1
      WHEN 'choice_4' THEN 2
      WHEN 'buzzer' THEN 3
      ELSE 3
    END;
  ELSE
    v_points := 3;
  END IF;

  IF p_correct THEN
    UPDATE session_players SET score = score + v_points
    WHERE session_id = v_session AND player_id = v_buzzer
    RETURNING score INTO v_new_score;

    UPDATE rounds SET status='closed', outcome='correct', resolved_at=now()
    WHERE id = p_round_id;

    INSERT INTO game_events(session_id, type, payload)
    VALUES (v_session, 'round_correct', jsonb_build_object('round_id', p_round_id, 'player_id', v_buzzer, 'score', v_new_score));

    -- Only auto-finish in pure buzzer mode (not QCM)
    IF v_game_mode = 'buzzer' AND v_new_score >= v_target THEN
      UPDATE quiz_sessions SET status='finished', winner_id=v_buzzer, current_round_id=NULL WHERE id = v_session;
      INSERT INTO game_events(session_id, type, payload)
      VALUES (v_session, 'game_won', jsonb_build_object('player_id', v_buzzer));
    ELSE
      UPDATE quiz_sessions SET current_round_id=NULL WHERE id = v_session;
    END IF;
  ELSE
    INSERT INTO round_blocks(round_id, player_id) VALUES (p_round_id, v_buzzer)
    ON CONFLICT DO NOTHING;
    UPDATE rounds
    SET status='open', first_buzzer_id=NULL, first_buzz_at=NULL, outcome=NULL
    WHERE id = p_round_id;
    INSERT INTO game_events(session_id, type, payload)
    VALUES (v_session, 'round_wrong', jsonb_build_object('round_id', p_round_id, 'player_id', v_buzzer));
  END IF;
END;
$$;

-- New function: admin manually finishes the game
CREATE OR REPLACE FUNCTION finish_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin uuid;
  v_winner_id uuid;
BEGIN
  SELECT admin_id INTO v_admin FROM quiz_sessions WHERE id = p_session_id;
  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;

  -- Winner is whoever has the highest score
  SELECT player_id INTO v_winner_id
  FROM session_players
  WHERE session_id = p_session_id
  ORDER BY score DESC
  LIMIT 1;

  UPDATE quiz_sessions
  SET status = 'finished', winner_id = v_winner_id, current_round_id = NULL
  WHERE id = p_session_id;

  INSERT INTO game_events(session_id, type, payload)
  VALUES (p_session_id, 'game_finished', jsonb_build_object('winner_id', COALESCE(v_winner_id::text, '')));
END;
$$;
