import { useEffect, useState } from 'react';
import { useSpotifyAuth } from '../hooks/useSpotifyAuth';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  code: string;
  onDone: () => void;
}

export default function SpotifyCallback({ code, onDone }: Props) {
  const { handleCallback } = useSpotifyAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await handleCallback(code);
      if (cancelled) return;
      setStatus(ok ? 'success' : 'error');
      setTimeout(() => onDone(), ok ? 1500 : 3000);
    })();
    return () => { cancelled = true; };
  }, [code, handleCallback, onDone]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-[#1DB954] animate-spin mx-auto" />
            <p className="text-slate-700 font-medium">Connexion a Spotify...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
            <p className="text-slate-700 font-medium">Spotify connecte avec succes !</p>
            <p className="text-sm text-slate-500">Redirection...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-10 h-10 text-red-500 mx-auto" />
            <p className="text-slate-700 font-medium">Erreur de connexion</p>
            <p className="text-sm text-slate-500">Veuillez reessayer.</p>
          </>
        )}
      </div>
    </div>
  );
}
