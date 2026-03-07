# Gemini Screen Scribe Chrome Extension

A Chrome extension that records your screen, captures your voice, and uses Gemini to turn visual/audio feedback into high-quality AI prompts for coding.

## Features
- **Dual Mode UI**: 'Edit & Fix' vs. 'Inspire' workflows built into a premium Tailwind CSS popup.
- **Multimodal Gemini Integration**: Automatically processes the video payload through the `@google/genai` multimodal SDK to generate structural developer code or AI instructions.
- **Custom Shadow DOM Overlay**: A lightweight floating canvas (`perfect-freehand`) injected perfectly into the active tab without causing CSS conflicts on the host page.
- **Offscreen Engine**: Required by Manifest V3 to bypass the service-worker media capture limitations. Handles screen rendering and microphone processing.

## How to Test Locally on Chrome

Because this extension uses `chrome.desktopCapture`, it must be tested natively in your browser.

1. **Build the extension**:
   Ensure you have installed dependencies and built the project.
   ```bash
   npm install
   npm run build
   ```
   This will compile the extension and create a `dist` folder.

2. **Load the Unpacked Extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** using the toggle in the top right corner.
   - Click the **Load unpacked** button in the top left.
   - Select the **`dist`** folder located inside this project directory (`/home/brav/Documents/code/uiextension/dist`).

3. **Configure & Use**:
   - Click the new extension icon (Screen Scribe) near your URL bar.
   - Paste your Gemini API key into the settings field (A Gemini 3 Flash key is recommended).
   - Choose an analysis mode ("Edit & Fix" or "Inspire"), click **Start Screen Scribe**, and start annotating!
   - When finished, click **Stop & Generate Prompt** in the popup to send the recording to Gemini.

## Development

This project was built with:
- React + TypeScript
- Vite + CRXJS (for active content-script Hot Module Replacement)
- TailwindCSS v3
- `@google/genai` Multimodal SDK
