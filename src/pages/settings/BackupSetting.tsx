import { useRef, useState } from 'react';
import { exportData, importData } from '../../lib/backup';
import { useCloud } from '../../lib/cloud';

/** Réglages → Sauvegarde : export / import d'un fichier JSON. */
export function BackupSetting() {
  const [msg, setMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const signedIn = !!useCloud().user;

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    if (!confirm('Remplacer toutes tes réponses et classements actuels par cette sauvegarde ?')) return;
    try {
      const n = await importData(file);
      setMsg(`✓ ${n} réponses restaurées.`);
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  return (
    <section className="card">
      <h3>💾 Sauvegarde</h3>
      <p className="muted small">
        {signedIn
          ? 'Tes données sont synchronisées avec ton compte. Tu peux quand même en garder une copie dans un fichier.'
          : 'Sans compte, tes données ne sont stockées que dans ce navigateur. Exporte-les régulièrement.'}
      </p>
      <div className="row">
        <button className="btn" onClick={() => exportData()} title="Télécharger un fichier avec tes réponses et classements">
          Exporter
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()} title="Restaurer une sauvegarde (remplace les données actuelles)">
          Importer
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
      </div>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
