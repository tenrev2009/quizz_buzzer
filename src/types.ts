export type Role = 'admin' | 'player';

export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface QuizSession {
  id: string;
  admin_id: string;
  name: string;
  code: string;
  target_score: number;
  status: 'waiting' | 'playing' | 'finished';
  winner_id: string | null;
  current_round_id: string | null;
  created_at: string;
}

export interface SessionPlayer {
  id: string;
  session_id: string;
  player_id: string;
  score: number;
  joined_at: string;
  last_seen: string;
  profile?: Profile;
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  status: 'open' | 'buzzed' | 'closed';
  first_buzzer_id: string | null;
  first_buzz_at: string | null;
  outcome: 'correct' | 'wrong' | null;
  created_at: string;
  resolved_at: string | null;
}

export interface GameEvent {
  id: string;
  session_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}
