/*
# Allow 'skipped' outcome on rounds table

1. Modified Tables
   - `rounds`: Updated check constraint `rounds_outcome_check` to allow 'skipped' value
     in addition to 'correct' and 'wrong'. This is needed when the admin skips a question
     (e.g. all players are blocked and nobody can answer).

2. Notes
   - The constraint is dropped and recreated to include the new value.
   - Existing data is not affected since no rows had 'skipped' before.
*/

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_outcome_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_outcome_check CHECK (outcome = ANY (ARRAY['correct'::text, 'wrong'::text, 'skipped'::text]));
