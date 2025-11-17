// Native messaging module
const NATIVE = 'com.exam.shield';
let port = null;
let isConnected = false;
let connectionAttempts = 0;

function connectNative() {
  connectionAttempts++;
  Logger.log(`Connection attempt #${connectionAttempts} to native messaging...`);
  Logger.log(`Extension ID: ${chrome.runtime.id}`);
  
  try {
    port = chrome.runtime.connectNative(NATIVE);
    Logger.log('Native port created successfully');
    
    port.onMessage.addListener((msg) => {
      Logger.log('Received from native host:', msg);
      isConnected = true;
      ContentCommunication.sendToContent({type: 'risk', payload: msg});
    });
    
    port.onDisconnect.addListener(() => {
      Logger.log('Native port disconnected');
      isConnected = false;
      
      if (chrome.runtime.lastError) {
        Logger.log('Disconnect error:', chrome.runtime.lastError.message);
      }
      
      port = null;
      // Try to reconnect after 5 seconds
      setTimeout(connectNative, 5000);
    });
    
    Logger.log('Native messaging event listeners set up');
    
    // Test the connection by sending a message
    setTimeout(() => {
      if (port) {
        try {
          port.postMessage({type: 'test'});
          Logger.log('Test message sent to native host');
        } catch (error) {
          Logger.log('Error sending test message:', error);
        }
      }
    }, 1000);
    
  } catch (error) {
    Logger.log('Failed to connect to native messaging:', error);
    isConnected = false;
    
    // Try to reconnect after 5 seconds, but not more than 5 times
    if (connectionAttempts < 5) {
      setTimeout(connectNative, 5000);
    } else {
      Logger.log('Max connection attempts reached. Native security monitoring unavailable.');
      // Send error status to content script
      ContentCommunication.sendToContent({
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

function sendToNative(message) {
  if (port && isConnected) {
    try {
      port.postMessage(message);
      return true;
    } catch (error) {
      Logger.log('Error sending to native host:', error);
      isConnected = false;
      setTimeout(connectNative, 2000);
      return false;
    }
  }
  return false;
}

function getConnectionStatus() {
  return { isConnected, connectionAttempts, port };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { connectNative, sendToNative, getConnectionStatus };
} else {
  window.NativeMessaging = { connectNative, sendToNative, getConnectionStatus };
}