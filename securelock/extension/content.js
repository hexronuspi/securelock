let risk = null;
let tabSwitchCount = 0;
let isWindowFocused = true;
let lastFocusTime = Date.now();

// Keystroke Detection System
class KeystrokeAnalyzer {
    constructor() {
        this.keystrokeLog = [];
        this.textChangeLog = [];
        this.suspiciousEvents = [];
        this.typingProfile = {
            totalKeystrokes: 0,
            totalTime: 0,
            avgInterval: 0,
            variance: 0,
            backspaceCount: 0,
            pasteCount: 0,
            rapidBursts: 0
        };
    }

    startMonitoring() {
        this.attachKeystrokeListeners();
        this.attachTextChangeListeners();
        this.startAnalysisTimer();
        console.log('Keystroke monitoring started');
    }

    attachKeystrokeListeners() {
        document.addEventListener('keydown', (e) => {
            const keystroke = {
                key: e.key,
                timestamp: Date.now(),
                type: 'down',
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey
            };
            
            this.keystrokeLog.push(keystroke);
            
            // Detect paste operations
            if (e.ctrlKey && e.key === 'v') {
                this.typingProfile.pasteCount++;
                this.suspiciousEvents.push({
                    type: 'PASTE_DETECTED',
                    timestamp: Date.now(),
                    severity: 'MEDIUM'
                });
            }
            
            // Count backspaces for natural typing analysis (always count for ratio)
            if (e.key === 'Backspace') {
                this.typingProfile.backspaceCount++;
            }
            
            this.typingProfile.totalKeystrokes++;
        });

        document.addEventListener('keyup', (e) => {
            this.keystrokeLog.push({
                key: e.key,
                timestamp: Date.now(),
                type: 'up'
            });
        });
    }

    attachTextChangeListeners() {
        // Find all text inputs and textareas
        const textElements = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
        
        textElements.forEach(element => {
            let lastValue = element.value || element.textContent || '';
            let lastLength = lastValue.length;
            
            element.addEventListener('input', (e) => {
                const currentValue = e.target.value || e.target.textContent || '';
                const currentLength = currentValue.length;
                const lengthDelta = currentLength - lastLength;
                
                this.textChangeLog.push({
                    element: e.target,
                    delta: lengthDelta,
                    timestamp: Date.now(),
                    content: currentValue,
                    length: currentLength
                });
                
                // Analyze large text insertions
                if (lengthDelta > 20) {
                    this.analyzeLargeInsertion(lengthDelta, Date.now());
                }
                
                lastValue = currentValue;
                lastLength = currentLength;
            });
        });
    }

    analyzeLargeInsertion(delta, timestamp) {
        const timeWindow = 3000; // 3 second window for analysis
        const recentKeystrokes = this.getKeystrokesInTimeWindow(timestamp, timeWindow);
        
        // Only count meaningful keystrokes for comparison
        const meaningfulKeystrokeCount = recentKeystrokes.filter(k => 
            k.type === 'down' && this.isMeaningfulKeystroke(k.key)
        ).length;
        
        // Check for paste detection with more reasonable thresholds
        const pasteEvents = recentKeystrokes.filter(k => 
            k.ctrlKey && k.key === 'v'
        ).length;
        
        // Very lenient - only flag obvious copy-paste abuse
        if (delta > 100 && meaningfulKeystrokeCount < delta * 0.05 && pasteEvents === 0) {
            // Additional check: make sure it's not just auto-formatting or completion
            const hasNewlines = recentKeystrokes.some(k => k.key === 'Enter');
            const hasBackspaces = recentKeystrokes.some(k => k.key === 'Backspace');
            
            // Only flag if there's no natural editing behavior
            if (!hasNewlines && !hasBackspaces) {
                this.suspiciousEvents.push({
                    type: 'LARGE_TEXT_WITHOUT_KEYSTROKES',
                    timestamp: timestamp,
                    severity: 'LOW', // Further reduced severity
                    details: { 
                        textDelta: delta, 
                        meaningfulKeystrokeCount: meaningfulKeystrokeCount,
                        ratio: meaningfulKeystrokeCount / delta,
                        hasNaturalEditing: hasNewlines || hasBackspaces
                    }
                });
            }
        }
    }

    getKeystrokesInTimeWindow(timestamp, windowMs) {
        return this.keystrokeLog.filter(k => 
            timestamp - k.timestamp <= windowMs
        );
    }

