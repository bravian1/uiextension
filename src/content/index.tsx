// React imported implicitly by vite
import { createRoot } from 'react-dom/client';
import Overlay, { shadowCss } from '../components/Overlay';

console.log('Gemini Screen Scribe content script loaded');

// 1. Create a container div that will host our Shadow DOM
const container = document.createElement('div');
container.id = 'gemini-screen-scribe-root';
// Ensure it sits on top of everything and doesn't affect page layout
container.style.position = 'fixed';
container.style.top = '0';
container.style.left = '0';
container.style.width = '100vw';
container.style.height = '100vh';
container.style.pointerEvents = 'none';
container.style.zIndex = '2147483647';
document.body.appendChild(container);

// 2. Attach a shadow root to completely isolate our CSS and DOM from the host page
const shadow = container.attachShadow({ mode: 'open' });

// 3. Inject our minimal custom styles for the drawing layer
const styleElement = document.createElement('style');
styleElement.textContent = shadowCss;
shadow.appendChild(styleElement);

// 4. Create a mount point inside the shadow root and render React
const renderRoot = document.createElement('div');
shadow.appendChild(renderRoot);
const root = createRoot(renderRoot);
root.render(<Overlay />);
