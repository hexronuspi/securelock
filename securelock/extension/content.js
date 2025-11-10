let risk = null;

// Debug: Log that content script is loaded
console.log('ExamShield Content Script Loaded!');
console.log('Location:', window.location.href);

chrome.runtime.onMessage.addListener((message, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'risk') {
    risk = message.payload.risk;
    console.log('Received risk score:', risk);
    window.postMessage({type: 'EXAM_RISK', risk: risk}, '*');
    sendResponse({received: true});
  }
  
  return true; // Keep the message channel open
});

// Listen for messages from the webpage
window.addEventListener('message', (event) => {
  // Only accept messages from the same origin
  if (event.origin !== window.location.origin) return;
  
  console.log('Content script received window message:', event.data);
  
  if (event.data.type === 'LAUNCH_KIOSK') {
    console.log('Forwarding kiosk launch request to background script');
    chrome.runtime.sendMessage({
      type: 'launch_kiosk',
      token: event.data.token
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending kiosk launch request:', chrome.runtime.lastError.message);
      } else {
        console.log('Kiosk launch response:', response);
      }
    });
  }
});

// Send ready message to background script
function notifyReady() {
  console.log('Content script starting, extension ID:', chrome.runtime.id);
  chrome.runtime.sendMessage({type: 'content_ready'}, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending ready message:', chrome.runtime.lastError.message);
      console.log('Will retry in 1 second...');
      // Retry after a short delay
      setTimeout(notifyReady, 1000);
    } else {
      console.log('Background acknowledged content ready:', response);
    }
  });
}

console.log('ExamShield content script loaded');
notifyReady();