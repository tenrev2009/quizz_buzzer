/*
# Add skip_qcm_round function and update scoring system

1. New Functions
   - `skip_qcm_round(p_round_id)`: Allows admin to skip the current question
     without awarding points. Closes the round with outcome='skipped' and
     clears current_round_id on the session.

2. Modified Functions
   - `resolve_qcm_round(p_round_id)`: Updated scoring based on question type:
     - choice_2 (2 choices) = 1 point
     - choice_4 (4 choices) = 2 points
     - buzzer = 3 points
   - `resolve_round(p_round_id, p_correct)`: Updated buzzer scoring to 3 points.

3. Notes
   - Skip does not award any points.
   - The skipped question counts as "played" (status='closed').
*/

-- Skip function: close the round without awarding points
CREATE OR REPLACE FUNCTION skip_qcm_round(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session_id uuid;
  v_admin uuid;
BEGIN
  SELECT r.session_id, s.admin_id
  INTO v_session_id, v_admin
  FROM rounds r JOIN quiz_sessions s ON s.id = r.session_id
  WHERE r.id = p_round_id;

  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;

  UPDATE rounds SET status = 'closed', outcome = 'skipped', resolved_at = now()
  WHERE id = p_round_id;

  UPDATE quiz_sessions SET current_round_id = NULL
  WHERE id = v_session_id;

  INSERT INTO game_events (session_id, type, payload)
  VALUES (v_session_id, 'round_skipped', jsonb_build_object('round_id', p_round_id));
END;
$$;

-- Updated resolve_qcm_round with variable scoring
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
  v_target int;
  v_winner_id uuid;
BEGIN
  SELECT session_id, question_id INTO v_session_id, v_question_id
  FROM rounds WHERE id = p_round_id;

  SELECT correct_index, question_type INTO v_correct_index, v_question_type
  FROM quiz_questions WHERE id = v_question_id;

  -- Determine points based on question type
  v_points := CASE v_question_type
    WHEN 'choice_2' THEN 1
    WHEN 'choice_4' THEN 2
    WHEN 'buzzer' THEN 3
    ELSE 1
  END;

  -- Award points to players who answered correctly
  IF v_correct_index IS NOT NULL THEN
    UPDATE session_players sp
    SET score = score + v_points
    WHERE sp.session_id = v_session_id
    AND sp.player_id IN (
      SELECT pa.player_id FROM player_answers pa
      WHERE pa.round_id = p_round_id AND pa.answer_index = v_correct_index
    );
  END IF;

  -- Close the round
  UPDATE rounds SET status = 'closed', outcome = 'correct', resolved_at = now()
  WHERE id = p_round_id;

  -- Clear current round
  UPDATE quiz_sessions SET current_round_id = NULL
  WHERE id = v_session_id;

  -- Check for winner
  SELECT target_score INTO v_target FROM quiz_sessions WHERE id = v_session_id;

  SELECT player_id INTO v_winner_id
  FROM session_players
  WHERE session_id = v_session_id AND score >= v_target
  ORDER BY score DESC
  LIMIT 1;

  IF v_winner_id IS NOT NULL THEN
    UPDATE quiz_sessions
    SET status = 'finished', winner_id = v_winner_id
    WHERE id = v_session_id;

    INSERT INTO game_events (session_id, type, payload)
    VALUES (v_session_id, 'game_won', jsonb_build_object('winner_id', v_winner_id));
  END IF;
END;
$$;

-- Updated resolve_round with 3 points for buzzer
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
BEGIN
  SELECT r.session_id, s.admin_id, r.first_buzzer_id, s.target_score, r.question_id
  INTO v_session, v_admin, v_buzzer, v_target, v_question_id
  FROM rounds r JOIN quiz_sessions s ON s.id = r.session_id
  WHERE r.id = p_round_id;

  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;
  IF v_buzzer IS NULL THEN RAISE EXCEPTION 'No buzzer'; END IF;

  -- Determine points: if this round has a question, use its type; otherwise default to 3 (buzzer mode)
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

    IF v_new_score >= v_target THEN
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
