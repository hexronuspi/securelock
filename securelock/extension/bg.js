// Debug version of background script
console.log('ExamShield background script starting...');
console.log('Extension ID:', chrome.runtime.id);

const NATIVE = 'com.exam.shield';
let port = null;
let isConnected = false;
let connectionAttempts = 0;

function log(message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  if (data) {
    console.log(`[${timestamp}] ExamShield:`, message, data);
  } else {
    console.log(`[${timestamp}] ExamShield:`, message);
  }
}

function sendToContent(message) {
  chrome.tabs.query({url: 'http://localhost:3000/*'}, (tabs) => {
    if (tabs && tabs[0]) {
      log('Sending to content script:', message);
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          log('Error sending to content script:', chrome.runtime.lastError.message);
        } else {
          log('Content script response:', response);
        }
      });
    } else {
      log('No localhost:3000 tabs found');
    }
  });
}

function connectNative() {
  connectionAttempts++;
  log(`Connection attempt #${connectionAttempts} to native messaging...`);
  log(`Extension ID: ${chrome.runtime.id}`);
  
  try {
    port = chrome.runtime.connectNative(NATIVE);
    log('Native port created successfully');
    
    port.onMessage.addListener((msg) => {
      log('Received from native host:', msg);
      isConnected = true;
      sendToContent({type: 'risk', payload: msg});
    });
    
    port.onDisconnect.addListener(() => {
      log('Native port disconnected');
      isConnected = false;
      
      if (chrome.runtime.lastError) {
        log('Disconnect error:', chrome.runtime.lastError.message);
      }
      
      port = null;
      // Try to reconnect after 5 seconds
      setTimeout(connectNative, 5000);
    });
    
    log('Native messaging event listeners set up');
    
    // Test the connection by sending a message
    setTimeout(() => {
      if (port) {
        try {
          port.postMessage({type: 'test'});
          log('Test message sent to native host');
        } catch (error) {
          log('Error sending test message:', error);
        }
      }
    }, 1000);
    
  } catch (error) {
    log('Failed to connect to native messaging:', error);
    isConnected = false;
    
    // Try to reconnect after 5 seconds, but not more than 5 times
    if (connectionAttempts < 5) {
      setTimeout(connectNative, 5000);
    } else {
      log('Max connection attempts reached. Native security monitoring unavailable.');
      // Send error status to content script
      sendToContent({
        type: 'risk', 
        payload: {
          error: 'SECURITY_UNAVAILABLE',
          message: 'Security monitoring system is not available',
          timestamp: Math.floor(Date.now() / 1000)
        }
      });
    }
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Background received message:', message);
  
  if (message.type === 'content_ready') {
    log('Content script is ready');
    sendResponse({status: 'acknowledged', connected: isConnected});
    
    // Request real security data from native host if connected
    if (isConnected && port) {
      try {
        port.postMessage({type: 'get_status', timestamp: Date.now()});
        log('Requested security status from native host');
      } catch (error) {
        log('Error requesting status from native:', error);
      }
    } else {
      log('Native messaging not connected, will retry...');
    }
  } else if (message.type === 'launch_kiosk') {
    log('Received kiosk launch request with token:', message.token);
    
    if (port && isConnected) {
      try {
        port.postMessage({
          command: 'launch_kiosk',
          token: message.token || 'demo_token_' + Date.now()
        });
        log('Kiosk launch request sent to native host');
        sendResponse({status: 'kiosk_requested', token: message.token});
      } catch (error) {
        log('Error sending kiosk launch request:', error);
        sendResponse({status: 'error', error: error.message});
      }
    } else {
      log('Cannot launch kiosk - native messaging not connected');
      sendResponse({status: 'error', error: 'Native messaging not connected'});
    }
  }
  
  return true; // Keep the message channel open
});

log('Starting native connection...');
connectNative();

// Fallback timeout - if no connection after 10 seconds, send fallback status
setTimeout(() => {
  if (!isConnected) {
    log('Native connection timeout - sending fallback status');
    sendToContent({
      type: 'risk',
      payload: {
        risk: 0,
        status: 'LOW',
        vm_detected: false,
        rdp_detected: false,
        processes: [],
        message: 'Security monitoring in fallback mode',
        timestamp: Math.floor(Date.now() / 1000),
        fallback: true
      }
    });
  }
}, 10000);

// Periodic security status check
setInterval(() => {
  if (port && isConnected) {
    try {
      port.postMessage({
        type: 'get_status',
        timestamp: Date.now(),
        request_id: Math.random().toString(36).substr(2, 9)
      });
    } catch (error) {
      log('Error in periodic security check:', error);
      isConnected = false;
      // Try to reconnect if periodic check fails
      setTimeout(connectNative, 2000);
    }
  }
}, 30000); // Every 30 seconds