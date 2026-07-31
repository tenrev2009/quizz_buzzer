import { useCallback, useEffect, useState } from 'react';
import { Music, Search, Check, Loader2, ListMusic } from 'lucide-react';

interface Playlist {
  id: string;
  name: string | null;
  images: { url: string }[] | null;
  tracks: { total: number } | null;
}

interface Props {
  accessToken: string;
  onSelect: (playlist: { id: string; name: string }) => void;
  selectedId?: string | null;
}

export default function SpotifyPlaylistPicker({ accessToken, onSelect, selectedId }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allPlaylists: Playlist[] = [];
      let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';

      while (url) {
        const res: Response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('Erreur lors du chargement des playlists');
        const data: { items: (Playlist | null)[]; next: string | null } = await res.json();
        // Spotify renvoie parfois des entrees nulles ou sans id pour des
        // playlists supprimees ou inaccessibles : on les ecarte.
        allPlaylists.push(...(data.items ?? []).filter((p): p is Playlist => !!p?.id));
        url = data.next;
      }
      setPlaylists(allPlaylists);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const filtered = playlists.filter(p =>
    (p.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        <span className="ml-3 text-slate-500">Chargement des playlists...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={fetchPlaylists} className="mt-2 text-sm text-amber-600 hover:underline">Reessayer</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une playlist..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">Aucune playlist trouvee</div>
        )}
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect({ id: p.id, name: p.name ?? 'Playlist sans nom' })}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition ${selectedId === p.id ? 'bg-amber-50' : ''}`}
          >
            {p.images?.[0]?.url ? (
              <img src={p.images[0].url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded bg-slate-200 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{p.name ?? 'Playlist sans nom'}</p>
              <p className="text-xs text-slate-500">{p.tracks?.total ?? 0} titres</p>
            </div>
            {selectedId === p.id && <Check className="w-5 h-5 text-amber-500 flex-shrink-0" />}
          </button>
        ))}
      </div>

      {playlists.length > 0 && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <ListMusic className="w-3.5 h-3.5" />
          {playlists.length} playlist{playlists.length > 1 ? 's' : ''} disponible{playlists.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
