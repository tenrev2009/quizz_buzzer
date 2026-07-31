export type Role = 'admin' | 'player';
export type GameMode = 'buzzer' | 'qcm' | 'music';

export interface MusicSessionConfig {
  session_id: string;
  spotify_playlist_id: string;
  spotify_playlist_name: string | null;
  playback_mode: 'preview' | 'premium';
  current_track_uri: string | null;
  current_track_name: string | null;
  current_track_artist: string | null;
  current_track_preview_url: string | null;
  played_track_uris: string[];
  created_at: string;
}

export interface SpotifyToken {
  user_id: string;
  access_token: string;
  expires_at: string;
  product: string | null;
  spotify_user_id: string | null;
}
export type QuestionType = 'choice_2' | 'choice_4' | 'buzzer';

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
  game_mode: GameMode;
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
  question_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface QuizQuestion {
  id: string;
  session_id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  correct_index: number | null;
  position: number;
  created_at: string;
}

export interface PlayerAnswer {
  id: string;
  round_id: string;
  player_id: string;
  answer_index: number;
  answered_at: string;
}

export interface GameEvent {
  id: string;
  session_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}
