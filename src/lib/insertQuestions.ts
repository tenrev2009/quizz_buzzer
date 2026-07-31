import { supabase } from './supabase';
import { describeWriteError } from './supabaseErrors';
import type { QuestionType } from '../types';

export interface QuestionRow {
  session_id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  correct_index: number | null;
  answer_text: string | null;
  position: number;
}

export interface InsertOutcome {
  inserted: number;
  /** Nombre de reponses au buzzer perdues faute de colonne answer_text. */
  droppedAnswers: number;
}

function isMissingAnswerColumn(message: string): boolean {
  return /Could not find the 'answer_text' column/i.test(message);
}

/**
 * Insere des questions en tolerant l'absence de la colonne answer_text.
 *
 * Cette colonne est recente et toutes les bases ne l'ont pas encore. Sans ce
 * repli, une seule question au buzzer fait echouer l'insertion entiere — y
 * compris les questions a choix, qui n'ont pourtant besoin de rien de neuf.
 * Mieux vaut importer ce qui peut l'etre et dire clairement ce qui manque.
 */
export async function insertQuestions(rows: QuestionRow[]): Promise<InsertOutcome> {
  const { error } = await supabase.from('quiz_questions').insert(rows);
  if (!error) {
    return { inserted: rows.length, droppedAnswers: 0 };
  }

  if (!isMissingAnswerColumn(error.message)) {
    throw new Error(describeWriteError(error.message));
  }

  const droppedAnswers = rows.filter(
    r => r.question_type === 'buzzer' && !!r.answer_text
  ).length;

  const withoutAnswer = rows.map(({ answer_text: _answer, ...rest }) => rest);
  const { error: retryError } = await supabase.from('quiz_questions').insert(withoutAnswer);
  if (retryError) {
    throw new Error(describeWriteError(retryError.message));
  }

  return { inserted: rows.length, droppedAnswers };
}

/** Message a afficher quand des reponses au buzzer n'ont pas pu etre enregistrees. */
export function droppedAnswersNotice(count: number): string {
  return (
    `${count} reponse(s) de questions au buzzer n'ont pas pu etre enregistrees : ` +
    `votre base n'a pas encore la colonne answer_text. Les questions sont bien la ` +
    `et jouables — vous devrez juste connaitre la reponse de votre cote pour ces ` +
    `${count} question(s), ou saisir la reponse dans l'editeur une fois la colonne ajoutee.`
  );
}
