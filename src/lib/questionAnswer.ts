import type { QuizQuestion } from '../types';

/**
 * Texte de la bonne reponse, quel que soit le type de question.
 *
 * Les questions a choix la portent implicitement via correct_index ; les
 * questions au buzzer n'ont que answer_text. Centraliser evite que l'animateur
 * et les joueurs voient deux formulations differentes de la meme reponse.
 *
 * Renvoie null quand rien n'est connu — cas d'une question au buzzer saisie
 * avant l'ajout de answer_text, qui doit rester jouable.
 */
export function correctAnswerText(question: {
  question_type: QuizQuestion['question_type'];
  options: string[] | null;
  correct_index: number | null;
  answer_text: string | null;
}): string | null {
  const explicit = question.answer_text?.trim();
  if (explicit) return explicit;

  if (
    question.question_type !== 'buzzer' &&
    question.options &&
    question.correct_index !== null &&
    question.correct_index >= 0 &&
    question.correct_index < question.options.length
  ) {
    const letter = String.fromCharCode(65 + question.correct_index);
    return `${letter}. ${question.options[question.correct_index]}`;
  }

  return null;
}