    analyzeTypingSpeed() {
        if (this.keystrokeLog.length < 20) return null;
        
        // Filter meaningful keystrokes for speed analysis
        const meaningfulKeystrokes = this.keystrokeLog.filter(k => 
            k.type === 'down' && this.isMeaningfulKeystroke(k.key)
        ).slice(-100); // Last 100 meaningful keystrokes
        
        if (meaningfulKeystrokes.length < 10) return null;
        
        const intervals = [];
        
        for (let i = 1; i < meaningfulKeystrokes.length; i++) {
            const interval = meaningfulKeystrokes[i].timestamp - meaningfulKeystrokes[i-1].timestamp;
            // Only include reasonable intervals (filter out long pauses)
            if (interval < 5000) { // Less than 5 seconds between keystrokes
                intervals.push(interval);
            }
        }
        
        if (intervals.length < 5) return null;
        
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        const variance = this.calculateVariance(intervals, avgInterval);
        
        // Calculate WPM based on meaningful characters (4 chars per word for coding)
        const wpm = (60000 / avgInterval) / 4;
        
        this.typingProfile.avgInterval = avgInterval;
        this.typingProfile.variance = variance;
        
        // Flag suspicious patterns (very lenient for coding)
        if (wpm > 300 && meaningfulKeystrokes.length > 50) { // Much higher threshold
            this.suspiciousEvents.push({
                type: 'IMPOSSIBLE_TYPING_SPEED',
                timestamp: Date.now(),
                severity: 'HIGH',
                details: { wpm: Math.round(wpm), avgInterval: avgInterval, meaningfulKeystrokes: meaningfulKeystrokes.length }
            });
        }
        
        // Very strict robotic detection - only flag extremely suspicious patterns
        if (variance < 10 && avgInterval < 40 && meaningfulKeystrokes.length > 200 && intervals.length > 100) {
            const veryConsistentCount = intervals.filter(i => Math.abs(i - avgInterval) < 5).length;
            if (veryConsistentCount > intervals.length * 0.8) { // 80% of intervals are nearly identical
                this.suspiciousEvents.push({
                    type: 'ROBOTIC_TYPING_PATTERN',
                    timestamp: Date.now(),
                    severity: 'MEDIUM',
                    details: { variance: variance, avgInterval: avgInterval, consistency: veryConsistentCount / intervals.length }
                });
            }
        }
        
        return { wpm: Math.round(wpm), variance: variance, avgInterval: avgInterval };
    }
    
    isMeaningfulKeystroke(key) {
        // Filter out navigation, formatting, and short utility keys
        const ignoredKeys = [
            'Enter', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
            'Escape', 'PrintScreen', 'ScrollLock', 'Pause'
        ];
        
        // Ignore modifier keys, function keys, and navigation
        if (ignoredKeys.includes(key)) {
            return false;
        }
        
        // Ignore single character keys that are just symbols/spaces for speed calc
        if (key === ' ' || key === 'Backspace') {
            return false;
        }
        
        // Count alphanumeric and meaningful symbols
        return key.length === 1 || ['Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 
                                     'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backslash'].includes(key);
    }

    calculateVariance(values, mean = null) {
        if (values.length === 0) return 0;
        if (mean === null) mean = values.reduce((a, b) => a + b) / values.length;
        
        const squareDiffs = values.map(value => Math.pow(value - mean, 2));
        return squareDiffs.reduce((a, b) => a + b) / squareDiffs.length;
    }

    detectRapidBursts() {
        // Only analyze meaningful keystrokes for burst detection
        const meaningfulKeystrokes = this.keystrokeLog.filter(k => 
            k.type === 'down' && this.isMeaningfulKeystroke(k.key)
        );
        
        if (meaningfulKeystrokes.length < 50) return; // Need substantial data
        
        const burstThreshold = 20; // ms between meaningful keystrokes
        const burstMinLength = 30; // minimum meaningful keystrokes in burst
        
        let currentBurst = [];
        
        for (let i = 1; i < meaningfulKeystrokes.length; i++) {
            const current = meaningfulKeystrokes[i];
            const previous = meaningfulKeystrokes[i-1];
            
            if (current.timestamp - previous.timestamp < burstThreshold) {
                if (currentBurst.length === 0) currentBurst.push(previous);
                currentBurst.push(current);
            } else {
                if (currentBurst.length >= burstMinLength) {
                    // Additional validation: check if burst is truly suspicious
                    const avgBurstInterval = this.calculateBurstAverage(currentBurst);
                    if (avgBurstInterval < 15) { // Only flag extremely fast meaningful typing
                        this.typingProfile.rapidBursts++;
                        this.suspiciousEvents.push({
                            type: 'RAPID_TYPING_BURST',
                            timestamp: Date.now(),
                            severity: 'LOW',
                            details: { 
                                burstLength: currentBurst.length,
                                avgInterval: avgBurstInterval,
                                meaningfulKeysOnly: true
                            }
                        });
                    }
                }
                currentBurst = [];
            }
        }
    }
    
