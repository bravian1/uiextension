/// <reference types="chrome"/>

let recorder: MediaRecorder | null = null;
let data: Blob[] = [];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    startRecording()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'stop-recording') {
    stopRecording()
      .then((payload) => sendResponse({ success: true, payload }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function startRecording() {
  if (recorder?.state === 'recording') {
    throw new Error('Called startRecording while recording is in progress.');
  }

  // Use getDisplayMedia directly in the offscreen document — desktopCapture stream IDs
  // obtained in the service worker are not usable cross-context in an offscreen document.
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { max: 1920 },
      height: { max: 1080 },
    },
    audio: true, // capture tab/system audio if the user enables it in the picker
  });

  // Also get the user's microphone
  const micStream = await navigator.mediaDevices.getUserMedia({ 
    audio: true 
  }).catch(() => null); // Optional, might fail if no mic permission

  const tracks = [...displayStream.getTracks()];
  if (micStream) {
    tracks.push(...micStream.getAudioTracks());
  }

  const combinedStream = new MediaStream(tracks);

  recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
  recorder.ondataavailable = (event) => data.push(event.data);
  recorder.onstop = () => {
    // When the stream is stopped by Chrome UI, cleanup
    combinedStream.getTracks().forEach((t) => t.stop());
  };
  recorder.start();
  
  // Set an automatic hard limit of 2 minutes (120000ms) for now to prevent memory issues
  setTimeout(() => {
    if(recorder?.state === 'recording') {
       chrome.runtime.sendMessage({ type: 'recording-timeout' });
    }
  }, 120000);
}

async function stopRecording(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!recorder) return reject(new Error('No recorder found'));

    recorder.onstop = () => {
      const blob = new Blob(data, { type: 'video/webm' });
      // We encode to base64 to send the large blob back to the background script
      const reader = new FileReader();
      reader.onloadend = () => {
        data = []; // cleanup
        recorder = null;
        resolve(reader.result as string);
      };
      reader.readAsDataURL(blob);
    };

    if (recorder.state === 'inactive') {
      // The user clicked Chrome's native "Stop sharing" button, so the recorder 
      // already stopped. Our original onstop handler fired but didn't resolve the 
      // promise (since this new handler wasn't attached yet). Trigger it manually:
      recorder.onstop(new Event('stop'));
    } else {
      recorder.stop();
    }
  });
}
