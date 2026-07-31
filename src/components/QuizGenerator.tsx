import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { QuestionType } from '../types';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Difficulty = 'facile' | 'moyen' | 'difficile';

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'facile', label: 'Facile', hint: 'Culture generale' },
  { value: 'moyen', label: 'Moyen', hint: 'Connaissance reelle du theme' },
  { value: 'difficile', label: 'Difficile', hint: 'Connaissance approfondie' },
];

interface GeneratedQuestion {
  question_text: string;
  question_type: QuestionType;
  options: string[];
  correct_index: number;
  answer_text?: string;
}

interface Props {
  sessionId: string;
  /** Position de depart, pour ajouter a la suite des questions existantes. */
  startPosition: number;
  onGenerated: () => void;
}

export default function QuizGenerator({ sessionId, startPosition, onGenerated }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('moyen');
  const [count2, setCount2] = useState(0);
  const [count4, setCount4] = useState(5);
  const [countBuzzer, setCountBuzzer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const total = count2 + count4 + countBuzzer;

  const generate = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expiree, reconnectez-vous.');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-quiz`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          theme,
          difficulty,
          count_2: count2,
          count_4: count4,
          count_buzzer: countBuzzer,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);

      const generated: GeneratedQuestion[] = data.questions ?? [];
      if (generated.length === 0) throw new Error('Aucune question generee.');

      const rows = generated.map((q, i) => ({
        session_id: sessionId,
        question_text: q.question_text,
        question_type: q.question_type,
        // Une question au buzzer n'a ni propositions ni bonne reponse indexee :
        // answer_text est alors la seule trace de la reponse.
        options: q.question_type === 'buzzer' ? null : q.options,
        correct_index: q.question_type === 'buzzer' ? null : q.correct_index,
        answer_text: q.answer_text?.trim() || null,
        position: startPosition + i,
      }));

      const { error: insertError } = await supabase.from('quiz_questions').insert(rows);
      if (insertError) throw new Error(`Enregistrement impossible : ${insertError.message}`);

      if (generated.length < total) {
        setNotice(
          `${generated.length} question(s) ajoutee(s) sur ${total} demandees : les autres ont ete ecartees car incompletes.`
        );
      } else {
        setNotice(`${generated.length} question(s) ajoutee(s).`);
      }
      onGenerated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-violet-200 bg-violet-50/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-violet-50 transition"
      >
        <Sparkles className="w-5 h-5 text-violet-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">Generer un QCM avec Claude</p>
          <p className="text-xs text-slate-500">Decrivez un theme, Claude ecrit les questions</p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-violet-200 pt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Theme
            </label>
            <input
              type="text"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              placeholder="Ex : le cinema francais des annees 80"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Difficulte
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  title={d.hint}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    difficulty === d.value
                      ? 'bg-violet-500 border-violet-500 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Nombre de questions
            </label>
            <div className="grid grid-cols-3 gap-2">
              <CountField label="2 choix" value={count2} onChange={setCount2} />
              <CountField label="4 choix" value={count4} onChange={setCount4} />
              <CountField label="Buzzer" value={countBuzzer} onChange={setCountBuzzer} />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
              {notice}
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || !theme.trim() || total === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500 text-white font-semibold rounded-lg hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generation en cours...</>
              : <><Sparkles className="w-4 h-4" /> Generer {total} question{total > 1 ? 's' : ''}</>}
          </button>
          {loading && (
            <p className="text-xs text-center text-slate-500">
              Cela prend generalement moins d'une minute.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CountField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <input
        type="number"
        min={0}
        max={30}
        value={value}
        onChange={e => onChange(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm text-center"
      />
      <p className="text-[11px] text-slate-500 text-center mt-1">{label}</p>
    </div>
  );
}