    calculateBurstAverage(burst) {
        if (burst.length < 2) return 0;
        
        let totalInterval = 0;
        for (let i = 1; i < burst.length; i++) {
            totalInterval += burst[i].timestamp - burst[i-1].timestamp;
        }
        return totalInterval / (burst.length - 1);
    }

    startAnalysisTimer() {
        setInterval(() => {
            this.analyzeTypingSpeed();
            this.detectRapidBursts();
            this.sendAnalysisUpdate();
        }, 5000); // Analyze every 5 seconds
    }

    sendAnalysisUpdate() {
        const analysis = this.getAnalysisSummary();
        
        window.postMessage({
            type: 'KEYSTROKE_ANALYSIS',
            data: analysis
        }, '*');
        
        // Send to background script
        chrome.runtime.sendMessage({
            type: 'keystroke_analysis',
            data: analysis
        });
    }

    getAnalysisSummary() {
        const recentSpeed = this.analyzeTypingSpeed();
        
        return {
            totalKeystrokes: this.typingProfile.totalKeystrokes,
            avgTypingSpeed: recentSpeed ? recentSpeed.wpm : 0,
            typingVariance: recentSpeed ? recentSpeed.variance : 0,
            backspaceRatio: this.typingProfile.totalKeystrokes > 0 ? 
                (this.typingProfile.backspaceCount / this.typingProfile.totalKeystrokes) : 0,
            pasteCount: this.typingProfile.pasteCount,
            rapidBursts: this.typingProfile.rapidBursts,
            suspiciousEvents: this.suspiciousEvents.length,
            recentSuspicious: this.suspiciousEvents.filter(e => 
                Date.now() - e.timestamp < 60000 // Last minute
            ),
            riskScore: this.calculateKeystrokeRisk()
        };
    }

    calculateKeystrokeRisk() {
        let risk = 0;
        
        // High severity events (reduced impact)
        const highSeverity = this.suspiciousEvents.filter(e => e.severity === 'HIGH').length;
        risk += highSeverity * 3; // Reduced from 4
        
        // Medium severity events (reduced impact)
        const mediumSeverity = this.suspiciousEvents.filter(e => e.severity === 'MEDIUM').length;
        risk += mediumSeverity * 1; // Reduced from 2
        
        // Low severity events (minimal impact)
        const lowSeverity = this.suspiciousEvents.filter(e => e.severity === 'LOW').length;
        risk += Math.floor(lowSeverity * 0.5); // Further reduced
        
        return Math.min(risk, 10); // Cap at 10 points
    }
}

// Initialize keystroke analyzer
const keystrokeAnalyzer = new KeystrokeAnalyzer();

// Debug: Log that content script is loaded
console.log('ExamShield Content Script Loaded!');
console.log('Location:', window.location.href);

// Add tab switching detection
function detectTabSwitch() {
  // Detect when user switches away from this tab/window
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      tabSwitchCount++;
      console.log('Tab switch detected! Count:', tabSwitchCount);
      // Send tab switch event to webpage
      window.postMessage({
        type: 'TAB_SWITCH_DETECTED', 
        count: tabSwitchCount,
        timestamp: Date.now()
      }, '*');
      
      // Also send to background script for logging
      chrome.runtime.sendMessage({
        type: 'tab_switch',
        count: tabSwitchCount,
        timestamp: Date.now()
      });
    }
  });
  
  // Also detect window focus changes
  window.addEventListener('blur', () => {
    if (isWindowFocused) {
      isWindowFocused = false;
      tabSwitchCount++;
      console.log('Window focus lost! Count:', tabSwitchCount);
      window.postMessage({
        type: 'TAB_SWITCH_DETECTED', 
        count: tabSwitchCount,
        timestamp: Date.now()
      }, '*');
    }
  });
  
  window.addEventListener('focus', () => {
    isWindowFocused = true;
    lastFocusTime = Date.now();
  });
}

// Initialize tab switching detection
detectTabSwitch();

// Initialize keystroke monitoring
keystrokeAnalyzer.startMonitoring();

chrome.runtime.onMessage.addListener((message, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'risk') {
    risk = message.payload.risk;
    console.log('Received risk score:', risk);
    window.postMessage({type: 'EXAM_RISK', risk: risk}, '*');
    
    // Also send current keystroke analysis
    const keystrokeData = keystrokeAnalyzer.getAnalysisSummary();
    window.postMessage({
      type: 'KEYSTROKE_ANALYSIS',
      data: keystrokeData
    }, '*');
    
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