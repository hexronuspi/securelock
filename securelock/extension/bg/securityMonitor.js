// Security monitoring module
function initializeFallbackTimeout() {
  // Fallback timeout - if no connection after 10 seconds, send fallback status
  setTimeout(() => {
    const { isConnected } = NativeMessaging.getConnectionStatus();
    if (!isConnected) {
      Logger.log('Native connection timeout - sending fallback status');
      ContentCommunication.sendToContent({
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
}

function startPeriodicSecurityCheck() {
  // Periodic security status check
  setInterval(() => {
    const { isConnected } = NativeMessaging.getConnectionStatus();
    if (isConnected) {
      const success = NativeMessaging.sendToNative({
        type: 'get_status',
        timestamp: Date.now(),
        request_id: Math.random().toString(36).substr(2, 9)
      });
      
      if (!success) {
        Logger.log('Error in periodic security check');
      }
    }
  }, 30000); // Every 30 seconds
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initializeFallbackTimeout, startPeriodicSecurityCheck };
} else {
  window.SecurityMonitor = { initializeFallbackTimeout, startPeriodicSecurityCheck };
}