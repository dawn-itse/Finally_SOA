import { parseDish } from '../../../shared/dishText.mjs';

export async function resolveDish(text, source, signal) {
  try {
    const response = await fetch('/api/v1/nlp/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(3000)])
    });
    if ([400, 413, 422].includes(response.status)) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.success || typeof payload.data?.dish !== 'string') throw new Error('Invalid NLP response');
    return payload.data;
  } catch {
    return signal.aborted ? null : parseDish(text, source);
  }
}
