import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Loader2, Check, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface KeyStatus {
  configured: boolean;
  hint: string | null;
}

export default function AdminSettings() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<KeyStatus>({ configured: false, hint: null });
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // La cle n'est jamais relue : la table n'a pas de policy SELECT. On
  // n'obtient que « configuree ou non » et ses 4 derniers caracteres.
  const refresh = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('anthropic_key_status');
    if (rpcError) {
      setError(`Statut indisponible : ${rpcError.message}`);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setStatus({ configured: row?.configured ?? false, hint: row?.hint ?? null });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    const key = value.trim();
    if (!key) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Ecriture par fonction serveur : un upsert direct devrait relire la
      // ligne pour resoudre le conflit, ce que l'absence de policy SELECT
      // interdit. La fonction determine le proprietaire depuis auth.uid(),
      // l'appelant n'a donc pas a transmettre son identifiant.
      const { error: rpcError } = await supabase.rpc('set_anthropic_key', { p_key: key });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);

      setValue('');
      setNotice('Cle enregistree.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: rpcError } = await supabase.rpc('clear_anthropic_key');
    if (rpcError) setError(rpcError.message);
    else setNotice('Cle supprimee.');
    await refresh();
    setSaving(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50 transition"
      >
        <Settings className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">Parametres</p>
          <p className="text-xs text-slate-500">
            {status.configured
              ? `Cle API Claude enregistree${status.hint ? ` (...${status.hint})` : ''}`
              : 'Aucune cle API Claude — la generation de QCM est indisponible'}
          </p>
        </div>
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${status.configured ? 'bg-green-500' : 'bg-slate-300'}`}
        />
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-4 border-t border-slate-200 space-y-3">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Cle API Claude
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={status.configured ? 'Saisir une nouvelle cle pour remplacer' : 'sk-ant-...'}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm font-mono"
            />
            <button
              onClick={save}
              disabled={saving || !value.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Creez une cle sur console.anthropic.com. Elle est stockee dans votre base et lue
            uniquement par la fonction serveur : elle n'est jamais renvoyee au navigateur,
            meme ici.
          </p>

          {status.configured && (
            <button
              onClick={remove}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Supprimer la cle enregistree
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
              {notice}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
