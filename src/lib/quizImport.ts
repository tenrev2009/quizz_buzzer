import type { QuestionType } from '../types';

export interface ParsedQuestion {
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  correct_index: number | null;
}

export interface ParseIssue {
  /** Numero de ligne (CSV) ou index dans le tableau (JSON), a partir de 1. */
  line: number;
  message: string;
  /** Extrait de la source, pour que l'utilisateur retrouve la ligne fautive. */
  excerpt: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  issues: ParseIssue[];
  format: 'csv' | 'json';
}

const TYPE_ALIASES: Record<string, QuestionType> = {
  '2': 'choice_2',
  '2 choix': 'choice_2',
  choice_2: 'choice_2',
  qcm2: 'choice_2',
  vf: 'choice_2',
  '4': 'choice_4',
  '4 choix': 'choice_4',
  choice_4: 'choice_4',
  qcm4: 'choice_4',
  qcm: 'choice_4',
  buzzer: 'buzzer',
  b: 'buzzer',
  libre: 'buzzer',
};

function normaliseType(raw: string): QuestionType | null {
  return TYPE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/**
 * Accepte une lettre (A-D), un rang (1-4) ou le texte exact d'une proposition.
 * Les trois notations circulent dans les fichiers rediges a la main.
 */
function resolveCorrectIndex(raw: string, options: string[]): number | null {
  const value = raw.trim();
  if (!value) return null;

  const letter = value.toUpperCase();
  if (/^[A-Z]$/.test(letter)) {
    const idx = letter.charCodeAt(0) - 65;
    return idx < options.length ? idx : null;
  }

  if (/^\d+$/.test(value)) {
    const idx = parseInt(value, 10) - 1;
    return idx >= 0 && idx < options.length ? idx : null;
  }

  const match = options.findIndex(
    o => o.trim().toLowerCase() === value.toLowerCase()
  );
  return match >= 0 ? match : null;
}

/**
 * Lecteur CSV conforme aux guillemets RFC 4180 : un separateur ou un retour a
 * la ligne entre guillemets fait partie du champ, et "" represente un guillemet.
 * Un split naif casserait sur toute question contenant une virgule.
 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += char;
      continue;
    }

    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }

  row.push(field);
  rows.push(row);
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** Le point-virgule domine dans les tableurs francais, la virgule ailleurs. */
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n').find(l => l.trim() !== '') ?? '';
  const counts: [string, number][] = [
    [';', (firstLine.match(/;/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
    [',', (firstLine.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

function looksLikeHeader(cells: string[]): boolean {
  const first = (cells[0] ?? '').trim().toLowerCase();
  return first === 'type' || first === 'question_type';
}

function parseCsv(text: string): ParseResult {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  const questions: ParsedQuestion[] = [];
  const issues: ParseIssue[] = [];

  rows.forEach((cells, idx) => {
    const line = idx + 1;
    if (idx === 0 && looksLikeHeader(cells)) return;

    const excerpt = cells.join(delimiter).slice(0, 80);
    const type = normaliseType(cells[0] ?? '');
    if (!type) {
      issues.push({
        line,
        excerpt,
        message: `Type « ${(cells[0] ?? '').trim()} » inconnu. Attendu : 2, 4 ou buzzer.`,
      });
      return;
    }

    const questionText = (cells[1] ?? '').trim();
    if (!questionText) {
      issues.push({ line, excerpt, message: 'Question vide.' });
      return;
    }

    if (type === 'buzzer') {
      questions.push({
        question_text: questionText,
        question_type: 'buzzer',
        options: null,
        correct_index: null,
      });
      return;
    }

    const expected = type === 'choice_2' ? 2 : 4;
    const options = cells.slice(2, 2 + expected).map(o => (o ?? '').trim());
    if (options.length < expected || options.some(o => !o)) {
      issues.push({
        line,
        excerpt,
        message: `${expected} propositions attendues, ${options.filter(Boolean).length} fournie(s).`,
      });
      return;
    }

    // La bonne reponse suit toujours les 4 colonnes de propositions, meme en
    // type 2 choix : garder les colonnes alignees evite un fichier bancal.
    const answerCell = (cells[6] ?? cells[2 + expected] ?? '').trim();
    const correctIndex = resolveCorrectIndex(answerCell, options);
    if (correctIndex === null) {
      issues.push({
        line,
        excerpt,
        message: answerCell
          ? `Bonne reponse « ${answerCell} » introuvable parmi les propositions.`
          : 'Bonne reponse manquante.',
      });
      return;
    }

    questions.push({
      question_text: questionText,
      question_type: type,
      options,
      correct_index: correctIndex,
    });
  });

  return { questions, issues, format: 'csv' };
}

function parseJson(text: string): ParseResult {
  const questions: ParsedQuestion[] = [];
  const issues: ParseIssue[] = [];

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return {
      questions: [],
      issues: [{ line: 1, excerpt: text.slice(0, 80), message: `JSON illisible : ${(e as Error).message}` }],
      format: 'json',
    };
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { questions?: unknown }).questions)
      ? (data as { questions: unknown[] }).questions
      : null;

  if (!list) {
    return {
      questions: [],
      issues: [{ line: 1, excerpt: '', message: 'Attendu : un tableau de questions, ou un objet { "questions": [...] }.' }],
      format: 'json',
    };
  }

  list.forEach((raw, idx) => {
    const line = idx + 1;
    const item = raw as Record<string, unknown>;
    const excerpt = JSON.stringify(raw).slice(0, 80);

    const questionText = String(item.question_text ?? item.question ?? '').trim();
    if (!questionText) {
      issues.push({ line, excerpt, message: 'Champ question_text manquant.' });
      return;
    }

    const type = normaliseType(String(item.question_type ?? item.type ?? ''));
    if (!type) {
      issues.push({ line, excerpt, message: 'Champ question_type manquant ou inconnu.' });
      return;
    }

    if (type === 'buzzer') {
      questions.push({
        question_text: questionText,
        question_type: 'buzzer',
        options: null,
        correct_index: null,
      });
      return;
    }

    const expected = type === 'choice_2' ? 2 : 4;
    const options = Array.isArray(item.options)
      ? (item.options as unknown[]).map(o => String(o ?? '').trim())
      : [];
    if (options.length !== expected || options.some(o => !o)) {
      issues.push({ line, excerpt, message: `${expected} propositions attendues, ${options.length} fournie(s).` });
      return;
    }

    const correctIndex =
      typeof item.correct_index === 'number'
        ? item.correct_index
        : resolveCorrectIndex(String(item.correct_index ?? item.bonne_reponse ?? ''), options);

    if (correctIndex === null || correctIndex < 0 || correctIndex >= expected) {
      issues.push({ line, excerpt, message: 'correct_index absent ou hors bornes.' });
      return;
    }

    questions.push({
      question_text: questionText,
      question_type: type,
      options,
      correct_index: correctIndex,
    });
  });

  return { questions, issues, format: 'json' };
}

/**
 * Les assistants externes encadrent presque toujours leur reponse dans un bloc
 * markdown. Le coller tel quel est le geste naturel : on retire la cloture
 * plutot que de renvoyer une erreur de syntaxe.
 */
function stripCodeFence(text: string): string {
  const match = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/);
  return match ? match[1].trim() : text;
}

export function parseQuiz(text: string): ParseResult {
  const trimmed = stripCodeFence(text.trim());
  if (!trimmed) return { questions: [], issues: [], format: 'csv' };
  const isJson = trimmed.startsWith('[') || trimmed.startsWith('{');
  return isJson ? parseJson(trimmed) : parseCsv(trimmed);
}

/** Modele CSV propose au telechargement et affiche comme exemple. */
export const CSV_TEMPLATE = `type;question;reponse_a;reponse_b;reponse_c;reponse_d;bonne_reponse
4;Quelle est la capitale de l'Australie ?;Sydney;Melbourne;Canberra;Perth;C
2;Le Nil est-il le plus long fleuve du monde ?;Oui;Non;;;A
buzzer;Qui a peint la Joconde ?;;;;;
`;

/** Consigne prete a coller dans une IA externe pour obtenir un fichier valide. */
export const EXTERNAL_AI_PROMPT = `Génère un quiz au format CSV, séparateur point-virgule, avec exactement cet en-tête :

type;question;reponse_a;reponse_b;reponse_c;reponse_d;bonne_reponse

Règles :
- La colonne "type" vaut 2 (deux propositions), 4 (quatre propositions) ou buzzer (aucune proposition).
- Pour le type 2 : remplis reponse_a et reponse_b, laisse reponse_c et reponse_d vides.
- Pour le type 4 : remplis les quatre colonnes.
- Pour buzzer : laisse les quatre colonnes de réponses vides.
- "bonne_reponse" contient la lettre A, B, C ou D. Laisse-la vide pour buzzer.
- Si un texte contient un point-virgule, entoure-le de guillemets doubles.
- Une seule bonne réponse par question ; les mauvaises doivent être plausibles.
- Ne renvoie que le CSV, sans commentaire ni bloc de code.

Thème : [À COMPLÉTER]
Difficulté : [facile / moyen / difficile]
Nombre de questions : [À COMPLÉTER]`;
