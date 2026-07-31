import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { GameMode, QuizSession } from '../types';
import { Plus, LogOut, Zap, Play, Trash2, HelpCircle, Radio, Music } from 'lucide-react';
import AdminSessionView from './AdminSessionView';

function randomCode() {
  return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
}

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState(5);
  const [gameMode, setGameMode] = useState<GameMode>('buzzer');
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from('quiz_sessions').select('*').order('created_at', { ascending: false });
    setSessions((data ?? []) as QuizSession[]);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!profile) return;
    try {
      let code = randomCode();
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase.from('quiz_sessions').select('id').eq('code', code).maybeSingle();
        if (!data) break;
        code = randomCode();
      }
      const { data, error } = await supabase
        .from('quiz_sessions')
        .insert({ admin_id: profile.id, name: name || 'Nouvelle session', code, target_score: target, game_mode: gameMode })
        .select('*')
        .single();
      if (error) throw error;
      setShowNew(false); setName(''); setTarget(5);
      setActiveId(data.id);
      load();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Erreur';
      setErr(msg);
      console.error('Create session error', e);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette session ?')) return;
    await supabase.from('quiz_sessions').delete().eq('id', id);
    load();
  };

  if (activeId) {
    return <AdminSessionView sessionId={activeId} onBack={() => { setActiveId(null); load(); }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400 flex items-center justify-center">
              <Zap className="w-5 h-5 text-slate-900" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">QuizBuzz Admin</h1>
              <p className="text-xs text-slate-500">{profile?.display_name}</p>
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Mes sessions</h2>
            <p className="text-sm text-slate-500">Créez et pilotez vos quiz en direct</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle session
          </button>
        </div>

        {showNew && (
          <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Nom de session</label>
                <input
                  value={name} onChange={e => setName(e.target.value)}
                  required
                  placeholder="Quiz du vendredi"
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Points pour gagner</label>
                <input
                  type="number" min={1} max={50} value={target}
                  onChange={e => setTarget(parseInt(e.target.value) || 5)}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Mode de jeu</label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGameMode('buzzer')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${gameMode === 'buzzer' ? 'bg-amber-400 border-amber-400 text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Radio className="w-4 h-4" /> Buzzer
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameMode('qcm')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${gameMode === 'qcm' ? 'bg-amber-400 border-amber-400 text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <HelpCircle className="w-4 h-4" /> QCM
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameMode('music')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${gameMode === 'music' ? 'bg-[#1DB954] border-[#1DB954] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Music className="w-4 h-4" /> Musical
                  </button>
                </div>
              </div>
            </div>
            {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
            <div className="flex gap-2 mt-4">
              <button type="submit" className="px-4 py-2 bg-amber-400 text-slate-900 font-semibold rounded-lg hover:bg-amber-300">Créer</button>
              <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
            </div>
          </form>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.length === 0 && (
            <div className="col-span-full bg-white border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
              <p className="text-slate-500">Aucune session. Créez-en une pour commencer.</p>
            </div>
          )}
          {sessions.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-slate-900">{s.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.status === 'waiting' && 'En attente'}
                    {s.status === 'playing' && 'En cours'}
                    {s.status === 'finished' && 'Terminée'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  s.status === 'playing' ? 'bg-green-100 text-green-700' :
                  s.status === 'finished' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'
                }`}>
                  {s.status}
                </span>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3 font-mono text-sm tracking-widest text-center text-slate-700 font-bold">
                {s.code}
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Objectif: {s.target_score} points
                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
                  {s.game_mode === 'qcm' ? <><HelpCircle className="w-3 h-3" />QCM</> : s.game_mode === 'music' ? <><Music className="w-3 h-3" />Musical</> : <><Radio className="w-3 h-3" />Buzzer</>}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveId(s.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800"
                >
                  <Play className="w-3.5 h-3.5" /> Ouvrir
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
