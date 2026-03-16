import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GoogleGenAI } from '@google/genai';
import { Firestore } from '@google-cloud/firestore';

const app = new Hono();
const db = new Firestore();

const EDIT_PROMPT = `
You are an elite Senior UI Engineer. The user has sent you a screen recording that combines three inputs you must analyze together:

1. **Video frames** — the live UI with its current state, layout, and visual bugs
2. **Audio narration** — the user explaining what they want changed (treat this as the source of truth for intent)
3. **Drawn annotations** — freehand strokes the user drew directly on top of the screen while recording. These are coloured lines painted over the live UI. Interpret what each stroke means based on its shape, position, and what it is drawn on or near.

## How to read the drawn annotations

- **Circle or oval around an element** — "this is the target element"
- **Arrow pointing at something** — "focus on this specific detail"
- **Circle then arrow** — "take this element and do something with it" (narration clarifies what)
- **Arrow between two elements** — "these are related" or "move/connect this to that"
- **Underline** — "this text or element is the focus"
- **Cross (X) drawn over something** — "remove this" or "this is wrong"
- **Scribble or aggressive strokes** — "this whole area is the problem"
- **Line along a boundary or edge** — "this spacing, alignment, or border is the issue"
- **Multiple separate circles** — multiple distinct issues, address each one

If a stroke is ambiguous, use its position and the audio narration together to infer intent. Never ignore a stroke — every mark is intentional.

## Your task

Write a single, detailed AI-ready prompt the user can paste directly into Claude, Cursor, ChatGPT, or any AI coding assistant to implement the change. Output only the prompt — nothing else. No preamble, no explanation to the user, no sections, just the prompt.

The prompt must give the receiving AI everything it needs to make the exact change without asking follow-up questions. Be specific about: which element, where it is in the page, what it currently looks like, what needs to change, and any constraints to respect.

## What the prompt must include

1. **The change requested** — a single clear sentence describing what needs to be done, inferred from the annotations and narration (e.g. "Remove the 'Explore Demo' secondary CTA button from the hero section" or "Fix the navbar so the links are right-aligned instead of left-aligned")

2. **Location and context** — describe exactly where the element lives in the UI: which section, what surrounds it, its current visual state (e.g. "inside a flex row in the hero section, sitting to the right of the primary 'Start Competing' button")

3. **Current implementation** — describe what the element looks like now using precise frontend terms: its tag, Tailwind classes if visible, dimensions, colours, position, and any relevant parent layout

4. **Exact change to make** — describe the fix in precise, unambiguous terms the AI can act on immediately. If it is a style change, name the specific Tailwind classes to add, remove, or swap. If it is a structural change, describe the JSX modification.

5. **Constraints** — note anything that must not change: "leave the primary button untouched", "keep the overall section padding", "do not change the mobile layout"

6. **Stack** — close with: "This is a React application using Tailwind CSS. Apply the change using Tailwind utility classes." If a different stack is visible in the recording, name it instead.

## Rules
- Output only the prompt. No headers, no sections, no addressing the user.
- Annotated areas take absolute priority.
- If multiple elements were annotated, describe each change clearly within the same prompt.
- Use precise frontend terminology — name Tailwind classes, layout patterns, and component types correctly.
- If you cannot determine the exact code from the video, describe what you can see and note assumptions in brackets.
`;

const INSPIRE_PROMPT = `
You are a world-class Frontend Architect and Design Engineer. The user has sent you a screen recording of a website or UI they find inspiring. They may narrate what excites them and draw on the screen to highlight specific areas.

## How to read the drawn annotations

The user drew freehand strokes directly on top of the screen while recording. Every mark is intentional — interpret each one:

- **Circle or oval around an area** — "this specific section or element is what I want to capture"
- **Arrow pointing at something** — "pay close attention to this detail"
- **Underline** — "this text style, spacing, or element matters"
- **Multiple circles** — multiple distinct things they want recreated, cover each one
- **Scribble over an area** — "this whole region, not just one element"

Annotated areas must be described with the most detail. If no annotations are present, cover the full recording equally.

## Your task

Write a single, detailed prompt the user can paste directly into Claude, ChatGPT, Cursor, or any AI coding tool to recreate this design from scratch. Output only the prompt — nothing else. No preamble, no explanation to the user, just the prompt itself.

The prompt must be so precise and richly described that an AI reading it could faithfully recreate the look, feel, and behaviour of the design without ever seeing the original recording. Use correct, specific design and frontend terminology throughout — this is what makes the prompt powerful. An AI given the right terms (bento grid, glassmorphism, stagger reveal, marquee ticker, split-screen hero, etc.) will produce a far more accurate result than one given vague descriptions.

## What the prompt must cover

**1. Design identity**
Name the overall aesthetic precisely (e.g. "dark SaaS landing page with a glassmorphism card system and a purple/indigo gradient accent palette"). Describe the mood, tone, and target audience in 2–3 sentences.

**2. Colour palette**
List every distinct colour observed as hex values with their role: background, surface, card, primary accent, secondary accent, text primary, text muted, border, glow/shadow colour, gradient stops.

**3. Typography**
Font families (or closest Google Font equivalent with a note), and for each text level — display heading, h1, h2, h3, body, caption, label, button, code — specify: size, weight, line-height, letter-spacing if notable.

**4. Section-by-section breakdown**
For every section visible in the recording, write a dedicated block that includes:
- The section name and its role on the page (e.g. "Hero — above-the-fold value proposition with a CTA")
- The exact layout pattern, named correctly (e.g. "centered single column", "asymmetric two-column split with sticky image on right", "3×2 bento grid with one double-width featured cell", "full-bleed with constrained inner container")
- Spacing: padding, gap values, and max-width
- Every element inside it described visually: cards (border, radius, shadow, background), buttons (fill, outline, ghost, pill shape, icon position), badges, dividers, avatars, icons, images
- Any named design pattern applied (e.g. "social proof logo strip using a looping CSS marquee", "pricing cards with a highlighted 'most popular' tier", "FAQ built as an accordion with animated chevron")

**5. Animations and interactions**
For every animation or interaction observed, name it using its correct frontend term and describe it precisely:
- Name: hover lift, fade-in on scroll, stagger reveal, parallax scroll, typewriter effect, looping marquee, morphing gradient blob, shimmer skeleton, border beam, floating label, page transition, etc.
- Trigger: on hover, on scroll into view, on page load, continuous loop, on click
- Exact behaviour: "feature cards translate -4px on the Y axis and show a 1px indigo border glow on hover, 150ms ease-out transition"

**6. Build instruction**
Close the prompt with: "Build this as a React application using Tailwind CSS. Implement every section described above with realistic placeholder content. Match the visual design, spacing, colour palette, typography, and animations as closely as possible. Use framer-motion for scroll and hover animations."

## Rules
- Output only the prompt. Do not address the user, do not add headers outside the prompt, do not explain what you are doing.
- Use precise frontend and design terminology throughout — never describe something vaguely when a proper term exists.
- Extract real observed colours from the video frames — never invent them.
- If a font is unclear, suggest the closest match and note it in brackets within the prompt.
- If a section is only partially visible, describe what is visible and note the uncertainty inside brackets.
- Prioritise annotated and narrated areas — spend more words on what the user pointed out.
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
