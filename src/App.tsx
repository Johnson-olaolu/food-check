import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import { checkFood, device, loadClassifier, THRESHOLD, type FoodResult } from './foodCheck';
import './App.css';

type Row = {
  name: string;
  url: string;
  result?: FoodResult;
  error?: string;
};

type Phase = 'loading' | 'ready' | 'error';

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Loading model…');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ accepted: number; total: number } | null>(null);

  const modelReady = phase === 'ready';
  const deviceLabel = device === 'webgpu' ? 'WebGPU' : 'CPU · WASM';

  // Step 3: load the model once, report download progress.
  useEffect(() => {
    loadClassifier((p) => {
      if (p.status === 'progress_total') setProgress(p.progress);
      if (p.status === 'progress') setStatus(`Downloading ${p.file} · ${Math.round(p.progress)}%`);
    })
      .then(() => {
        setPhase('ready');
        setProgress(100);
        setStatus('Model ready, running on your device');
      })
      .catch((err: unknown) => {
        console.error(err);
        setPhase('error');
        setStatus('Model failed to load. Would fall back to the server.');
      });
  }, []);

  // Step 5: read the photos, check each locally, gate the upload.
  async function handleFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0 || busy || !modelReady) return;

    rows.forEach((r) => URL.revokeObjectURL(r.url)); // free the previous batch
    const initial: Row[] = images.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setRows(initial);
    setSummary(null);
    setBusy(true);

    const accepted: File[] = [];
    for (const [i, file] of images.entries()) {
      setStatus(`Checking photo ${i + 1} of ${images.length}…`);
      try {
        const result = await checkFood(file, initial[i].url, modelReady);
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, result } : r)));
        if (result.ok) accepted.push(file);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, error } : r)));
      }
    }

    setSummary({ accepted: accepted.length, total: images.length });
    setStatus('Model ready, running on your device');
    setBusy(false);
    // uploadToBackend(accepted);  // the real app would call your API here
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void handleFiles(Array.from(e.target.files ?? []));
    e.target.value = ''; // allow re-selecting the same photos
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    void handleFiles(Array.from(e.dataTransfer.files));
  }

  const disabled = !modelReady || busy;

  return (
    <main>
      <header>
        <p className="eyebrow">On-device AI demo</p>
        <h1>Is this food?</h1>
        <p className="lede">
          Every photo is checked by a CLIP model running in your browser. Only food photos would be
          sent on to Gemini.
        </p>
      </header>

      <section className={`status-card ${phase}`} aria-live="polite">
        <div className="status-row">
          <span className="dot" />
          <span className="status-text">{status}</span>
          <span className="chip">{deviceLabel}</span>
        </div>
        {phase === 'loading' && (
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </section>

      <label
        className={`dropzone ${dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" accept="image/*" multiple disabled={disabled} onChange={onChange} />
        <span className="dropzone-icon">📷</span>
        <span className="dropzone-title">
          {busy ? 'Checking photos…' : modelReady ? 'Choose photos or drop them here' : 'Waiting for the model…'}
        </span>
        <span className="dropzone-sub">Food is accepted at {Math.round(THRESHOLD * 100)}% confidence or higher</span>
      </label>

      {summary && (
        <section className="summary">
          <span className="summary-count">
            {summary.accepted}
            <small> / {summary.total}</small>
          </span>
          <span>photos would be sent to Gemini</span>
          <span className="summary-saved">
            {summary.total - summary.accepted} filtered out on device
          </span>
        </section>
      )}

      {rows.length > 0 && (
        <section className="results">
          {rows.map((row) => {
            const state = row.error ? 'error' : row.result ? (row.result.ok ? 'ok' : 'rejected') : 'pending';
            const pct = row.result ? Math.round(row.result.confidence * 100) : 0;
            return (
              <figure key={row.url} className={`card ${state}`}>
                <div className="thumb">
                  <img src={row.url} alt={row.name} />
                  <span className="badge">
                    {state === 'ok' && '✓ Food'}
                    {state === 'rejected' && '✕ Not food'}
                    {state === 'error' && '! Error'}
                    {state === 'pending' && 'Checking…'}
                  </span>
                </div>
                <figcaption>
                  {row.error ? (
                    <span className="error-text">{row.error}</span>
                  ) : (
                    <>
                      <div className="score-row">
                        <span className="score">{row.result ? `${pct}%` : '—'}</span>
                        <span className="score-label">food</span>
                      </div>
                      <div className="meter">
                        <div className="meter-fill" style={{ width: `${pct}%` }} />
                        <div className="meter-threshold" style={{ left: `${THRESHOLD * 100}%` }} />
                      </div>
                      <span className="top-label">
                        {row.result ? `Looks like: ${row.result.topLabel}` : row.name}
                      </span>
                    </>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </section>
      )}

      <footer>
        Transformers.js · CLIP ViT-B/32 · nothing leaves this device
      </footer>
    </main>
  );
}
