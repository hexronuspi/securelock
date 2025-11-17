// Main background script - now modular
console.log('ExamShield background script starting...');
console.log('Extension ID:', chrome.runtime.id);

// Import all modules
importScripts(
  'bg/logger.js',
  'bg/contentCommunication.js', 
  'bg/nativeMessaging.js',
  'bg/messageHandler.js',
  'bg/securityMonitor.js'
);

// Initialize the extension
function initializeExtension() {
  Logger.log('Starting native connection...');
  
  // Start native messaging connection
  NativeMessaging.connectNative();
  
  // Set up message handler
  chrome.runtime.onMessage.addListener(MessageHandler.handleRuntimeMessage);
  
  // Initialize security monitoring
  SecurityMonitor.initializeFallbackTimeout();
  SecurityMonitor.startPeriodicSecurityCheck();
  
  Logger.log('ExamShield background script initialized successfully');
}

// Start the extension
initializeExtension();