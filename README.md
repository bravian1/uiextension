# Gemini Screen Scribe

A Chrome extension that records your screen and voice, lets you draw annotations on any tab, and sends the multimodal recording to a **Google Cloud Run** backend to generate AI-powered coding prompts via Gemini.

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com).

## Features

- **Edit & Fix mode** — Record a bug or UI issue, narrate what you want changed, annotate with freehand drawing. Gemini returns a structured code fix with explanation.
- **Inspire mode** — Record a website you love. Gemini reverse-engineers the design and produces a detailed prompt you can paste into any AI coding tool to recreate it.
- **Server-side API key** — No API key required from the user. All Gemini calls go through a Cloud Run backend.
- **Prompt history** — Every generated prompt is saved to Firestore and shown in the extension popup, persisted across sessions.
- **Shadow DOM overlay** — Freehand drawing canvas injected into any tab without CSS conflicts, powered by `perfect-freehand`.

## Architecture

```
Chrome Extension (dist/)
  └─ POST /process-video  ──▶  Cloud Run (Node.js + Hono)
                                   ├─ calls Gemini API (server-side key)
                                   └─ saves prompt to Firestore
                                        └─ sessions/{sessionId}/prompts

Chrome Extension (popup)
  └─ GET /history/{sessionId}  ──▶  Cloud Run  ──▶  Firestore
```

**Google Cloud services used:**
- **Cloud Run** — hosts the backend, holds the Gemini API key securely
- **Firestore** — stores prompt history per anonymous session

## Local Development

### Extension

```bash
npm install
npm run build       # outputs to dist/
```

Load in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

### Backend

```bash
cd backend
npm install
GEMINI_API_KEY=your_key npm run dev    # runs on http://localhost:8080
```

Set the local backend URL before building the extension:
```bash
# .env
VITE_BACKEND_URL=http://localhost:8080
```

## Deployment

See [deploy.md](./deploy.md) for the full step-by-step guide covering Cloud Run, Firestore setup, and Chrome Web Store submission.

## Tech stack

| Layer | Tech |
|---|---|
| Extension UI | React 19 + TypeScript + Tailwind CSS |
| Extension build | Vite + CRXJS |
| Drawing overlay | `perfect-freehand` in a Shadow DOM |
| Backend | Node.js 20 + Hono + TypeScript |
| AI | Gemini (`gemini-flash-latest`) via `@google/genai` |
| Hosting | Google Cloud Run |
| History storage | Google Firestore |
