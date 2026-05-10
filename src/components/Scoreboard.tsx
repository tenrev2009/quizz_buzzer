import { Trophy, Target } from 'lucide-react';
import type { SessionPlayer, Profile } from '../types';

interface Props {
  players: (SessionPlayer & { profile?: Profile })[];
  target: number;
  highlightId?: string | null;
}

export default function Scoreboard({ players, target, highlightId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" /> Classement
        </h3>
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Target className="w-3.5 h-3.5" /> Objectif {target} pts
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {sorted.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">Aucun joueur</div>
        )}
        {sorted.map((p, idx) => {
          const pct = Math.min(100, (p.score / target) * 100);
          const hl = highlightId === p.player_id;
          return (
            <div key={p.id} className={`px-5 py-3 flex items-center gap-3 transition ${hl ? 'bg-amber-50' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-600'}`}>
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{p.profile?.display_name ?? 'Joueur'}</div>
                <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">{p.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
