import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { QuizSession, SessionPlayer, Round, Profile } from '../types';

export interface SessionState {
  session: QuizSession | null;
  players: (SessionPlayer & { profile?: Profile })[];
  currentRound: Round | null;
  blockedIds: string[];
}

export function useSessionRealtime(sessionId: string | null) {
  const [state, setState] = useState<SessionState>({
    session: null, players: [], currentRound: null, blockedIds: [],
  });
  const [disconnected, setDisconnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const failCountRef = useRef(0);

  const fetchAll = useCallback(async () => {
    if (!sessionId) return;

    const { data: session, error: sessErr } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessErr || !session) {
      failCountRef.current += 1;
      if (failCountRef.current >= 3) {
        setDisconnected(true);
      }
      return;
    }

    failCountRef.current = 0;

    const { data: players } = await supabase
      .from('session_players')
      .select('*, profile:profiles(*)')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true });

    let currentRound: Round | null = null;
    if (session?.current_round_id) {
      const { data: r } = await supabase.from('rounds').select('*').eq('id', session.current_round_id).maybeSingle();
      currentRound = r as Round | null;
    }
    let blockedIds: string[] = [];
    if (currentRound) {
      const { data: blocks } = await supabase.from('round_blocks').select('player_id').eq('round_id', currentRound.id);
      blockedIds = (blocks ?? []).map((b: { player_id: string }) => b.player_id);
    }

    setState({
      session: session as QuizSession | null,
      players: (players ?? []) as (SessionPlayer & { profile?: Profile })[],
      currentRound,
      blockedIds,
    });
  }, [sessionId]);

  const ping = useCallback(() => {
    if (!channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'sync', payload: { t: Date.now() } });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    failCountRef.current = 0;
    setDisconnected(false);
    fetchAll();

    const channel = supabase
      .channel(`session-${sessionId}`, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sessions', filter: `id=eq.${sessionId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_players', filter: `session_id=eq.${sessionId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `session_id=eq.${sessionId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_blocks' }, fetchAll)
      .on('broadcast', { event: 'sync' }, fetchAll)
      .subscribe();

    channelRef.current = channel;

    const poll = setInterval(fetchAll, 2500);

    // Les navigateurs brident les minuteurs des onglets en arriere-plan : au
    // retour de veille, le poll peut avoir plusieurs secondes de retard et le
    // WebSocket etre tombe. On resynchronise immediatement plutot que de
    // laisser le joueur devant un ecran perime.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', fetchAll);

    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', fetchAll);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId, fetchAll]);

  return { ...state, disconnected, refresh: fetchAll, ping };
}
