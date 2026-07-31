import { useSpotifyAuth } from '../hooks/useSpotifyAuth';
import { Music, CheckCircle, LogOut, Loader2 } from 'lucide-react';

export default function SpotifyConnect() {
  const { connected, loading, error, startAuth, disconnect, isPremium } = useSpotifyAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        <span className="text-sm text-slate-500">Verification Spotify...</span>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
        <CheckCircle className="w-5 h-5 text-green-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800">Spotify connecte</p>
          <p className="text-xs text-green-600">
            {isPremium ? 'Premium - Lecture complete disponible' : 'Gratuit - Extraits de 30 secondes'}
          </p>
        </div>
        <button
          onClick={disconnect}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
          title="Deconnecter Spotify"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={startAuth}
        className="flex items-center gap-3 w-full px-5 py-4 bg-[#1DB954] text-white font-semibold rounded-lg hover:bg-[#1ed760] transition"
      >
        <Music className="w-5 h-5" />
        <span>Connecter Spotify</span>
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        Connectez votre compte Spotify pour jouer des morceaux lors du quiz musical.
        Avec Premium, les morceaux seront joues en entier. Sans Premium, des extraits de 30s seront utilises.
      </p>
    </div>
  );
}
