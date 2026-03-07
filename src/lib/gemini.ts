import { GoogleGenAI } from '@google/genai';

export const EDIT_PROMPT = `
You are an expert Senior UI/UX Engineer and Frontend Developer. 
The user is providing a screen recording of an interface. They are narrating their desired changes and drawing on the screen to point out specific bugs or UI modifications.

Your job is to act as their pair programmer. 
Analyze the video, listen to the audio, and look at the drawn annotations.
Output a highly structured set of instructions or code snippets (React/Tailwind preferred) that directly solves the user's request.
Be concise, focus on the code, and explain *why* you are making the change.
`;

export const INSPIRE_PROMPT = `
You are a world-class Frontend Architect and UI Designer.
The user is providing a screen recording of a website they find inspiring. They might narrate what they like about it or draw to highlight specific animations, layouts, or components.

Your job is to reverse-engineer the "vibe" and structure of what they are showing you.
Analyze the video to understand the layout (CSS Grid/Flexbox), the color palette, typography choices, and animations.
Output a clear breakdown of how to build this in modern React and Tailwind CSS. Provide foundational code snippets to recreate the visual aesthetic they are pointing out.
`;

export async function processVideoWithGemini(
  apiKey: string, 
  videoBase64: string, 
  mode: 'edit' | 'inspire'
) {
  // Convert base64 data URL to a File or Blob that the SDK can use
  // The structure is typically "data:video/webm;base64,......."
  const base64Data = videoBase64.split(',')[1];
  if (!base64Data) throw new Error("Invalid video data");

  // Run this in background script where we have fetch access without CORS 
  // issues and can use the new SDK properly.
  const ai = new GoogleGenAI({ apiKey });

  // For the new @google/genai SDK, we typically upload the file first if it's large, 
  // or pass it inline if supported. We'll use the inline base64 method for simplicity 
  // in this proof-of-concept, assuming the video is short.
  
  const systemInstruction = mode === 'edit' ? EDIT_PROMPT : INSPIRE_PROMPT;

  const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
           role: 'user',
           parts: [
             { text: "Here is the screen recording. Please analyze it according to your instructions." },
             {
               inlineData: {
                 mimeType: "video/webm",
                 data: base64Data
               }
             }
           ]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2, // Low temp for more precise code generation
      }
  });

  return response.text;
}
