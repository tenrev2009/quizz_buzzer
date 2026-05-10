/*
  # Fix attempt_buzz ambiguous column reference (v2)

  1. Changes
    - Drop and recreate `attempt_buzz` with renamed OUT parameters to
      avoid name collision with `rounds.first_buzz_at` inside
      UPDATE ... RETURNING ... INTO.
  2. Security
    - Function remains SECURITY DEFINER with identical authorization checks.
    - EXECUTE granted back to authenticated role.
*/

DROP FUNCTION IF EXISTS public.attempt_buzz(uuid);

CREATE FUNCTION public.attempt_buzz(p_round_id uuid)
RETURNS TABLE(o_is_first boolean, o_first_buzzer uuid, o_first_buzz_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_session uuid;
  v_blocked boolean;
  v_updated_first uuid;
  v_updated_at timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT r.session_id INTO v_session FROM rounds r WHERE r.id = p_round_id;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Round not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = v_session AND sp.player_id = v_user) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  SELECT EXISTS(SELECT 1 FROM round_blocks WHERE round_id = p_round_id AND player_id = v_user) INTO v_blocked;
  IF v_blocked THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE rounds
  SET first_buzzer_id = v_user, first_buzz_at = now(), status = 'buzzed'
  WHERE id = p_round_id AND status = 'open' AND first_buzzer_id IS NULL
  RETURNING rounds.first_buzzer_id, rounds.first_buzz_at INTO v_updated_first, v_updated_at;

  IF v_updated_first IS NOT NULL THEN
    INSERT INTO game_events(session_id, type, payload)
    VALUES (v_session, 'buzz_first', jsonb_build_object('round_id', p_round_id, 'player_id', v_user));
    RETURN QUERY SELECT true, v_updated_first, v_updated_at;
  ELSE
    SELECT r.first_buzzer_id, r.first_buzz_at INTO v_updated_first, v_updated_at
    FROM rounds r WHERE r.id = p_round_id;
    RETURN QUERY SELECT false, v_updated_first, v_updated_at;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.attempt_buzz(uuid) TO authenticated;
