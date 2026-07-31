import { useState, useMemo, useRef } from 'react';
import { parseQuiz, CSV_TEMPLATE, EXTERNAL_AI_PROMPT } from '../lib/quizImport';
import { insertQuestions, droppedAnswersNotice } from '../lib/insertQuestions';
import {
  Upload, Loader2, ChevronDown, ChevronUp, FileText, Copy, Check, AlertTriangle,
} from 'lucide-react';

interface Props {
  sessionId: string;
  startPosition: number;
  onImported: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  choice_2: '2 choix',
  choice_4: '4 choix',
  buzzer: 'Buzzer',
};

export default function QuizImport({ sessionId, startPosition, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // L'analyse tourne a chaque frappe : l'utilisateur voit immediatement ce qui
  // sera importe, et surtout ce qui ne le sera pas.
  const result = useMemo(() => parseQuiz(text), [text]);

  const readFile = async (file: File) => {
    setError(null);
    setNotice(null);
    setText(await file.text());
  };

  const importAll = async () => {
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const rows = result.questions.map((q, i) => ({
        session_id: sessionId,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        correct_index: q.correct_index,
        answer_text: q.answer_text,
        position: startPosition + i,
      }));

      const { inserted, droppedAnswers } = await insertQuestions(rows);

      setNotice(
        droppedAnswers > 0
          ? `${inserted} question(s) importee(s). ${droppedAnswersNotice(droppedAnswers)}`
          : `${inserted} question(s) importee(s).`
      );
      setText('');
      if (fileRef.current) fileRef.current.value = '';
      onImported();
    } catch (e) {
      setError(`Import impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(EXTERNAL_AI_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTemplate = () => {
    // BOM UTF-8 : sans lui Excel affiche les accents en mojibake.
    const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-quiz.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-sky-200 bg-sky-50/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-sky-50 transition"
      >
        <Upload className="w-5 h-5 text-sky-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">Importer un QCM</p>
          <p className="text-xs text-slate-500">Fichier CSV ou JSON, depuis un tableur ou une IA externe</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-4 border-t border-sky-200 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <FileText className="w-4 h-4" /> Choisir un fichier
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt,text/csv,application/json,text/plain"
              onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }}
              className="hidden"
            />
            <button
              onClick={downloadTemplate}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Modele CSV
            </button>
            <button
              onClick={copyPrompt}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copie !' : 'Consigne pour IA externe'}
            </button>
          </div>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder={`Collez ici votre CSV ou JSON.\n\n${CSV_TEMPLATE.trim()}`}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 text-xs font-mono resize-y"
          />

          {text.trim() && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-slate-900">
                  {result.questions.length} question(s) valide(s)
                </span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">
                  format {result.format}
                </span>
                {result.issues.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {result.issues.length} ligne(s) ignoree(s)
                  </span>
                )}
              </div>

              {result.questions.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {result.questions.map((q, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium whitespace-nowrap">
                          {TYPE_LABELS[q.question_type]}
                        </span>
                        <span className="text-slate-800 flex-1">{q.question_text}</span>
                      </div>
                      {q.options && q.correct_index !== null && (
                        <p className="text-slate-500 mt-1 ml-1">
                          Bonne reponse : {q.options[q.correct_index]}
                        </p>
                      )}
                      {q.question_type === 'buzzer' && q.answer_text && (
                        <p className="text-slate-500 mt-1 ml-1">
                          Reponse attendue : {q.answer_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {result.issues.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 divide-y divide-amber-100">
                  {result.issues.map((issue, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <p className="text-amber-900 font-medium">Ligne {issue.line} — {issue.message}</p>
                      {issue.excerpt && (
                        <p className="text-amber-700 font-mono mt-0.5 truncate">{issue.excerpt}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 whitespace-pre-wrap break-words">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">{notice}</div>
          )}

          <button
            onClick={importAll}
            disabled={importing || result.questions.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500 text-white font-semibold rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Import en cours...</>
              : <><Upload className="w-4 h-4" /> Importer {result.questions.length} question{result.questions.length > 1 ? 's' : ''}</>}
          </button>

          <p className="text-xs text-slate-500">
            Pour une question au buzzer, la colonne « bonne_reponse » contient le texte de la
            reponse attendue : elle vous est montree pendant la manche, puis revelee aux joueurs
            une fois la manche tranchee.
          </p>
        </div>
      )}
    </div>
  );
}
