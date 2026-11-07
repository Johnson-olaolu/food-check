import { useEffect, useState, type ChangeEvent } from 'react';
import { checkFood, device, loadClassifier, THRESHOLD, type FoodResult } from './foodCheck';
import './App.css';

type Row = {
  name: string;
  url: string;
  result?: FoodResult;
  error?: string;
};

export default function App() {
  const [status, setStatus] = useState('Loading model…');
  const [modelReady, setModelReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // Step 3: load the model once, report download progress.
  useEffect(() => {
    loadClassifier((p) => {
      if (p.status === 'progress') {
        setStatus(`Downloading ${p.file}: ${Math.round(p.progress)}%`);
      }
    })
      .then(() => {
        setModelReady(true);
        setStatus(`Model ready, running on your device (${device === 'webgpu' ? 'WebGPU' : 'CPU / WASM'})`);
      })
      .catch((err: unknown) => {
        console.error(err);
        setStatus('Model failed to load. Would fall back to the server.');
      });
  }, []);

  // Step 5: read the photos, check each locally, gate the upload.
  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    rows.forEach((r) => URL.revokeObjectURL(r.url)); // free the previous batch
    const initial: Row[] = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setRows(initial);
    setBusy(true);

    const accepted: File[] = [];
    for (const [i, file] of files.entries()) {
      setStatus(`Checking ${i + 1} of ${files.length}…`);
      try {
        const result = await checkFood(file, initial[i].url, modelReady);
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, result } : r)));
        if (result.ok) accepted.push(file);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, error } : r)));
      }
    }

    setStatus(`${accepted.length} of ${files.length} photos would be sent to Gemini`);
    setBusy(false);
    e.target.value = ''; // allow re-selecting the same photos
    // uploadToBackend(accepted);  // the real app would call your API here
  }

  return (
    <main>
      <h1>Is this food?</h1>
      <input type="file" accept="image/*" multiple disabled={!modelReady || busy} onChange={onChange} />
      <p className="status">{status}</p>
      <p className="hint">Threshold: {Math.round(THRESHOLD * 100)}% food</p>

      <div className="results">
        {rows.map((row) => (
          <figure key={row.url} className={row.result ? (row.result.ok ? 'ok' : 'rejected') : ''}>
            <img src={row.url} alt={row.name} />
            <figcaption>
              {row.error ? (
                <>⚠️ {row.error}</>
              ) : row.result ? (
                <>
                  <strong>
                    {row.result.ok ? '✅' : '❌'} {(row.result.confidence * 100).toFixed(0)}% food
                  </strong>
                  <span>looks like: {row.result.topLabel}</span>
                </>
              ) : (
                <>Checking…</>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
