/*
# Add RPC for starting a QCM round and submitting answers

1. New Functions
   - `start_qcm_round(p_session_id, p_question_id)`: Creates a new round linked to a specific question.
     Sets session status to 'playing' and current_round_id.
   - `submit_answer(p_round_id, p_answer_index)`: Lets a player submit their answer.
     Checks the round is still open, inserts the answer.
   - `resolve_qcm_round(p_round_id)`: Admin resolves a QCM round.
     Awards +1 to all players who answered correctly. Checks for winner.

2. Notes
   - For buzzer-type questions in QCM mode, the existing attempt_buzz + resolve_round RPCs still apply.
   - resolve_qcm_round auto-closes the round and awards points to all correct answers.
*/

-- Start a QCM round with a specific question
CREATE OR REPLACE FUNCTION start_qcm_round(p_session_id uuid, p_question_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_round_number int;
  v_round_id uuid;
BEGIN
  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_round_number
  FROM rounds WHERE session_id = p_session_id;

  INSERT INTO rounds (session_id, round_number, status, question_id)
  VALUES (p_session_id, v_round_number, 'open', p_question_id)
  RETURNING id INTO v_round_id;

  UPDATE quiz_sessions
  SET status = 'playing', current_round_id = v_round_id
  WHERE id = p_session_id;

  INSERT INTO game_events (session_id, type, payload)
  VALUES (p_session_id, 'round_started', jsonb_build_object('round_id', v_round_id, 'question_id', p_question_id));

  RETURN v_round_id;
END;
$$;

-- Submit a player answer
CREATE OR REPLACE FUNCTION submit_answer(p_round_id uuid, p_answer_index int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM rounds WHERE id = p_round_id;
  IF v_status != 'open' THEN
    RAISE EXCEPTION 'Round is not open for answers';
  END IF;

  INSERT INTO player_answers (round_id, player_id, answer_index)
  VALUES (p_round_id, auth.uid(), p_answer_index)
  ON CONFLICT (round_id, player_id) DO NOTHING;
END;
$$;

-- Resolve a QCM round: award points to correct answers, check for winner
CREATE OR REPLACE FUNCTION resolve_qcm_round(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_question_id uuid;
  v_correct_index int;
  v_target int;
  v_winner_id uuid;
BEGIN
  SELECT session_id, question_id INTO v_session_id, v_question_id
  FROM rounds WHERE id = p_round_id;

  SELECT correct_index INTO v_correct_index
  FROM quiz_questions WHERE id = v_question_id;

  -- Award +1 to players who answered correctly
  IF v_correct_index IS NOT NULL THEN
    UPDATE session_players sp
    SET score = score + 1
    WHERE sp.session_id = v_session_id
      AND sp.player_id IN (
        SELECT pa.player_id FROM player_answers pa
        WHERE pa.round_id = p_round_id AND pa.answer_index = v_correct_index
      );
  END IF;

  -- Close the round
  UPDATE rounds SET status = 'closed', outcome = 'correct', resolved_at = now()
  WHERE id = p_round_id;

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
