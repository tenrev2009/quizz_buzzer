import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { QuizQuestion, QuestionType } from '../types';
import QuizGenerator from './QuizGenerator';
import { Plus, Trash2, GripVertical, Check, CircleDot, Zap } from 'lucide-react';

interface Props {
  sessionId: string;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  choice_2: '2 choix',
  choice_4: '4 choix',
  buzzer: 'Buzzer',
};

const TYPE_ICONS: Record<QuestionType, typeof CircleDot> = {
  choice_2: CircleDot,
  choice_4: Check,
  buzzer: Zap,
};

export default function QuizEditor({ sessionId }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuestions = async () => {
    const { data } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('position', { ascending: true });
    setQuestions((data ?? []) as QuizQuestion[]);
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, [sessionId]);

  const addQuestion = async () => {
    const nextPos = questions.length;
    const { error } = await supabase.from('quiz_questions').insert({
      session_id: sessionId,
      question_text: '',
      question_type: 'choice_4',
      options: ['', '', '', ''],
      correct_index: 0,
      position: nextPos,
    });
    if (!error) fetchQuestions();
  };

  const updateQuestion = async (id: string, updates: Partial<QuizQuestion>) => {
    await supabase.from('quiz_questions').update(updates).eq('id', id);
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from('quiz_questions').delete().eq('id', id);
    fetchQuestions();
  };

  const changeType = (q: QuizQuestion, type: QuestionType) => {
    let options: string[] | null = null;
    let correct_index: number | null = null;
    if (type === 'choice_2') {
      options = ['', ''];
      correct_index = 0;
    } else if (type === 'choice_4') {
      options = ['', '', '', ''];
      correct_index = 0;
    }
    updateQuestion(q.id, { question_type: type, options, correct_index });
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-400 text-sm">Chargement des questions...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">
          Questions ({questions.length})
        </h2>
        <button
          onClick={addQuestion}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-400 text-slate-900 font-semibold text-sm rounded-lg hover:bg-amber-300 transition"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      <QuizGenerator
        sessionId={sessionId}
        startPosition={questions.length}
        onGenerated={fetchQuestions}
      />

      {questions.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <p className="text-slate-400 mb-2">Aucune question</p>
          <p className="text-xs text-slate-400">Generez un QCM ci-dessus, ou ajoutez vos questions une par une</p>
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={idx}
            onUpdate={updateQuestion}
            onDelete={deleteQuestion}
            onChangeType={changeType}
          />
        ))}
      </div>
    </div>
  );
}

interface QuestionCardProps {
  question: QuizQuestion;
  index: number;
  onUpdate: (id: string, updates: Partial<QuizQuestion>) => void;
  onDelete: (id: string) => void;
  onChangeType: (q: QuizQuestion, type: QuestionType) => void;
}

function QuestionCard({ question, index, onUpdate, onDelete, onChangeType }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(!question.question_text);

  const Icon = TYPE_ICONS[question.question_type];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <span className="text-xs font-bold text-slate-400 w-6">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {question.question_text || <span className="text-slate-400 italic">Question sans titre</span>}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">
          <Icon className="w-3 h-3" /> {TYPE_LABELS[question.question_type]}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Question</label>
            <input
              value={question.question_text}
              onChange={e => onUpdate(question.id, { question_text: e.target.value })}
              placeholder="Tapez votre question ici..."
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Type de question</label>
            <div className="flex gap-2">
              {(['choice_2', 'choice_4', 'buzzer'] as QuestionType[]).map(type => {
                const TIcon = TYPE_ICONS[type];
                const active = question.question_type === type;
                return (
                  <button
                    key={type}
                    onClick={() => onChangeType(question, type)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${active ? 'bg-amber-100 border-amber-400 text-amber-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <TIcon className="w-4 h-4" /> {TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>

          {question.question_type !== 'buzzer' && question.options && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                Réponses <span className="text-green-600">(cliquez pour marquer la bonne)</span>
              </label>
              <div className="grid gap-2">
                {question.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdate(question.id, { correct_index: i })}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${question.correct_index === i ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 text-slate-300 hover:border-green-400'}`}
                    >
                      {question.correct_index === i && <Check className="w-4 h-4" />}
                    </button>
                    <input
                      value={opt}
                      onChange={e => {
                        const newOpts = [...question.options!];
                        newOpts[i] = e.target.value;
                        onUpdate(question.id, { options: newOpts });
                      }}
                      placeholder={`Réponse ${i + 1}`}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {question.question_type === 'buzzer' && (
            <div className="py-3 px-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Mode buzzer: les joueurs buzzent et l'admin valide la réponse oralement
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => onDelete(question.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm transition"
            >
              <Trash2 className="w-4 h-4" /> Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
