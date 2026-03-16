// Backend URL — set VITE_BACKEND_URL in .env for production Cloud Run endpoint
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export async function processVideoWithBackend(
  videoBase64: string,
  mode: 'edit' | 'inspire',
  sessionId: string
): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/process-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoBase64, mimeType: 'video/webm', mode, sessionId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `Backend error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.prompt) throw new Error('No prompt returned from backend');
  return data.prompt;
}

export async function fetchHistory(sessionId: string): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/history/${sessionId}`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.prompts ?? [];
}
