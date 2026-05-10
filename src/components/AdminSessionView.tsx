import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSessionRealtime } from '../hooks/useSessionRealtime';
import Scoreboard from './Scoreboard';
import WinnerView from './WinnerView';
import { ArrowLeft, Play, Check, X, RotateCcw, RefreshCw, Users, Copy } from 'lucide-react';

interface Props { sessionId: string; onBack: () => void; }

export default function AdminSessionView({ sessionId, onBack }: Props) {
  const { session, players, currentRound, blockedIds, refresh, ping } = useSessionRealtime(sessionId);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toMsg = (e: unknown): string => {
    if (!e) return 'Erreur inconnue';
    if (e instanceof Error) return e.message;
    if (typeof e === 'object' && e && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
      return (e as { message: string }).message;
    }
    try { return JSON.stringify(e); } catch { return 'Erreur'; }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true); setErr(null);
    try { await fn(); refresh(); ping(); } catch (e: unknown) { setErr(toMsg(e)); }
    finally { setLoading(false); }
  };

  const startRound = () => run(async () => {
    const { error } = await supabase.rpc('start_round', { p_session_id: sessionId });
    if (error) throw error;
  });

  const resolve = (correct: boolean) => run(async () => {
    if (!currentRound) return;
    const { error } = await supabase.rpc('resolve_round', { p_round_id: currentRound.id, p_correct: correct });
    if (error) throw error;
  });

  const resetRound = () => run(async () => {
    const { error } = await supabase.rpc('reset_current_round', { p_session_id: sessionId });
    if (error) throw error;
  });

  const resetGame = () => run(async () => {
    if (!confirm('Réinitialiser la partie et les scores ?')) return;
    const { error } = await supabase.rpc('reset_game', { p_session_id: sessionId });
    if (error) throw error;
  });

  const copyCode = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!session) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Chargement...</div>;
  }

  const firstBuzzer = currentRound?.first_buzzer_id
    ? players.find(p => p.player_id === currentRound.first_buzzer_id)
    : null;

  const winner = session.winner_id ? players.find(p => p.player_id === session.winner_id) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {session.status === 'finished' && winner && (
        <WinnerView
          winnerName={winner.profile?.display_name ?? 'Gagnant'}
          onReset={resetGame}
          onClose={onBack}
          isAdmin={true}
        />
      )}

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 truncate">{session.name}</h1>
              <p className="text-xs text-slate-500">{players.length} joueur{players.length > 1 ? 's' : ''} connecté{players.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={copyCode}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
            title="Copier le code"
          >
            <span className="font-mono font-bold tracking-widest">{session.code}</span>
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copied && <div className="bg-green-50 text-green-700 text-center text-sm py-2">Code copié</div>}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Contrôle de la manche</h2>
              {currentRound && (
                <span className="text-xs text-slate-500">Manche #{currentRound.round_number}</span>
              )}
            </div>

            {!currentRound && (
              <div className="text-center py-8">
                <p className="text-slate-500 mb-4">Aucune manche en cours</p>
                <button
                  onClick={startRound}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 font-bold rounded-lg hover:bg-amber-300 disabled:opacity-50 transition"
                >
                  <Play className="w-5 h-5" /> Démarrer la manche
                </button>
                {players.length === 0 && <p className="mt-3 text-xs text-slate-400">Astuce: les joueurs peuvent rejoindre même après le démarrage</p>}
              </div>
            )}

            {currentRound && currentRound.status === 'open' && (
              <div className="text-center py-8 border-2 border-dashed border-amber-300 bg-amber-50 rounded-lg">
                <div className="inline-flex w-3 h-3 bg-green-500 rounded-full animate-pulse mb-2"></div>
                <p className="text-amber-900 font-semibold">Manche ouverte - en attente du premier buzz</p>
                <p className="text-xs text-amber-700 mt-1">{blockedIds.length} joueur(s) bloqué(s)</p>
              </div>
            )}

            {currentRound && currentRound.status === 'buzzed' && firstBuzzer && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-amber-100 to-orange-100 border-2 border-amber-400 rounded-xl p-6 text-center">
                  <p className="text-xs uppercase tracking-wider text-amber-800 font-semibold mb-1">Premier buzzer</p>
                  <p className="text-4xl font-bold text-slate-900">{firstBuzzer.profile?.display_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => resolve(true)}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-4 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 disabled:opacity-50 transition"
                  >
                    <Check className="w-5 h-5" /> Bonne réponse
                  </button>
                  <button
                    onClick={() => resolve(false)}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-4 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 disabled:opacity-50 transition"
                  >
                    <X className="w-5 h-5" /> Mauvaise réponse
                  </button>
                </div>
              </div>
            )}

            {currentRound && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                <button
                  onClick={resetRound}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  <RotateCcw className="w-4 h-4" /> Réinitialiser la manche
                </button>
                <button
                  onClick={resetGame}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg ml-auto"
                >
                  <RefreshCw className="w-4 h-4" /> Réinitialiser la partie
                </button>
              </div>
            )}

            {err && <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{err}</div>}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-slate-500" /> Joueurs connectés
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {players.length === 0 && <p className="text-sm text-slate-400">En attente de joueurs...</p>}
              {players.map(p => {
                const blocked = blockedIds.includes(p.player_id);
                return (
                  <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border ${blocked ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className={`w-2 h-2 rounded-full ${blocked ? 'bg-red-400' : 'bg-green-400'}`}></div>
                    <span className="font-medium text-slate-900 flex-1 truncate">{p.profile?.display_name}</span>
                    <span className="text-sm font-bold text-slate-700">{p.score} pts</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <Scoreboard
            players={players}
            target={session.target_score}
            highlightId={currentRound?.first_buzzer_id}
          />
        </div>
      </main>
    </div>
  );
}
