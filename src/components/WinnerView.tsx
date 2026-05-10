import { Trophy, RotateCcw, X } from 'lucide-react';

interface Props {
  winnerName: string;
  onReset: () => void;
  onClose: () => void;
  isAdmin: boolean;
}

export default function WinnerView({ winnerName, onReset, onClose, isAdmin }: Props) {
  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="text-center max-w-lg">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 shadow-2xl shadow-amber-500/40 mb-6 animate-bounce">
          <Trophy className="w-12 h-12 text-white" strokeWidth={2.5} />
        </div>
        <p className="text-amber-400 font-semibold tracking-widest text-sm uppercase mb-2">Partie terminée</p>
        <h1 className="text-5xl sm:text-6xl font-bold text-white mb-3 tracking-tight">{winnerName}</h1>
        <p className="text-slate-300 text-xl mb-10">remporte la partie</p>
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
              <X className="w-5 h-5" /> Fermer la session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
