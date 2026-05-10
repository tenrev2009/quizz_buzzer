/*
  # Quiz Buzzer - Schéma complet
  Voir description dans fichier de plan.
*/

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Quiz sessions
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Session',
  code text UNIQUE NOT NULL,
  target_score int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished')),
  winner_id uuid REFERENCES profiles(id),
  current_round_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

-- Session players
CREATE TABLE IF NOT EXISTS session_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score int NOT NULL DEFAULT 0,
  joined_at timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  UNIQUE (session_id, player_id)
);

ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;

-- Rounds
CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  round_number int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','buzzed','closed')),
  first_buzzer_id uuid REFERENCES profiles(id),
  first_buzz_at timestamptz,
  outcome text CHECK (outcome IN ('correct','wrong')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

-- Round blocks
CREATE TABLE IF NOT EXISTS round_blocks (
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (round_id, player_id)
);

ALTER TABLE round_blocks ENABLE ROW LEVEL SECURITY;

-- Game events
CREATE TABLE IF NOT EXISTS game_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_code ON quiz_sessions(code);
CREATE INDEX IF NOT EXISTS idx_session_players_session ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON game_events(session_id, created_at DESC);

-- Policies: profiles
CREATE POLICY "Profiles readable by authenticated"
  ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Policies: quiz_sessions
CREATE POLICY "Admin or member can select sessions"
  ON quiz_sessions FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = quiz_sessions.id AND sp.player_id = auth.uid())
  );
CREATE POLICY "Admin can insert own sessions"
  ON quiz_sessions FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid());
CREATE POLICY "Admin can update own sessions"
  ON quiz_sessions FOR UPDATE TO authenticated
  USING (admin_id = auth.uid()) WITH CHECK (admin_id = auth.uid());
CREATE POLICY "Admin can delete own sessions"
  ON quiz_sessions FOR DELETE TO authenticated
  USING (admin_id = auth.uid());

-- Policies: session_players
CREATE POLICY "Members and admin can view session players"
  ON session_players FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = session_players.session_id AND s.admin_id = auth.uid())
  );
CREATE POLICY "Players can join"
  ON session_players FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());
CREATE POLICY "Admin or self can update session_players"
  ON session_players FOR UPDATE TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = session_players.session_id AND s.admin_id = auth.uid())
  )
  WITH CHECK (
    player_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = session_players.session_id AND s.admin_id = auth.uid())
  );
CREATE POLICY "Admin or self can delete session_players"
  ON session_players FOR DELETE TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = session_players.session_id AND s.admin_id = auth.uid())
  );

-- Policies: rounds
CREATE POLICY "Members can view rounds"
  ON rounds FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = rounds.session_id AND s.admin_id = auth.uid())
    OR EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = rounds.session_id AND sp.player_id = auth.uid())
  );
CREATE POLICY "Admin can insert rounds"
  ON rounds FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = rounds.session_id AND s.admin_id = auth.uid()));
CREATE POLICY "Admin can update rounds"
  ON rounds FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = rounds.session_id AND s.admin_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = rounds.session_id AND s.admin_id = auth.uid()));
CREATE POLICY "Admin can delete rounds"
  ON rounds FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = rounds.session_id AND s.admin_id = auth.uid()));

-- Policies: round_blocks
CREATE POLICY "Members can view round_blocks"
  ON round_blocks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN quiz_sessions s ON s.id = r.session_id
      WHERE r.id = round_blocks.round_id
        AND (s.admin_id = auth.uid()
          OR EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = s.id AND sp.player_id = auth.uid()))
    )
  );
CREATE POLICY "Admin can insert round_blocks"
  ON round_blocks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN quiz_sessions s ON s.id = r.session_id
      WHERE r.id = round_blocks.round_id AND s.admin_id = auth.uid()
    )
  );
CREATE POLICY "Admin can delete round_blocks"
  ON round_blocks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN quiz_sessions s ON s.id = r.session_id
      WHERE r.id = round_blocks.round_id AND s.admin_id = auth.uid()
    )
  );

