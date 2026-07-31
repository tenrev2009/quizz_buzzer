import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useSessionRealtime } from '../hooks/useSessionRealtime';
import { useSpotifyAuth } from '../hooks/useSpotifyAuth';
import Scoreboard from './Scoreboard';
import WinnerView from './WinnerView';
import QuizEditor from './QuizEditor';
import SpotifyConnect from './SpotifyConnect';
import SpotifyPlaylistPicker from './SpotifyPlaylistPicker';
import MusicPlayer from './MusicPlayer';
import type { QuizQuestion, MusicSessionConfig } from '../types';
import { ArrowLeft, Play, Check, X, RotateCcw, RefreshCw, Users, Copy, ListChecks, ChevronRight, Music, Loader2 } from 'lucide-react';

interface Props { sessionId: string; onBack: () => void; }

export default function AdminSessionView({ sessionId, onBack }: Props) {
  const { session, players, currentRound, blockedIds, refresh, ping, disconnected } = useSessionRealtime(sessionId);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'game' | 'questions'>('game');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<{ player_id: string; answer_index: number }[]>([]);
  const [playedQuestionIds, setPlayedQuestionIds] = useState<Set<string>>(new Set());

  const isQcm = session?.game_mode === 'qcm';
  const isMusic = session?.game_mode === 'music';

  const spotify = useSpotifyAuth();
  const [musicConfig, setMusicConfig] = useState<MusicSessionConfig | null>(null);
  const [changingPlaylist, setChangingPlaylist] = useState(false);

  const fetchMusicConfig = useCallback(async () => {
    const { data } = await supabase
      .from('music_session_config')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();
    setMusicConfig(data as MusicSessionConfig | null);
  }, [sessionId]);

  useEffect(() => {
    if (isMusic) fetchMusicConfig();
  }, [isMusic, fetchMusicConfig]);

  const selectPlaylist = async (playlist: { id: string; name: string }) => {
    const playbackMode = spotify.isPremium ? 'premium' : 'preview';
    const { error } = await supabase
      .from('music_session_config')
      .upsert({
        session_id: sessionId,
        spotify_playlist_id: playlist.id,
        spotify_playlist_name: playlist.name,
        playback_mode: playbackMode,
        // Nouvelle playlist : l'historique et le morceau courant portaient sur
        // l'ancienne, les conserver fausserait le tirage.
        current_track_uri: null,
        current_track_name: null,
        current_track_artist: null,
        current_track_preview_url: null,
        played_track_uris: [],
      }, { onConflict: 'session_id' });
    if (error) {
      setErr(`Impossible d'enregistrer la playlist : ${error.message}`);
      return;
    }
    setErr(null);
    setChangingPlaylist(false);
    fetchMusicConfig();
  };

  const onMusicTrackStarted = () => {
    run(async () => {
      const { error } = await supabase.rpc('start_round', { p_session_id: sessionId });
      if (error) throw error;
    });
  };

  const playlistHeader = (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <Music className="w-5 h-5 text-[#1DB954]" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{musicConfig?.spotify_playlist_name}</p>
        <p className="text-xs text-slate-500">{musicConfig?.playback_mode === 'premium' ? 'Lecture complete' : 'Extraits 30s'}</p>
      </div>
      <button
        onClick={() => setChangingPlaylist(true)}
        className="text-xs font-medium text-slate-600 hover:text-[#1DB954] transition whitespace-nowrap"
      >
        Changer de playlist
      </button>
    </div>
  );

  const fetchQuestions = async () => {
    const { data } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('position', { ascending: true });
    setQuestions((data ?? []) as QuizQuestion[]);
  };

  const fetchPlayedQuestions = async () => {
    const { data } = await supabase
      .from('rounds')
      .select('question_id')
      .eq('session_id', sessionId)
      .eq('status', 'closed')
      .not('question_id', 'is', null);
    setPlayedQuestionIds(new Set((data ?? []).map((r: { question_id: string }) => r.question_id)));
  };

  const fetchAnswers = async (roundId: string) => {
    const { data } = await supabase
      .from('player_answers')
      .select('player_id, answer_index')
      .eq('round_id', roundId);
    setAnswers((data ?? []) as { player_id: string; answer_index: number }[]);
  };

  useEffect(() => {
    if (isQcm) {
      fetchQuestions();
      fetchPlayedQuestions();
    }
  }, [sessionId, isQcm]);

  useEffect(() => {
    if (currentRound && isQcm && currentRound.question_id) {
      fetchAnswers(currentRound.id);
      const interval = setInterval(() => fetchAnswers(currentRound.id), 2000);
      return () => clearInterval(interval);
    } else {
      setAnswers([]);
    }
  }, [currentRound?.id, isQcm]);

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
    if (correct && isQcm) fetchPlayedQuestions();
    if (isMusic) fetchMusicConfig();
  });

  const resolveQcm = () => run(async () => {
    if (!currentRound) return;
    const { error } = await supabase.rpc('resolve_qcm_round', { p_round_id: currentRound.id });
    if (error) throw error;
    fetchPlayedQuestions();
  });

  const skipQuestion = () => run(async () => {
    if (!currentRound) return;
    const { error } = await supabase.rpc('skip_qcm_round', { p_round_id: currentRound.id });
    if (error) throw error;
    if (isQcm) fetchPlayedQuestions();
    if (isMusic) fetchMusicConfig();
  });

  const finishGame = () => run(async () => {
    const { error } = await supabase.rpc('finish_game', { p_session_id: sessionId });
    if (error) throw error;
  });

  const nextQuestion = () => run(async () => {
    const { data: closedRounds } = await supabase
      .from('rounds')
      .select('question_id')
      .eq('session_id', sessionId)
      .eq('status', 'closed');
    const played = new Set((closedRounds ?? []).map(r => r.question_id).filter(Boolean));
    setPlayedQuestionIds(played);

    const nextQ = questions.find(q => !played.has(q.id));
    if (nextQ) {
      const { error } = await supabase.rpc('start_qcm_round', { p_session_id: sessionId, p_question_id: nextQ.id });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('quiz_sessions')
        .update({ current_round_id: null })
        .eq('id', sessionId);
      if (error) throw error;
    }
  });

  const resetRound = () => run(async () => {
    const { error } = await supabase.rpc('reset_current_round', { p_session_id: sessionId });
    if (error) throw error;
  });

  const resetGame = () => run(async () => {
    if (!confirm('Reinitialiser completement la partie (les joueurs devront se reconnecter) ?')) return;
    const { error } = await supabase.rpc('reset_game', { p_session_id: sessionId });
    if (error) throw error;
    setPlayedQuestionIds(new Set());
  });

  const newGame = () => run(async () => {
    const { error } = await supabase.rpc('new_game', { p_session_id: sessionId });
    if (error) throw error;
    setPlayedQuestionIds(new Set());
  });

  const copyCode = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (disconnected) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-slate-700 font-semibold text-lg mb-2">Session introuvable</p>
        <p className="text-slate-500 text-sm mb-4">La session a ete supprimee ou n'est pas accessible.</p>
        <button onClick={onBack} className="px-5 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition">
          Retour
        </button>
      </div>
    );
  }

  if (!session) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Chargement...</div>;
  }

  const firstBuzzer = currentRound?.first_buzzer_id
    ? players.find(p => p.player_id === currentRound.first_buzzer_id)
    : null;

  const winner = session.winner_id ? players.find(p => p.player_id === session.winner_id) : null;

  const currentQuestion = currentRound?.question_id
    ? questions.find(q => q.id === currentRound.question_id)
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {session.status === 'finished' && winner && (
        <WinnerView
          winnerName={winner.profile?.display_name ?? 'Gagnant'}
          players={players.map(p => ({ name: p.profile?.display_name ?? 'Joueur', score: p.score }))}
          onReset={newGame}
          onClose={resetGame}
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
              <p className="text-xs text-slate-500">{players.length} joueur{players.length > 1 ? 's' : ''} connecte{players.length > 1 ? 's' : ''}</p>
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
        {copied && <div className="bg-green-50 text-green-700 text-center text-sm py-2">Code copie</div>}

        {isQcm && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex gap-1 -mb-px">
              <button
                onClick={() => setTab('game')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === 'game' ? 'border-amber-400 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <Play className="w-4 h-4 inline mr-1.5" />Partie
              </button>
              <button
                onClick={() => { setTab('questions'); fetchQuestions(); }}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === 'questions' ? 'border-amber-400 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <ListChecks className="w-4 h-4 inline mr-1.5" />Questions ({questions.length})
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {isQcm && tab === 'questions' ? (
          <QuizEditor sessionId={sessionId} />
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-slate-900">Controle de la manche</h2>
                  {currentRound && (
                    <span className="text-xs text-slate-500">Manche #{currentRound.round_number}</span>
                  )}
                </div>

                {/* No current round - Buzzer mode */}
                {!currentRound && !isQcm && !isMusic && (
                  <div className="text-center py-8">
                    <p className="text-slate-500 mb-4">Aucune manche en cours</p>
                    <button
                      onClick={startRound}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 font-bold rounded-lg hover:bg-amber-300 disabled:opacity-50 transition"
                    >
                      <Play className="w-5 h-5" /> Demarrer la manche
                    </button>
                  </div>
                )}

                {/* No current round - Music mode */}
                {!currentRound && isMusic && (
                  <div className="space-y-5">
                    {!spotify.connected && (
                      <SpotifyConnect />
                    )}
                    {spotify.connected && spotify.accessToken && (!musicConfig || changingPlaylist) && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-slate-700 font-medium">Choisissez une playlist :</p>
                          {musicConfig && (
                            <button onClick={() => setChangingPlaylist(false)} className="text-xs text-slate-500 hover:text-slate-800 transition">
                              Annuler
                            </button>
                          )}
                        </div>
                        <SpotifyPlaylistPicker
                          accessToken={spotify.accessToken}
                          onSelect={selectPlaylist}
                          selectedId={musicConfig?.spotify_playlist_id}
                        />
                      </div>
                    )}
                    {spotify.connected && musicConfig && !changingPlaylist && spotify.accessToken && (
                      <div className="space-y-4">
                        {playlistHeader}
                        <MusicPlayer
                          sessionId={sessionId}
                          accessToken={spotify.accessToken}
                          playbackMode={musicConfig.playback_mode}
                          config={musicConfig}
                          onTrackSelected={fetchMusicConfig}
                          onTrackStarted={onMusicTrackStarted}
                          roundStatus={null}
                        />
                        <p className="text-center text-sm text-slate-500">Choisissez un morceau avec Suivant, puis lancez-le avec Play pour demarrer la manche</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Current round - Music mode */}
                {currentRound && isMusic && (
                  <div className="space-y-4">
                    {spotify.loading && (
                      <div className="flex items-center gap-3 py-6 justify-center">
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                        <span className="text-sm text-slate-500">Connexion Spotify...</span>
                      </div>
                    )}
                    {!spotify.loading && !spotify.connected && (
                      <SpotifyConnect />
                    )}
                    {spotify.connected && musicConfig && changingPlaylist && spotify.accessToken && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-slate-700 font-medium">Choisissez une playlist :</p>
                          <button onClick={() => setChangingPlaylist(false)} className="text-xs text-slate-500 hover:text-slate-800 transition">
                            Annuler
                          </button>
                        </div>
                        <SpotifyPlaylistPicker
                          accessToken={spotify.accessToken}
                          onSelect={selectPlaylist}
                          selectedId={musicConfig.spotify_playlist_id}
                        />
                      </div>
                    )}
                    {spotify.connected && musicConfig && !changingPlaylist && spotify.accessToken && (
                      <>
                        {playlistHeader}
                        <MusicPlayer
                          sessionId={sessionId}
                          accessToken={spotify.accessToken}
                          playbackMode={musicConfig.playback_mode}
                          config={musicConfig}
                          onTrackSelected={fetchMusicConfig}
                          onTrackStarted={() => {
                            fetchMusicConfig();
                            refresh();
                            ping();
                          }}
                          roundStatus={currentRound.status}
                        />
                      </>
                    )}
                    {spotify.connected && !musicConfig && (
                      <div className="text-center py-4 text-slate-500 text-sm">Configuration musicale manquante. Veuillez reinitialiser la manche.</div>
                    )}
                  </div>
                )}

                {/* No current round - QCM mode: start or all done */}
                {!currentRound && isQcm && (
                  <div className="text-center py-8">
                    {questions.length === 0 && (
                      <div>
                        <p className="text-slate-400 mb-2">Aucune question preparee</p>
                        <p className="text-xs text-slate-400">Allez dans l'onglet Questions pour en ajouter.</p>
                      </div>
                    )}
                    {questions.length > 0 && questions.every(q => playedQuestionIds.has(q.id)) && (
                      <div>
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                          <Check className="w-8 h-8 text-green-600" />
                        </div>
                        <p className="text-slate-700 font-semibold text-lg mb-1">Toutes les questions ont ete jouees !</p>
                        <p className="text-slate-500 text-sm mb-6">{questions.length} questions terminees</p>

                        <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Classement final</p>
                          {[...players].sort((a, b) => b.score - a.score).map((p, idx) => (
                            <div key={p.player_id} className={`flex items-center gap-3 py-2 ${idx === 0 ? 'text-amber-600 font-bold' : 'text-slate-700'}`}>
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-500'}`}>
                                {idx + 1}
                              </span>
                              <span className="flex-1 truncate">{p.profile?.display_name ?? 'Joueur'}</span>
                              <span className="font-bold text-lg">{p.score} pt{p.score > 1 ? 's' : ''}</span>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={finishGame}
                          disabled={loading}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 disabled:opacity-50 transition"
                        >
                          <Check className="w-5 h-5" /> Terminer la partie
                        </button>
                      </div>
                    )}
                    {questions.length > 0 && !questions.every(q => playedQuestionIds.has(q.id)) && (
                      <div>
                        <p className="text-slate-500 mb-4">
                          {playedQuestionIds.size === 0
                            ? `${questions.length} question${questions.length > 1 ? 's' : ''} prete${questions.length > 1 ? 's' : ''}`
                            : `${playedQuestionIds.size}/${questions.length} questions jouees`
                          }
                        </p>
                        <button
                          onClick={nextQuestion}
                          disabled={loading}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 font-bold rounded-lg hover:bg-amber-300 disabled:opacity-50 transition"
                        >
                          <Play className="w-5 h-5" />
                          {playedQuestionIds.size === 0 ? 'Lancer la partie' : 'Question suivante'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Current round - QCM with choices */}
                {currentRound && isQcm && currentQuestion && currentQuestion.question_type !== 'buzzer' && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                      <p className="text-xs uppercase tracking-wider text-blue-600 font-semibold mb-2">
                        Question {questions.findIndex(q => q.id === currentQuestion!.id) + 1}/{questions.length}
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-bold normal-case">
                          {currentQuestion.question_type === 'choice_2' ? '1 pt' : currentQuestion.question_type === 'choice_4' ? '2 pts' : '3 pts'}
                        </span>
                      </p>
                      <p className="text-lg font-bold text-slate-900">{currentQuestion.question_text}</p>
                      {currentQuestion.options && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {currentQuestion.options.map((opt, i) => (
                            <div
                              key={i}
                              className={`px-3 py-2 rounded-lg text-sm font-medium border ${currentQuestion.correct_index === i ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-slate-200 text-slate-700'}`}
                            >
                              <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Reponses ({answers.length}/{players.length})
                      </p>
                      <div className="grid gap-1.5">
                        {players.map(p => {
                          const ans = answers.find(a => a.player_id === p.player_id);
                          return (
                            <div key={p.id} className="flex items-center gap-2 text-sm">
                              <div className={`w-2 h-2 rounded-full ${ans ? 'bg-green-400' : 'bg-slate-300'}`} />
                              <span className="text-slate-700 flex-1">{p.profile?.display_name}</span>
                              {ans && currentQuestion.options && (
                                <span className={`text-xs px-2 py-0.5 rounded ${ans.answer_index === currentQuestion.correct_index ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {String.fromCharCode(65 + ans.answer_index)}. {currentQuestion.options[ans.answer_index]}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {currentRound.status === 'open' && (
                      <div className="flex gap-2">
                        <button
                          onClick={resolveQcm}
                          disabled={loading}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 disabled:opacity-50 transition"
                        >
                          <Check className="w-5 h-5" /> Attribuer les points
                        </button>
                        <button
                          onClick={skipQuestion}
                          disabled={loading}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 disabled:opacity-50 transition"
                        >
                          <ChevronRight className="w-5 h-5" /> Passer
                        </button>
                      </div>
                    )}

                    {currentRound.status === 'closed' && (
                      <button
                        onClick={nextQuestion}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-400 text-slate-900 font-bold rounded-lg hover:bg-amber-300 disabled:opacity-50 transition"
                      >
                        <ChevronRight className="w-5 h-5" /> Question suivante
                      </button>
                    )}
                  </div>
                )}

                {/* Current round - buzzer mode (same as before + QCM buzzer-type questions) */}
                {currentRound && (isMusic || !isQcm || (currentQuestion && currentQuestion.question_type === 'buzzer')) && (
                  <>
                    {currentQuestion && (
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 mb-4">
                        <p className="text-xs uppercase tracking-wider text-amber-600 font-semibold mb-1">Question</p>
                        <p className="text-lg font-bold text-slate-900">{currentQuestion.question_text}</p>
                      </div>
                    )}

                    {currentRound.status === 'open' && (
                      <div className="text-center py-8 border-2 border-dashed border-amber-300 bg-amber-50 rounded-lg">
                        {blockedIds.length >= players.length && players.length > 0 ? (
                          <>
                            <div className="inline-flex w-3 h-3 bg-red-500 rounded-full mb-2"></div>
                            <p className="text-red-800 font-semibold">Tous les joueurs sont bloques !</p>
                            <p className="text-xs text-red-600 mt-1">Personne ne peut plus buzzer sur cette question.</p>
                            <div className="flex gap-3 justify-center mt-4">
                              <button
                                onClick={resetRound}
                                disabled={loading}
                                className="flex items-center gap-2 px-5 py-2.5 bg-amber-400 text-slate-900 font-bold rounded-lg hover:bg-amber-300 disabled:opacity-50 transition"
                              >
                                <RotateCcw className="w-4 h-4" /> Relancer la question
                              </button>
                              <button
                                onClick={skipQuestion}
                                disabled={loading}
                                className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 disabled:opacity-50 transition"
                              >
                                <ChevronRight className="w-5 h-5" /> Passer (0 point)
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="inline-flex w-3 h-3 bg-green-500 rounded-full animate-pulse mb-2"></div>
                            <p className="text-amber-900 font-semibold">Manche ouverte - en attente du premier buzz</p>
                            {blockedIds.length > 0 && <p className="text-xs text-amber-700 mt-1">{blockedIds.length} joueur(s) bloque(s)</p>}
                          </>
                        )}
                      </div>
                    )}

                    {currentRound.status === 'buzzed' && firstBuzzer && (
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
                            <Check className="w-5 h-5" /> Bonne reponse
                          </button>
                          <button
                            onClick={() => resolve(false)}
                            disabled={loading}
                            className="flex items-center justify-center gap-2 px-4 py-4 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 disabled:opacity-50 transition"
                          >
                            <X className="w-5 h-5" /> Mauvaise reponse
                          </button>
                        </div>
                        {(isQcm || isMusic) && (
                          <button
                            onClick={skipQuestion}
                            disabled={loading}
                            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 disabled:opacity-50 transition text-sm"
                          >
                            <ChevronRight className="w-4 h-4" /> Passer cette question
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {currentRound && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                    <button
                      onClick={resetRound}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      <RotateCcw className="w-4 h-4" /> Reinitialiser la manche
                    </button>
                    <button
                      onClick={resetGame}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg ml-auto"
                    >
                      <RefreshCw className="w-4 h-4" /> Reinitialiser la partie
                    </button>
                  </div>
                )}

                {err && <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{err}</div>}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-slate-500" /> Joueurs connectes
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
          </div>
        )}
      </main>
    </div>
  );
}
