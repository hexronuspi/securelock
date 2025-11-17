// Content script communication module
function sendToContent(message) {
  chrome.tabs.query({url: 'http://localhost:3000/*'}, (tabs) => {
    if (tabs && tabs[0]) {
      Logger.log('Sending to content script:', message);
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          Logger.log('Error sending to content script:', chrome.runtime.lastError.message);
        } else {
          Logger.log('Content script response:', response);
        }
      });
    } else {
      Logger.log('No localhost:3000 tabs found');
    }
  });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sendToContent };
} else {
  window.ContentCommunication = { sendToContent };
}