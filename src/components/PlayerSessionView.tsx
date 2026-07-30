import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useSessionRealtime } from '../hooks/useSessionRealtime';
import Scoreboard from './Scoreboard';
import WinnerView from './WinnerView';
import type { QuizQuestion } from '../types';
import { ArrowLeft, Zap, Lock, Ban, Clock, Trophy, Check, X } from 'lucide-react';

interface Props { sessionId: string; onLeave: () => void; }

const BUZZ_COOLDOWN_MS = 500;

export default function PlayerSessionView({ sessionId, onLeave }: Props) {
  const { profile } = useAuth();
  const { session, players, currentRound, blockedIds, refresh, ping } = useSessionRealtime(sessionId);
  const [buzzing, setBuzzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastBuzzRef = useRef<number>(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const t = setInterval(() => {
      supabase.from('session_players').update({ last_seen: new Date().toISOString() })
        .eq('session_id', sessionId).eq('player_id', profile.id);
    }, 15000);
    return () => clearInterval(t);
  }, [sessionId, profile]);

  useEffect(() => {
    if (currentRound?.question_id) {
      supabase
        .from('quiz_questions')
        .select('*')
        .eq('id', currentRound.question_id)
        .maybeSingle()
        .then(({ data }) => setCurrentQuestion(data as QuizQuestion | null));
    } else {
      setCurrentQuestion(null);
    }
    setMyAnswer(null);
  }, [currentRound?.question_id]);

  useEffect(() => {
    if (!currentRound || !profile) return;
    supabase
      .from('player_answers')
      .select('answer_index')
      .eq('round_id', currentRound.id)
      .eq('player_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMyAnswer(data.answer_index);
      });
  }, [currentRound?.id, profile?.id]);

  if (!session || !profile) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Chargement...</div>;
  }

  const me = players.find(p => p.player_id === profile.id);
  const amBlocked = currentRound ? blockedIds.includes(profile.id) : false;
  const firstBuzzer = currentRound?.first_buzzer_id
    ? players.find(p => p.player_id === currentRound.first_buzzer_id)
    : null;
  const iBuzzedFirst = currentRound?.first_buzzer_id === profile.id;
  const roundOpen = currentRound?.status === 'open';
  const winner = session.winner_id ? players.find(p => p.player_id === session.winner_id) : null;

  const isChoiceQuestion = currentQuestion && currentQuestion.question_type !== 'buzzer';
  const isBuzzerQuestion = !currentQuestion || currentQuestion.question_type === 'buzzer';

  const toMsg = (e: unknown): string => {
    if (!e) return 'Erreur inconnue';
    if (e instanceof Error) return e.message;
    if (typeof e === 'object' && e && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
      return (e as { message: string }).message;
    }
    try { return JSON.stringify(e); } catch { return 'Erreur'; }
  };

  const doBuzz = async () => {
    if (!currentRound || !roundOpen || amBlocked) return;
    const now = Date.now();
    if (now - lastBuzzRef.current < BUZZ_COOLDOWN_MS) return;
    lastBuzzRef.current = now;
    if (buzzing) return;
    setBuzzing(true); setErr(null);
    try {
      const { error } = await supabase.rpc('attempt_buzz', { p_round_id: currentRound.id });
      if (error) throw error;
      refresh();
      ping();
    } catch (e: unknown) {
      setErr(toMsg(e));
    } finally {
      setBuzzing(false);
    }
  };

  const submitAnswer = async (answerIndex: number) => {
    if (!currentRound || !roundOpen || submitting || myAnswer !== null) return;
    setSubmitting(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc('submit_answer', { p_round_id: currentRound.id, p_answer_index: answerIndex });
      if (error) throw error;
      setMyAnswer(answerIndex);
      ping();
    } catch (e: unknown) {
      setErr(toMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const roundClosed = currentRound?.status === 'closed';

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {session.status === 'finished' && winner && (
        <WinnerView
          winnerName={winner.profile?.display_name ?? 'Gagnant'}
          onReset={() => {}}
          onClose={() => {}}
          isAdmin={false}
        />
      )}

      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onLeave} className="p-2 text-slate-300 hover:bg-slate-700 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-slate-400">{session.name}</p>
            <p className="font-mono font-bold text-amber-400 tracking-widest">{session.code}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">{profile.display_name}</p>
            <p className="font-bold text-white">{me?.score ?? 0} pts</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-4xl mx-auto w-full">
        {/* Waiting for round */}
        {!currentRound && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-800 mb-4">
              <Clock className="w-10 h-10 text-slate-500" />
            </div>
            <p className="text-white text-xl font-semibold mb-1">En attente...</p>
            <p className="text-slate-400">L'administrateur va lancer une manche</p>
          </div>
        )}

        {/* QCM Choice question */}
        {currentRound && isChoiceQuestion && (
          <div className="w-full max-w-lg">
            <p className="text-slate-400 text-sm mb-3 uppercase tracking-wider text-center">
              Manche #{currentRound.round_number}
            </p>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
              <p className="text-white text-xl font-bold text-center">{currentQuestion!.question_text}</p>
            </div>

            {roundOpen && myAnswer === null && (
              <div className={`grid gap-3 ${currentQuestion!.question_type === 'choice_4' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {currentQuestion!.options!.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => submitAnswer(i)}
                    disabled={submitting}
                    className="flex items-center gap-3 p-4 bg-slate-800 border-2 border-slate-600 hover:border-amber-400 hover:bg-slate-700 rounded-xl transition text-left disabled:opacity-50 group"
                  >
                    <span className="w-10 h-10 rounded-full bg-slate-700 group-hover:bg-amber-400 group-hover:text-slate-900 text-amber-400 font-bold text-lg flex items-center justify-center flex-shrink-0 transition">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-white font-medium text-lg">{opt}</span>
                  </button>
                ))}
              </div>
            )}

            {roundOpen && myAnswer !== null && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <p className="text-green-400 font-bold text-xl mb-1">Reponse envoyee !</p>
                <p className="text-slate-400 text-sm">
                  Vous avez choisi : <span className="text-white font-medium">{String.fromCharCode(65 + myAnswer)}. {currentQuestion!.options![myAnswer]}</span>
                </p>
                <p className="text-slate-500 text-xs mt-2">En attente des resultats...</p>
              </div>
            )}

            {roundClosed && (
              <div className="text-center py-6">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${myAnswer === currentQuestion!.correct_index ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  {myAnswer === currentQuestion!.correct_index ? <Check className="w-8 h-8 text-green-400" /> : <X className="w-8 h-8 text-red-400" />}
                </div>
                <p className={`font-bold text-xl mb-1 ${myAnswer === currentQuestion!.correct_index ? 'text-green-400' : 'text-red-400'}`}>
                  {myAnswer === currentQuestion!.correct_index ? 'Bonne reponse !' : 'Mauvaise reponse'}
                </p>
                {currentQuestion!.correct_index !== null && (
                  <p className="text-slate-400 text-sm mt-1">
                    La bonne reponse etait : <span className="text-green-400 font-medium">{String.fromCharCode(65 + currentQuestion!.correct_index)}. {currentQuestion!.options![currentQuestion!.correct_index]}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Buzzer mode (classic or buzzer-type question in QCM) */}
        {currentRound && isBuzzerQuestion && (
          <>
            {currentQuestion && (
              <div className="w-full max-w-lg mb-6 bg-slate-800 border border-slate-700 rounded-xl p-5 text-center">
                <p className="text-white text-xl font-bold">{currentQuestion.question_text}</p>
              </div>
            )}

            {currentRound.status === 'buzzed' && iBuzzedFirst && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-400 mb-4 animate-pulse">
                  <Zap className="w-10 h-10 text-slate-900" />
                </div>
                <p className="text-amber-400 font-bold text-2xl mb-1">Vous avez buzze !</p>
                <p className="text-slate-300">Donnez votre reponse a l'oral</p>
              </div>
            )}

            {currentRound.status === 'buzzed' && !iBuzzedFirst && firstBuzzer && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-800 mb-4">
                  <Lock className="w-10 h-10 text-slate-500" />
                </div>
                <p className="text-white font-bold text-xl mb-1">Buzzer verrouille</p>
                <p className="text-slate-400">{firstBuzzer.profile?.display_name} a buzze en premier</p>
              </div>
            )}

            {roundOpen && amBlocked && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 mb-4">
                  <Ban className="w-10 h-10 text-red-400" />
                </div>
                <p className="text-red-400 font-bold text-xl mb-1">Vous etes bloque</p>
                <p className="text-slate-400">Jusqu'a la prochaine manche</p>
              </div>
            )}

            {roundOpen && !amBlocked && (
              <div className="w-full flex flex-col items-center">
                <p className="text-slate-400 text-sm mb-4 uppercase tracking-wider">Manche #{currentRound.round_number}</p>
                <button
                  onClick={doBuzz}
                  disabled={buzzing}
                  className="group relative w-72 h-72 sm:w-80 sm:h-80 rounded-full bg-gradient-to-br from-red-500 to-red-700 shadow-[0_20px_60px_rgba(239,68,68,0.5)] hover:shadow-[0_25px_70px_rgba(239,68,68,0.7)] active:scale-95 transition-all duration-100 flex items-center justify-center disabled:opacity-70"
                >
                  <div className="absolute inset-3 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex flex-col items-center justify-center border-4 border-red-800/30">
                    <Zap className="w-20 h-20 text-white mb-2" strokeWidth={2.5} />
                    <span className="text-white font-black text-4xl tracking-wider">BUZZ</span>
                  </div>
                  <div className="absolute inset-0 rounded-full bg-red-500 opacity-0 group-active:opacity-30 transition" />
                </button>
                <p className="text-slate-400 text-xs mt-6">Appuyez des que vous connaissez la reponse</p>
              </div>
            )}
          </>
        )}

        {err && <div className="mt-4 px-4 py-2 bg-red-500/20 text-red-300 text-sm rounded-lg">{err}</div>}

        <div className="w-full max-w-md mt-10">
          <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
            <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2 text-slate-200">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold">Objectif: {session.target_score} pts</span>
            </div>
            <div className="p-2">
              <div className="bg-slate-900 rounded-lg">
                <Scoreboard players={players} target={session.target_score} highlightId={currentRound?.first_buzzer_id} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
