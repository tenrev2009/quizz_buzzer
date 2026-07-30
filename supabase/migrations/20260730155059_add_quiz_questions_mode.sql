/*
# Add quiz questions mode (QCM) to sessions

1. Modified Tables
   - `quiz_sessions`: added `game_mode` column ('buzzer' | 'qcm') to distinguish
     between buzzer-only sessions and question-based sessions.

2. New Tables
   - `quiz_questions`
     - `id` (uuid, PK)
     - `session_id` (uuid, FK → quiz_sessions)
     - `question_text` (text) — the question displayed to players
     - `question_type` ('choice_2' | 'choice_4' | 'buzzer') — determines answer style
     - `options` (jsonb) — array of option strings (2 or 4 items, null for buzzer)
     - `correct_index` (int) — 0-based index of correct answer in options (null for buzzer)
     - `position` (int) — ordering within the session
     - `created_at` (timestamptz)

   - `player_answers`
     - `id` (uuid, PK)
     - `round_id` (uuid, FK → rounds)
     - `player_id` (uuid, FK → profiles)
     - `answer_index` (int) — the index chosen by the player
     - `answered_at` (timestamptz)
     - UNIQUE(round_id, player_id) — one answer per round per player

3. Modified Tables
   - `rounds`: added `question_id` column (uuid, FK → quiz_questions, nullable)
     to link a round to a specific question in QCM mode.

4. Security
   - RLS enabled on `quiz_questions` and `player_answers`.
   - Admins can CRUD their own session's questions.
   - Players can read questions for sessions they belong to.
   - Players can insert their own answers.
   - All can read answers in their session.
*/

-- Add game_mode to quiz_sessions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_sessions' AND column_name = 'game_mode'
  ) THEN
    ALTER TABLE quiz_sessions ADD COLUMN game_mode text NOT NULL DEFAULT 'buzzer';
  END IF;
END $$;

-- Add question_id to rounds
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rounds' AND column_name = 'question_id'
  ) THEN
    ALTER TABLE rounds ADD COLUMN question_id uuid;
  END IF;
END $$;

-- Create quiz_questions table
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'choice_4',
  options jsonb,
  correct_index int,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create player_answers table
CREATE TABLE IF NOT EXISTS player_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answer_index int NOT NULL,
  answered_at timestamptz DEFAULT now(),
  UNIQUE(round_id, player_id)
);

-- Add FK constraint on rounds.question_id if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rounds_question_id_fkey'
  ) THEN
    ALTER TABLE rounds ADD CONSTRAINT rounds_question_id_fkey
      FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS for quiz_questions
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_questions" ON quiz_questions;
CREATE POLICY "admin_select_questions" ON quiz_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM quiz_sessions qs WHERE qs.id = quiz_questions.session_id AND qs.admin_id = auth.uid())
    OR EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = quiz_questions.session_id AND sp.player_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_questions" ON quiz_questions;
CREATE POLICY "admin_insert_questions" ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM quiz_sessions qs WHERE qs.id = quiz_questions.session_id AND qs.admin_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_questions" ON quiz_questions;
CREATE POLICY "admin_update_questions" ON quiz_questions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM quiz_sessions qs WHERE qs.id = quiz_questions.session_id AND qs.admin_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM quiz_sessions qs WHERE qs.id = quiz_questions.session_id AND qs.admin_id = auth.uid()));

DROP POLICY IF EXISTS "admin_delete_questions" ON quiz_questions;
CREATE POLICY "admin_delete_questions" ON quiz_questions FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM quiz_sessions qs WHERE qs.id = quiz_questions.session_id AND qs.admin_id = auth.uid()));

-- RLS for player_answers
ALTER TABLE player_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_answers_in_session" ON player_answers;
CREATE POLICY "select_answers_in_session" ON player_answers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN session_players sp ON sp.session_id = r.session_id
      WHERE r.id = player_answers.round_id AND sp.player_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM rounds r
      JOIN quiz_sessions qs ON qs.id = r.session_id
      WHERE r.id = player_answers.round_id AND qs.admin_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_answer" ON player_answers;
CREATE POLICY "insert_own_answer" ON player_answers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "update_own_answer" ON player_answers;
CREATE POLICY "update_own_answer" ON player_answers FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "delete_own_answer" ON player_answers;
CREATE POLICY "delete_own_answer" ON player_answers FOR DELETE
  TO authenticated
  USING (auth.uid() = player_id);
