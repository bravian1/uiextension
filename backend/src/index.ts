import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GoogleGenAI } from '@google/genai';
import { Firestore } from '@google-cloud/firestore';

const app = new Hono();
const db = new Firestore();

const EDIT_PROMPT = `
You are an elite Senior UI Engineer acting as a pair programmer. The user has sent you a screen recording that combines three inputs you must analyze together:

1. **Video frames** — the live UI with its current state, layout, and visual bugs
2. **Audio narration** — the user explaining what they want changed (treat this as the source of truth for intent)
3. **Drawn annotations** — freehand strokes on the screen that act as visual pointers. Circles or scribbles highlight the exact elements that need fixing.

## Your task
Identify what is broken or needs changing, then output a complete, actionable fix.

## Output format (follow this exactly)

### 🎯 What I understood
One or two sentences summarising what the user wants based on their narration and annotations. If audio was unclear or absent, say so and infer from the visual context.

### 🔍 Root cause
Briefly explain why the current UI looks or behaves the way it does (wrong Tailwind class, missing flex property, incorrect z-index, etc.).

### ✅ The fix

\`\`\`tsx
// Paste the relevant component or section with the fix applied.
// Show the full component if it is short, or the specific JSX block if it is long.
// Use React + Tailwind CSS unless the user's stack is visibly different.
\`\`\`

### 💡 Why this works
Two to four sentences explaining the change so the user learns from it, not just copies it.

### ⚠️ Watch out for
Call out any side effects, accessibility concerns, or edge cases the fix might introduce. Skip this section if there are none.

## Rules
- Prioritise the annotated areas over everything else on screen.
- If multiple issues are annotated, address each one with its own "The fix" block.
- Never rewrite code that was not part of the problem.
- Default to Tailwind CSS utility classes. Only write raw CSS if Tailwind cannot express it.
- If you cannot confidently determine the component's full code from the video, note what you assumed and mark assumptions with a comment.
`;

const INSPIRE_PROMPT = `
You are a world-class Frontend Architect and Design Engineer. The user has sent you a screen recording of a website or UI they find inspiring. They may narrate what excites them and draw on the screen to highlight specific areas.

## Your task
Analyze the recording and write a single, detailed AI prompt that the user can paste directly into an AI coding assistant (Claude, ChatGPT, Cursor, etc.) to recreate this design from scratch. You are writing a prompt for another AI — not writing code yourself.

The prompt you write must be so detailed and precise that an AI reading it could faithfully recreate the look and feel of the site without ever seeing the original. Cover everything: layout, colours, typography, spacing, components, animations, and overall vibe. Focus especially on the areas the user annotated or narrated about.

## Output format

Start with a one-sentence summary for the user (e.g. "Here is your Inspire prompt based on the [site name / design style] you recorded:"), then output the prompt inside a plain markdown code block so the user can copy it cleanly.

The prompt itself must include:

1. **Overall design style** — name the aesthetic (e.g. minimal SaaS, glassmorphism, editorial, neubrutalism, dark luxury) and describe the mood and tone in 2–3 sentences.

2. **Colour palette** — list every distinct colour observed as hex values with their role (background, surface, primary accent, text, border, etc.).

3. **Typography** — font families (or closest Google Font equivalents), sizes, weights, and line-height patterns for headings, body, labels, and captions.

4. **Layout & spacing** — describe the grid system, max-width container, section padding rhythm, and alignment patterns. Note any asymmetry or intentional whitespace.

5. **Key sections & components** — describe each major section or component visible (hero, navbar, feature grid, cards, CTA, footer, etc.) in terms of structure, spacing, and visual treatment. Be specific: "a 3-column card grid with 24px gap, each card has a 1px border, 12px radius, subtle box shadow, and an icon in the top-left corner."

6. **Animations & interactions** — describe hover states, transitions, scroll effects, and micro-interactions observed. Be specific about speed and easing where visible (e.g. "buttons scale to 1.03 on hover with a 150ms ease-out transition").

7. **Recreate instructions** — close the prompt with a clear instruction like: "Build this as a React application using Tailwind CSS. Recreate the full landing page with realistic placeholder content. Match the visual design as closely as possible."

## Rules
- Write the prompt in second person, addressed to an AI assistant ("Build...", "Use...", "The design should...").
- Extract real observed colours — do not invent them.
- Prioritise areas the user annotated or narrated about.
- If something is unclear from the video, make a reasonable inference and note it inside brackets e.g. [font appears to be Inter or similar sans-serif].
- The prompt should be thorough enough that no follow-up questions are needed.
`;

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/process-video', async (c) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'Server misconfigured: missing GEMINI_API_KEY' }, 500);
  }

  let body: { videoBase64?: string; mimeType?: string; mode?: string; sessionId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { videoBase64, mimeType = 'video/webm', mode = 'edit', sessionId } = body;

  if (!videoBase64) return c.json({ error: 'Missing required field: videoBase64' }, 400);
  if (mode !== 'edit' && mode !== 'inspire') return c.json({ error: 'Invalid mode: must be "edit" or "inspire"' }, 400);

  // Strip data URL prefix if present ("data:video/webm;base64,...")
  const base64Data = videoBase64.includes(',') ? videoBase64.split(',')[1] : videoBase64;

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = mode === 'edit' ? EDIT_PROMPT : INSPIRE_PROMPT;

  let prompt: string;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Here is the screen recording. Please analyze it according to your instructions.' },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
      config: { systemInstruction, temperature: 0.2 },
    });
    prompt = response.text ?? '';
  } catch (err: any) {
    console.error('Gemini API error:', err);
    return c.json({ error: err.message || 'Gemini API call failed' }, 502);
  }

  // Save to Firestore if sessionId provided
  if (sessionId) {
    try {
      await db
        .collection('sessions')
        .doc(sessionId)
        .collection('prompts')
        .add({ prompt, mode, timestamp: Date.now() });
    } catch (err) {
      // Non-fatal — log but still return the prompt to the user
      console.error('Firestore write error:', err);
    }
  }

  return c.json({ prompt });
});

app.get('/history/:sessionId', async (c) => {
  const { sessionId } = c.req.param();

  try {
    const snapshot = await db
      .collection('sessions')
      .doc(sessionId)
      .collection('prompts')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const prompts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return c.json({ prompts });
  } catch (err: any) {
    console.error('Firestore read error:', err);
    return c.json({ error: 'Failed to fetch history' }, 500);
  }
});

const port = parseInt(process.env.PORT ?? '8080', 10);
console.log(`Server running on port ${port}`);
serve({ fetch: app.fetch, port });
