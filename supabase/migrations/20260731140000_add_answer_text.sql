/*
# Store the expected answer for buzzer questions

1. Modified Tables
   - `quiz_questions`: added `answer_text` (text, nullable).

2. Rationale
   - Questions of type `choice_2` / `choice_4` already carry their answer
     implicitly, through `correct_index` into `options`.
   - Questions of type `buzzer` carried none: the player answers out loud and
     the host judges. That left the host with nothing on screen to judge
     against, and left players with nothing to reveal once the round closed.
   - `answer_text` fills that gap. It is optional — an existing buzzer question
     without it keeps working exactly as before.

3. Security
   - No policy change. `quiz_questions` already restricts writes to the
     session's admin and reads to its players, and this column follows the row.

4. Notes
   - Players can read this column as soon as the question exists, so the
     reveal is enforced in the client, not by the database. That matches how
     `correct_index` has always worked here: a determined player could already
     read the correct answer of a multiple-choice question from the network
     response. Closing that properly would mean serving questions through a
     function that strips answers until the round closes — a larger change,
     out of scope here, and noted so the limitation is not mistaken for an
     oversight.
*/

ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS answer_text text;

COMMENT ON COLUMN quiz_questions.answer_text IS
  'Reponse attendue, affichee a l''animateur puis revelee aux joueurs. Utile surtout pour question_type = buzzer, ou aucune proposition n''est stockee.';
