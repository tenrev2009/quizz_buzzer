import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Zap, CircleUser as UserCircle2, ShieldCheck, LogIn } from 'lucide-react';

type Tab = 'player' | 'admin';

export default function AuthScreen() {
  const { signInAdmin, signUpAdmin, joinAsPlayer } = useAuth();
  const [tab, setTab] = useState<Tab>('player');
  const [adminMode, setAdminMode] = useState<'signin' | 'signup'>('signin');

  // player fields
  const [playerName, setPlayerName] = useState('');
  const [code, setCode] = useState('');

  // admin fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toMsg = (e: unknown): string => {
    if (!e) return 'Erreur inconnue';
    if (e instanceof Error) return e.message;
    if (typeof e === 'object' && e && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
      return (e as { message: string }).message;
    }
    try { return JSON.stringify(e); } catch { return 'Erreur'; }
  };

  const submitPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      await joinAsPlayer(playerName.trim(), code.trim());
    } catch (e: unknown) {
      setErr(toMsg(e));
    } finally { setLoading(false); }
  };

  const submitAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      if (adminMode === 'signin') await signInAdmin(email, password);
      else await signUpAdmin(email, password, displayName || email.split('@')[0]);
    } catch (e: unknown) {
      setErr(toMsg(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Zap className="w-7 h-7 text-slate-900" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">QuizBuzz</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => { setTab('player'); setErr(null); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition ${tab === 'player' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              <UserCircle2 className="w-4 h-4" /> Joueur
            </button>
            <button
              type="button"
              onClick={() => { setTab('admin'); setErr(null); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition ${tab === 'admin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              <ShieldCheck className="w-4 h-4" /> Admin
            </button>
          </div>

          {tab === 'player' ? (
            <form onSubmit={submitPlayer} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Votre nom</label>
                <input
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  required
                  maxLength={24}
                  placeholder="Ex: Alice"
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Code de la partie</label>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  required
                  maxLength={8}
                  placeholder="XXXXXX"
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center tracking-[0.3em] text-xl font-bold uppercase focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-xs text-slate-500 mt-1">Code fourni par l'administrateur</p>
              </div>
              {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{err}</div>}
              <button
                type="submit"
                disabled={loading || !playerName.trim() || code.trim().length < 3}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
              >
                <LogIn className="w-4 h-4" />
                {loading ? '...' : 'Rejoindre la partie'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitAdmin} className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAdminMode('signin')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${adminMode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >Connexion</button>
                <button
                  type="button"
                  onClick={() => setAdminMode('signup')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${adminMode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >Inscription</button>
              </div>
              {adminMode === 'signup' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Nom affiché</label>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                    placeholder="Votre nom"
                    className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="nom@exemple.com"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Au moins 6 caractères"
                />
              </div>
              {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{err}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {loading ? '...' : adminMode === 'signin' ? 'Se connecter' : 'Créer le compte admin'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-400 text-sm mt-6">
          Buzzer temps réel pour quiz live
        </p>
      </div>
    </div>
  );
}
