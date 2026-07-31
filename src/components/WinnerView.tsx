import { Trophy, RotateCcw, X } from 'lucide-react';

interface PlayerScore {
  name: string;
  score: number;
}

interface Props {
  winnerName: string;
  players: PlayerScore[];
  onReset: () => void;
  onClose: () => void;
  isAdmin: boolean;
}

export default function WinnerView({ winnerName, players, onReset, onClose, isAdmin }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="text-center max-w-lg w-full my-8">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 shadow-2xl shadow-amber-500/40 mb-6 animate-bounce">
          <Trophy className="w-12 h-12 text-white" strokeWidth={2.5} />
        </div>
        <p className="text-amber-400 font-semibold tracking-widest text-sm uppercase mb-2">Partie terminee</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">{winnerName}</h1>
        <p className="text-slate-300 text-xl mb-8">remporte la partie</p>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 mb-8 text-left">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Classement</p>
          <div className="space-y-2">
            {sorted.map((p, idx) => (
              <div
                key={p.name + idx}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${idx === 0 ? 'bg-amber-500/20' : ''}`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  idx === 0 ? 'bg-amber-400 text-slate-900' :
                  idx === 1 ? 'bg-slate-300 text-slate-700' :
                  idx === 2 ? 'bg-orange-300 text-orange-800' :
                  'bg-slate-600 text-slate-300'
                }`}>
                  {idx + 1}
                </span>
                <span className={`flex-1 truncate ${idx === 0 ? 'text-white font-bold' : 'text-slate-200'}`}>
                  {p.name}
                </span>
                <span className={`font-bold text-lg ${idx === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {p.score} pt{p.score > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onReset}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 font-semibold rounded-lg hover:bg-amber-300 transition"
            >
              <RotateCcw className="w-5 h-5" /> Nouvelle partie
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition"
            >
              <X className="w-5 h-5" /> Reinitialiser (joueurs exclus)
            </button>
          </div>
        )}
        {!isAdmin && (
          <p className="text-slate-400 text-sm mt-4">En attente de l'administrateur...</p>
        )}
      </div>
    </div>
  );
}
