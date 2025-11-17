// Message handler module for runtime messages
function handleRuntimeMessage(message, sender, sendResponse) {
  Logger.log('Background received message:', message);
  
  if (message.type === 'content_ready') {
    Logger.log('Content script is ready');
    const { isConnected } = NativeMessaging.getConnectionStatus();
    sendResponse({status: 'acknowledged', connected: isConnected});
    
    // Request real security data from native host if connected
    if (isConnected) {
      const success = NativeMessaging.sendToNative({
        type: 'get_status', 
        timestamp: Date.now()
      });
      if (success) {
        Logger.log('Requested security status from native host');
      }
    } else {
      Logger.log('Native messaging not connected, will retry...');
    }
  } else if (message.type === 'launch_kiosk') {
    Logger.log('Received kiosk launch request with token:', message.token);
    
    const { isConnected } = NativeMessaging.getConnectionStatus();
    if (isConnected) {
      const success = NativeMessaging.sendToNative({
        command: 'launch_kiosk',
        token: message.token || 'demo_token_' + Date.now()
      });
      
      if (success) {
        Logger.log('Kiosk launch request sent to native host');
        sendResponse({status: 'kiosk_requested', token: message.token});
      } else {
        sendResponse({status: 'error', error: 'Failed to send to native host'});
      }
    } else {
      Logger.log('Cannot launch kiosk - native messaging not connected');
      sendResponse({status: 'error', error: 'Native messaging not connected'});
    }
  }
  
  return true; // Keep the message channel open
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleRuntimeMessage };
} else {
  window.MessageHandler = { handleRuntimeMessage };
}