-- Policies: game_events
CREATE POLICY "Members can view game_events"
  ON game_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = game_events.session_id AND s.admin_id = auth.uid())
    OR EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = game_events.session_id AND sp.player_id = auth.uid())
  );
CREATE POLICY "Members can insert game_events"
  ON game_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM quiz_sessions s WHERE s.id = game_events.session_id AND s.admin_id = auth.uid())
    OR EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = game_events.session_id AND sp.player_id = auth.uid())
  );

-- Atomic buzz
CREATE OR REPLACE FUNCTION attempt_buzz(p_round_id uuid)
RETURNS TABLE (is_first boolean, first_buzzer uuid, first_buzz_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  RETURNING first_buzzer_id, first_buzz_at INTO v_updated_first, v_updated_at;

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
$$;

GRANT EXECUTE ON FUNCTION attempt_buzz(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION join_session_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_session_id FROM quiz_sessions WHERE code = upper(p_code);
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  INSERT INTO session_players(session_id, player_id)
  VALUES (v_session_id, v_user)
  ON CONFLICT (session_id, player_id) DO UPDATE SET last_seen = now();
  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION join_session_by_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION resolve_round(p_round_id uuid, p_correct boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session uuid;
  v_admin uuid;
  v_buzzer uuid;
  v_target int;
  v_new_score int;
BEGIN
  SELECT r.session_id, s.admin_id, r.first_buzzer_id, s.target_score
  INTO v_session, v_admin, v_buzzer, v_target
  FROM rounds r JOIN quiz_sessions s ON s.id = r.session_id
  WHERE r.id = p_round_id;

  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;
  IF v_buzzer IS NULL THEN RAISE EXCEPTION 'No buzzer'; END IF;

  IF p_correct THEN
    UPDATE session_players SET score = score + 1
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

GRANT EXECUTE ON FUNCTION resolve_round(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION start_round(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin uuid;
  v_next int;
  v_round uuid;
BEGIN
  SELECT admin_id INTO v_admin FROM quiz_sessions WHERE id = p_session_id;
  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;
  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_next FROM rounds WHERE session_id = p_session_id;
  INSERT INTO rounds(session_id, round_number, status) VALUES (p_session_id, v_next, 'open')
  RETURNING id INTO v_round;
  UPDATE quiz_sessions SET status='playing', current_round_id=v_round WHERE id=p_session_id;
  INSERT INTO game_events(session_id, type, payload)
  VALUES (p_session_id, 'round_started', jsonb_build_object('round_id', v_round, 'round_number', v_next));
  RETURN v_round;
END;
$$;

GRANT EXECUTE ON FUNCTION start_round(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION reset_current_round(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin uuid;
  v_current uuid;
BEGIN
  SELECT admin_id, current_round_id INTO v_admin, v_current FROM quiz_sessions WHERE id = p_session_id;
  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;
  IF v_current IS NULL THEN RETURN; END IF;
  DELETE FROM round_blocks WHERE round_id = v_current;
  UPDATE rounds SET status='open', first_buzzer_id=NULL, first_buzz_at=NULL, outcome=NULL WHERE id = v_current;
  INSERT INTO game_events(session_id, type, payload)
  VALUES (p_session_id, 'round_reset', jsonb_build_object('round_id', v_current));
END;
$$;

GRANT EXECUTE ON FUNCTION reset_current_round(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION reset_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin uuid;
BEGIN
  SELECT admin_id INTO v_admin FROM quiz_sessions WHERE id = p_session_id;
  IF v_admin != v_user THEN RAISE EXCEPTION 'Not admin'; END IF;
  UPDATE session_players SET score = 0 WHERE session_id = p_session_id;
  DELETE FROM round_blocks WHERE round_id IN (SELECT id FROM rounds WHERE session_id = p_session_id);
  DELETE FROM rounds WHERE session_id = p_session_id;
  UPDATE quiz_sessions SET status='waiting', winner_id=NULL, current_round_id=NULL WHERE id = p_session_id;
  INSERT INTO game_events(session_id, type, payload) VALUES (p_session_id, 'game_reset', '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION reset_game(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE quiz_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE session_players;
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE round_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE game_events;
