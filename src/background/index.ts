import { processVideoWithBackend } from '../lib/gemini';

let creating: Promise<void> | null = null;

async function getOrCreateSessionId(): Promise<string> {
  const result = await chrome.storage.local.get(['sessionId']);
  if (result.sessionId) return result.sessionId as string;
  const sessionId = crypto.randomUUID();
  await chrome.storage.local.set({ sessionId });
  return sessionId;
}

async function setupOffscreenDocument(path: string) {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) return;

  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA, chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Recording screen and microphone for Gemini AI analysis',
    });
    await creating;
    creating = null;
  }
}

async function closeOffscreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) return;
  await chrome.offscreen.closeDocument();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'start-recording') {
    handleStartRecording(sendResponse);
    return true;
  }

  if (message.type === 'stop-recording') {
    handleStopRecording(sendResponse);
    return true;
  }

  if (message.type === 'recording-timeout') {
    console.warn('Recording reached maximum duration.');
    handleStopRecording(() => {});
  }
});

async function handleStartRecording(sendResponse: (x: any) => void) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) throw new Error("No active tab found");
    await chrome.storage.session.set({ recordingTabId: tabs[0].id });

    await setupOffscreenDocument('src/offscreen/index.html');

    const response = await chrome.runtime.sendMessage({
      type: 'start-recording',
      target: 'offscreen',
    });

    if (response?.success) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle-drawing-mode', active: true }).catch(() => {});
    } else {
      throw new Error(response?.error || 'Failed to start offscreen recorder');
    }

    sendResponse(response);
  } catch (error: any) {
    console.error('Failed to start recording:', error);
    await chrome.storage.session.remove(['recordingTabId']);
    chrome.storage.session.set({ isRecording: false });
    sendResponse({ success: false, error: error.message });
  }
}

async function handleStopRecording(sendResponse: (x: any) => void) {
  try {
    const session = await chrome.storage.session.get(['recordingTabId', 'recordingMode']);
    if (!session.recordingTabId) throw new Error("No active recording session.");

    await chrome.storage.session.remove(['recordingTabId', 'isRecording']);

    const mode = session.recordingMode || 'edit';
    const sessionId = await getOrCreateSessionId();

    chrome.tabs.sendMessage(session.recordingTabId as number, { type: 'toggle-drawing-mode', active: false }).catch(() => {});

    const response = await chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen'
    });

    await closeOffscreenDocument();

    if (response?.success && response.payload) {
      console.log("Got video payload. Sending to backend...");
      const prompt = await processVideoWithBackend(response.payload, mode as "edit" | "inspire", sessionId);
      sendResponse({ success: true, prompt });
    } else {
      sendResponse({ success: false, error: response?.error || 'Unknown error stopping' });
    }
  } catch (error: any) {
    console.error('Failed to stop recording & process:', error);
    sendResponse({ success: false, error: error.message });
  }
}
