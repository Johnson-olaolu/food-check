import {
  pipeline,
  type ProgressInfo,
  type ZeroShotImageClassificationPipeline,
} from '@huggingface/transformers';

// Step 3: load the model. It lives in the browser.
// First load downloads the model; later loads come from the browser cache.
const MODEL_ID = 'Xenova/clip-vit-base-patch32';

// WebGPU when the device has it, otherwise fall back to CPU (WASM).
export const device: 'webgpu' | 'wasm' = 'gpu' in navigator ? 'webgpu' : 'wasm';

let classifierPromise: Promise<ZeroShotImageClassificationPipeline> | null = null;

export function loadClassifier(onProgress?: (p: ProgressInfo) => void) {
  // Module-level singleton so React StrictMode / re-renders never load it twice.
  classifierPromise ??= pipeline('zero-shot-image-classification', MODEL_ID, {
    device,
    progress_callback: onProgress,
  }) as Promise<ZeroShotImageClassificationPipeline>;
  return classifierPromise;
}

// Step 4: the food check. The labels are the design decision:
// every label that isn't food is there to absorb the junk photos.
export const LABELS = [
  'food',
  'a person',
  'a room or event venue',
  'a document or screenshot',
  'something else',
];
export const THRESHOLD = 0.6;

export type FoodResult = {
  ok: boolean;
  confidence: number;
  source: 'local' | 'server';
  topLabel: string;
};

export async function isFood(imageUrl: string): Promise<FoodResult> {
  const classifier = await loadClassifier();
  const output = await classifier(imageUrl, LABELS, {
    hypothesis_template: 'a photo of {}',
  });
  const results = Array.isArray(output[0]) ? output[0] : output;
  const scores = results as { label: string; score: number }[];
  const food = scores.find((o) => o.label === 'food')!;
  const top = scores.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    ok: food.score >= THRESHOLD,
    confidence: food.score,
    source: 'local',
    topLabel: top.label,
  };
}

// Step 7 (optional): "Local when you can".
// If the model hasn't finished loading, or the user declined the download,
// fall back to a server endpoint instead.
export async function checkFood(
  file: File,
  imageUrl: string,
  modelReady: boolean,
): Promise<FoodResult> {
  if (modelReady) return isFood(imageUrl);
  return isFoodOnServer(file);
}

// fallback: lightweight server model
async function isFoodOnServer(_file: File): Promise<FoodResult> {
  // const body = new FormData();
  // body.append('image', _file);
  // const res = await fetch('/api/is-food', { method: 'POST', body });
  // return { ...(await res.json()), source: 'server' };
  throw new Error('Server fallback not implemented: this is where /api/is-food would go');
}
