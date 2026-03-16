import React, { useState } from 'react';
import { Image as ImageIcon, Code2, Video, Pencil, Clock, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchHistory } from '../lib/gemini';
import '../styles/globals.css';

type Mode = 'edit' | 'inspire';

export interface HistoryItem {
  id: string;
  prompt: string;
  mode: string;
  timestamp: number;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('edit');
  const [isRecording, setIsRecording] = useState(false);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultPrompt, setResultPrompt] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // When popup opens, check recording state and load history from backend
  React.useEffect(() => {
    chrome.storage.session.get(['isRecording', 'recordingMode'], (result) => {
      setIsRecording(!!result.isRecording);
      if (result.recordingMode) setMode(result.recordingMode as Mode);
    });
    chrome.storage.local.get(['sessionId'], async (result) => {
      if (result.sessionId) {
        const prompts = await fetchHistory(result.sessionId as string);
        setHistory(prompts as HistoryItem[]);
      }
    });
  }, []);

  const handleToggleRecording = async () => {
    setErrorMsg('');

    if (isRecording) {
      setIsRecording(false);
      setIsProcessing(true);
      chrome.storage.session.set({ isRecording: false });
      
      try {
          const response = await chrome.runtime.sendMessage({
              type: 'stop-recording',
              mode: mode,
          });
          
          if (response?.success && response.prompt) {
            setResultPrompt(response.prompt);
            // Reload history from backend to show the newest item
            chrome.storage.local.get(['sessionId'], async (res) => {
              if (res.sessionId) {
                const prompts = await fetchHistory(res.sessionId as string);
                setHistory(prompts as HistoryItem[]);
              }
            });
          } else {
            setErrorMsg(response?.error || 'Failed to generate prompt.');
          }
      } catch (err: any) {
          setErrorMsg(err.message || "An error occurred");
      } finally {
          setIsProcessing(false);
      }
      
    } else {
      setIsRecording(true);
      setResultPrompt('');
      chrome.storage.session.set({ isRecording: true, recordingMode: mode });
      const response = await chrome.runtime.sendMessage({ type: 'start-recording' });
      if (!response?.success) {
        setIsRecording(false);
        chrome.storage.session.set({ isRecording: false });
        setErrorMsg(response?.error || 'Failed to start recording');
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
  };

  const clearHistory = () => {
    if (confirm("Are you sure you want to clear your prompt history?")) {
      setHistory([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-900 text-slate-200 relative overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-dark-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-sky-600 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-sky-400">
            Screen Scribe
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
        
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
            {errorMsg}
          </div>
        )}

        {/* Result Area */}
        {resultPrompt ? (
          <section className="flex flex-col gap-2 h-full">
            <h2 className="text-sm font-medium text-slate-400 flex justify-between items-center">
              Generated Prompt
              <button 
                onClick={() => copyToClipboard(resultPrompt)}
                className="text-primary-400 hover:text-primary-300 transition-colors text-xs font-medium"
              >
                Copy
              </button>
            </h2>
            <textarea 
              readOnly
              value={resultPrompt}
              className="flex-1 bg-dark-800/50 border border-dark-600 rounded-lg p-3 text-xs md:text-sm font-mono text-slate-300 focus:outline-none resize-none min-h-[150px]"
            />
            <button
               onClick={() => setResultPrompt('')}
               className="mt-2 text-xs text-slate-500 hover:text-slate-300 text-center py-2"
            >
               ← Back to Recording
            </button>
          </section>
        ) : (
          <>
            {/* Mode Selector */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Select Mode</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('edit')}
                  className={`flex flex-col p-4 rounded-xl border transition-all ${
                    mode === 'edit'
                      ? 'border-primary-500 bg-primary-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                      : 'border-dark-800 bg-dark-800/50 hover:bg-dark-800 hover:border-dark-600'
                  }`}
                >
                  <Code2 className={`w-6 h-6 mb-2 ${mode === 'edit' ? 'text-primary-400' : 'text-slate-500'}`} />
                  <span className="font-medium text-left">Edit & Fix</span>
                  <span className="text-xs text-slate-500 text-left mt-1 line-clamp-2">Describe bugs & UI changes.</span>
                </button>

                <button
                  onClick={() => setMode('inspire')}
                  className={`flex flex-col p-4 rounded-xl border transition-all ${
                    mode === 'inspire'
                      ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                      : 'border-dark-800 bg-dark-800/50 hover:bg-dark-800 hover:border-dark-600'
                  }`}
                >
                  <ImageIcon className={`w-6 h-6 mb-2 ${mode === 'inspire' ? 'text-sky-400' : 'text-slate-500'}`} />
                  <span className="font-medium text-left">Inspire</span>
                  <span className="text-xs text-slate-500 text-left mt-1 line-clamp-2">Clone a website's vibe.</span>
                </button>
              </div>
            </section>

            {/* Info */}
             <div className="bg-dark-800/50 border border-dark-800 rounded-xl p-4 flex gap-3 text-sm text-slate-400">
               <Pencil className="w-5 h-5 shrink-0 text-primary-400/70" />
               <p>
                 {mode === 'edit' 
                  ? "We'll suggest specific code fixes based on your drawing and narration." 
                  : "We'll break down the design system and provide Tailwind structural code."}
               </p>
             </div>

             {/* History Section */}
             {history.length > 0 && (
                <section className="space-y-3 mt-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                       <Clock className="w-4 h-4" /> History
                    </h2>
                    <button onClick={clearHistory} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
                       Clear
                    </button>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {history.map((item) => {
                       const isExpanded = expandedHistoryId === item.id;
                       const date = new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                       
                       return (
                         <div key={item.id} className="bg-dark-800/50 border border-dark-700 rounded-lg overflow-hidden transition-all">
                           <div 
                             onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                             className="flex items-center justify-between p-3 cursor-pointer hover:bg-dark-800 transition-colors"
                           >
                              <div className="flex flex-col gap-1 overflow-hidden">
                                 <span className="text-xs font-medium text-slate-300 flex items-center gap-2">
                                    {item.mode === 'edit' ? <Code2 className="w-3 h-3 text-primary-400" /> : <ImageIcon className="w-3 h-3 text-sky-400" />}
                                    {item.mode === 'edit' ? 'Edit & Fix' : 'Inspire'} 
                                    <span className="text-slate-500">• {date}</span>
                                 </span>
                                 <span className="text-xs text-slate-500 truncate w-full">
                                    {item.prompt.substring(0, 60)}...
                                 </span>
                              </div>
                              <div className="shrink-0 text-slate-500">
                                 {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </div>
                           </div>
                           
                           {isExpanded && (
                             <div className="p-3 border-t border-dark-700 bg-dark-900/50 flex flex-col gap-2">
                                <textarea 
                                  readOnly
                                  value={item.prompt}
                                  className="w-full bg-dark-800 border border-dark-600 rounded p-2 text-xs font-mono text-slate-300 min-h-[100px] resize-y"
                                />
                                <button 
                                  onClick={() => copyToClipboard(item.prompt)}
                                  className="self-end flex items-center gap-1 text-xs font-medium text-primary-400 hover:text-primary-300"
                                >
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                             </div>
                           )}
                         </div>
                       );
                    })}
                  </div>
                </section>
             )}
          </>
        )}
      </main>

      {/* Footer / CTA */}
      <footer className="p-5 border-t border-dark-800 bg-dark-900 shrink-0">
        <button
          onClick={handleToggleRecording}
          disabled={isProcessing}
          className={`w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            isProcessing
               ? 'bg-dark-700 text-slate-400 cursor-wait'
               : isRecording
                  ? 'bg-red-500 text-white animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                  : resultPrompt 
                      ? 'bg-dark-800 hover:bg-dark-700 text-slate-300' // Hidden essentially, replaced by 'Back' above, but keeping structure
                      : 'bg-primary-600 hover:bg-primary-500 text-white shadow-[0_4px_14px_0_rgba(59,130,246,0.39)]'
          } ${resultPrompt ? 'hidden' : ''}`}
        >
          {isProcessing ? (
             <>Processing Video with Gemini...</>
          ) : isRecording ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-white" />
              Stop & Generate Prompt
            </>
          ) : (
             <>
              <Video className="w-5 h-5" />
              Start Screen Scribe
             </>
          )}
        </button>
      </footer>
    </div>
  );
}
