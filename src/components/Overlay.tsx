import React, { useEffect, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';

// We need an isolated tailwind build or pure css for this shadow dom 
// For simplicity in the extension content script, we'll use inline styles 
// combined with a minimal CSS string injected into the shadow root.

export const shadowCss = `
  #gemini-draw-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none; /* Let clicks pass through when not drawing */
    z-index: 2147483647; /* Max z-index */
  }
  #gemini-draw-container.drawing-active {
    pointer-events: auto; /* Capture draw events */
  }
  .toolbar {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    background: #111827;
    padding: 8px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    border: 1px solid #374151;
    pointer-events: auto;
    font-family: system-ui, sans-serif;
  }
  .tool-btn {
    background: transparent;
    border: none;
    color: #9CA3AF;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }
  .tool-btn:hover { background: #374151; color: white; }
  .tool-btn.active { background: #7C3AED; color: white; }
  .tool-btn.danger { color: #EF4444; }
  .tool-btn.danger:hover { background: #fee2e2; color: #DC2626; }
  .tool-btn.primary { background: #10B981; color: white; display: flex; align-items: center; gap: 6px; }
  .tool-btn.primary:hover { background: #059669; }
  
  .processing-toast {
    position: absolute;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #1F2937;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 500;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    pointer-events: auto;
    font-family: system-ui, sans-serif;
  }

  .scroll-disabled-toast {
    position: absolute;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #7C3AED;
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
    pointer-events: none;
    font-family: system-ui, sans-serif;
    white-space: nowrap;
  }
  
  .result-modal {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #111827;
    width: 600px;
    max-width: 90vw;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    border: 1px solid #374151;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 80vh;
    font-family: system-ui, sans-serif;
  }
  
  .result-textarea {
    width: 100%;
    height: 300px;
    background: #1F2937;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 12px;
    color: #E5E7EB;
    font-family: monospace;
    font-size: 14px;
    resize: vertical;
    outline: none;
  }
  .result-textarea:focus { border-color: #8B5CF6; }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
`;

export default function Overlay() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [paths, setPaths] = useState<number[][][]>([]);
  const [currentPath, setCurrentPath] = useState<number[][]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultPrompt, setResultPrompt] = useState<string | null>(null);

  // Function to convert perfect-freehand stroke points to SVG path data
  const getSvgPathFromStroke = (stroke: number[][]) => {
    if (!stroke.length) return '';
    const d = stroke.reduce(
      (acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      },
      ['M', ...stroke[0], 'Q']
    );
    d.push('Z');
    return d.join(' ');
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setCurrentPath([[e.clientX, e.clientY, e.pressure]]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingMode || e.buttons !== 1) return;
    setCurrentPath((c) => [...c, [e.clientX, e.clientY, e.pressure]]);
  };

  const handlePointerUp = () => {
    if (!isDrawingMode) return;
    setPaths((p) => [...p, currentPath]);
    setCurrentPath([]);
  };

  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg.type === 'toggle-drawing-mode') {
        setIsDrawingMode(msg.active);
        setIsRecording(msg.active);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Block scrolling while drawing mode is active
  useEffect(() => {
    if (!isDrawingMode) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isDrawingMode]);

  const handleStopRecording = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setIsRecording(false);
    setIsDrawingMode(false);
    chrome.runtime.sendMessage({ type: 'stop-recording' }, (response) => {
       setIsProcessing(false);
       if (response?.success && response.prompt) {
         setResultPrompt(response.prompt);
       } else {
         alert('Failed to generate prompt: ' + (response?.error || 'Unknown error'));
       }
    });
  };

  const copyToClipboard = () => {
    if (resultPrompt) {
      navigator.clipboard.writeText(resultPrompt);
      alert("Copied to clipboard!");
    }
  };

  return (
    <div 
      id="gemini-draw-container" 
      className={isDrawingMode ? 'drawing-active' : ''}
    >
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {paths.map((path, i) => (
          <path
            key={i}
            d={getSvgPathFromStroke(getStroke(path, { size: 8, thinning: 0.5, smoothing: 0.5, streamline: 0.5 }))}
            fill="#8B5CF6"
          />
        ))}
        {currentPath.length > 0 && (
          <path
            d={getSvgPathFromStroke(getStroke(currentPath, { size: 8, thinning: 0.5, smoothing: 0.5, streamline: 0.5 }))}
            fill="#8B5CF6"
          />
        )}
      </svg>

      {/* Scroll-disabled toast */}
      {isDrawingMode && (
        <div className="scroll-disabled-toast">
          🔒 Scroll disabled while drawing — toggle Draw off to scroll
        </div>
      )}

      {/* Floating Toolbar inside the overlay */}
      {isRecording && !isProcessing && !resultPrompt && (
        <div className="toolbar">
          <button 
            className={`tool-btn ${isDrawingMode ? 'active' : ''}`}
            onClick={() => setIsDrawingMode(!isDrawingMode)}
          >
            {isDrawingMode ? 'Drawing On' : 'Draw'}
          </button>
          <button 
            className="tool-btn danger"
            onClick={() => { setPaths([]); setCurrentPath([]); }}
          >
            Clear
          </button>
          <div style={{ width: '1px', background: '#374151', margin: '0 4px' }} />
          <button 
            className="tool-btn primary"
            onClick={handleStopRecording}
          >
            <span style={{ width: 8, height: 8, background: 'white', borderRadius: '50%', display: 'inline-block' }}></span>
            Stop & Generate
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="processing-toast">
          ✨ Gemini is analyzing your recording...
        </div>
      )}

      {resultPrompt && (
        <div className="result-modal">
          <h2 style={{ margin: 0, color: '#F9FAFB', fontSize: '18px' }}>Generated Prompt</h2>
          <textarea 
            className="result-textarea" 
            readOnly 
            value={resultPrompt} 
          />
          <div className="modal-actions">
            <button className="tool-btn" onClick={() => { setResultPrompt(null); setPaths([]); }}>Close</button>
            <button className="tool-btn primary" onClick={copyToClipboard}>Copy to Clipboard</button>
          </div>
        </div>
      )}
    </div>
  );
}
