// Logger module for centralized logging
function log(message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  if (data) {
    console.log(`[${timestamp}] ExamShield:`, message, data);
  } else {
    console.log(`[${timestamp}] ExamShield:`, message);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { log };
} else {
  window.Logger = { log };
}