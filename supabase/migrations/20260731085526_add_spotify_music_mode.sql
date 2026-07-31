/*
# Add Spotify music quiz mode

1. Modified Tables
   - `quiz_sessions`: Updated `game_mode` check constraint to allow 'music' in addition to 'buzzer' and 'qcm'.

2. New Tables
   - `spotify_tokens`
     - `user_id` (uuid, PK, references profiles) — the admin who connected Spotify
     - `access_token` (text) — current Spotify access token
     - `refresh_token` (text) — long-lived refresh token
     - `expires_at` (timestamptz) — when access_token expires
     - `spotify_user_id` (text) — Spotify user identifier
     - `product` (text) — 'premium', 'free', or 'open' (determines playback mode)
     - `created_at`, `updated_at` (timestamps)

   - `music_session_config`
     - `session_id` (uuid, PK, references quiz_sessions) — one config per music session
     - `spotify_playlist_id` (text) — selected playlist ID
     - `spotify_playlist_name` (text) — display name of the playlist
     - `playback_mode` (text) — 'preview' (30s clips) or 'premium' (full SDK playback)
     - `current_track_uri` (text) — Spotify URI of the currently playing track
     - `current_track_name` (text) — track title (for display after reveal)
     - `current_track_artist` (text) — artist name
     - `current_track_preview_url` (text) — 30s audio preview URL
     - `played_track_uris` (text[]) — tracks already used to avoid repeats
     - `created_at` (timestamp)

3. Security
   - RLS enabled on both new tables.
   - `spotify_tokens`: Only the owning authenticated user can read/update their own row.
     Insert is allowed for authenticated users for their own row.
   - `music_session_config`: Admin of the session can full CRUD. Players in the session can SELECT.

4. Notes
   - Music mode reuses the existing round/buzz infrastructure from buzzer mode.
   - The `product` field on spotify_tokens determines whether to use the Web Playback SDK (premium)
     or HTML5 Audio with preview URLs (free).
*/

-- Extend game_mode check to include 'music'
ALTER TABLE quiz_sessions DROP CONSTRAINT IF EXISTS quiz_sessions_game_mode_check;
ALTER TABLE quiz_sessions ADD CONSTRAINT quiz_sessions_game_mode_check
  CHECK (game_mode IN ('buzzer', 'qcm', 'music'));

-- Spotify tokens table
CREATE TABLE IF NOT EXISTS spotify_tokens (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  spotify_user_id text,
  product text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE spotify_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_spotify_token" ON spotify_tokens;
CREATE POLICY "select_own_spotify_token" ON spotify_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_spotify_token" ON spotify_tokens;
CREATE POLICY "insert_own_spotify_token" ON spotify_tokens FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_spotify_token" ON spotify_tokens;
CREATE POLICY "update_own_spotify_token" ON spotify_tokens FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_spotify_token" ON spotify_tokens;
CREATE POLICY "delete_own_spotify_token" ON spotify_tokens FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Music session config table
CREATE TABLE IF NOT EXISTS music_session_config (
  session_id uuid PRIMARY KEY REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  spotify_playlist_id text NOT NULL,
  spotify_playlist_name text,
  playback_mode text NOT NULL DEFAULT 'preview' CHECK (playback_mode IN ('preview', 'premium')),
  current_track_uri text,
  current_track_name text,
  current_track_artist text,
  current_track_preview_url text,
  played_track_uris text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE music_session_config ENABLE ROW LEVEL SECURITY;

-- Admin of the session can full CRUD
DROP POLICY IF EXISTS "admin_select_music_config" ON music_session_config;
CREATE POLICY "admin_select_music_config" ON music_session_config FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM quiz_sessions WHERE quiz_sessions.id = music_session_config.session_id AND quiz_sessions.admin_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_music_config" ON music_session_config;
CREATE POLICY "admin_insert_music_config" ON music_session_config FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM quiz_sessions WHERE quiz_sessions.id = music_session_config.session_id AND quiz_sessions.admin_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_music_config" ON music_session_config;
CREATE POLICY "admin_update_music_config" ON music_session_config FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM quiz_sessions WHERE quiz_sessions.id = music_session_config.session_id AND quiz_sessions.admin_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM quiz_sessions WHERE quiz_sessions.id = music_session_config.session_id AND quiz_sessions.admin_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_delete_music_config" ON music_session_config;
CREATE POLICY "admin_delete_music_config" ON music_session_config FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM quiz_sessions WHERE quiz_sessions.id = music_session_config.session_id AND quiz_sessions.admin_id = auth.uid())
  );

-- Players in the session can see the config (for track reveal)
DROP POLICY IF EXISTS "player_select_music_config" ON music_session_config;
CREATE POLICY "player_select_music_config" ON music_session_config FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM session_players WHERE session_players.session_id = music_session_config.session_id AND session_players.player_id = auth.uid())
  );
