"use client";
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (message: any, callback?: (response: any) => void) => void;
      };
    };
  }
}

interface SecurityData {
  risk: number;
  vm?: boolean;
  rdp?: boolean;
  suspicious_processes?: boolean;
  monitor_count?: number;
  suspicious_monitors?: boolean;
  timestamp?: number;
  signature?: string;
}

interface TabSwitchData {
  count: number;
  timestamp: number;
}

interface KeystrokeData {
  totalKeystrokes: number;
  avgTypingSpeed: number;
  typingVariance: number;
  backspaceRatio: number;
  pasteCount: number;
  rapidBursts: number;
  suspiciousEvents: number;
  recentSuspicious: any[];
  riskScore: number;
}

export default function Home() {
  const [securityData, setSecurityData] = useState<SecurityData | null>(null);
  const [done, setDone] = useState(false);
  const [isKioskMode, setIsKioskMode] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [lastTabSwitchTime, setLastTabSwitchTime] = useState<number | null>(null);
  const [keystrokeData, setKeystrokeData] = useState<KeystrokeData | null>(null);
  const [testText, setTestText] = useState('');

  useEffect(() => {
    // Check if we're in kiosk mode (look for token in URL)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const mode = urlParams.get('mode');
    setIsKioskMode(!!(token && mode === 'exam'));

    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'EXAM_RISK') {
        if (e.data.risk?.error) {
          // Handle security system errors
          setSecurityError(e.data.risk.message || 'Security system unavailable');
          setSecurityData(null);
        } else if (typeof e.data.risk === 'number') {
          // Simple risk number (legacy)
          setSecurityData({ risk: e.data.risk });
          setSecurityError(null);
        } else {
          // Full security data object
          setSecurityData(e.data.risk);
          setSecurityError(null);
        }
      } else if (e.data.type === 'TAB_SWITCH_DETECTED') {
        console.log('Tab switch detected:', e.data.count);
        setTabSwitchCount(e.data.count);
        setLastTabSwitchTime(e.data.timestamp);
      } else if (e.data.type === 'KEYSTROKE_ANALYSIS') {
        console.log('Keystroke analysis:', e.data.data);
        setKeystrokeData(e.data.data);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const submit = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionToken = urlParams.get('token');
    
    const submissionData = {
      securityData: {
        ...securityData,
        tab_switch_count: tabSwitchCount,
        last_tab_switch_time: lastTabSwitchTime,
        keystroke_data: keystrokeData
      },
      securityError,
      sessionToken,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      isSecureMode: isKioskMode,
      testText: testText
    };

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });
      const result = await res.json();
      
      if (result.ok) {
        alert('🎉 Exam submitted successfully!\n\nSubmission ID: ' + (result.submissionId || 'N/A'));
      } else {
        alert('❌ Submission failed: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      alert('❌ Network error during submission. Please try again.');
      console.error('Submission error:', error);
      return;
    }
    
    setDone(true);
  };

  const getRiskColor = (risk: number) => {
    if (risk <= 20) return '#4CAF50'; // Green
    if (risk <= 50) return '#FF9800'; // Orange  
    return '#F44336'; // Red
  };

  const getRiskLevel = (risk: number) => {
    if (risk <= 20) return 'LOW';
    if (risk <= 50) return 'MEDIUM';
    return 'HIGH';
  };

  const risk = securityData?.risk ?? null;

  return (
    <div style={{ 
      fontFamily: 'system-ui, -apple-system, sans-serif', 
      padding: isKioskMode ? 20 : 40,
      maxWidth: 800,
      margin: '0 auto',
      backgroundColor: isKioskMode ? '#f5f5f5' : 'white'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 30,
        borderBottom: '2px solid #2196F3',
        paddingBottom: 15
      }}>
        <div style={{
          width: 40,
          height: 40,
          backgroundColor: '#2196F3',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 15,
          color: 'white',
          fontWeight: 'bold'
        }}>🛡️</div>
        <h1 style={{ margin: 0, color: '#2196F3' }}>
          ExamShield {isKioskMode ? 'Secure Exam' : 'Security Monitor'}
        </h1>
      </div>

      <div style={{
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 20,
        marginBottom: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ marginTop: 0 }}>Security Status</h3>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 15
        }}>
          <span style={{ marginRight: 10 }}>Security Status:</span>
          {securityError ? (
            <div style={{ color: '#F44336', fontWeight: 'bold' }}>
              ⚠️ {securityError}
            </div>
          ) : risk !== null ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
              <span style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: getRiskColor(risk)
              }}>
                {risk}
              </span>
              <span style={{
                padding: '4px 8px',
                borderRadius: 4,
                backgroundColor: getRiskColor(risk),
                color: 'white',
                fontSize: 12,
                fontWeight: 'bold'
              }}>
                {getRiskLevel(risk)}
              </span>
            </div>
          ) : (
            <span style={{ color: '#666', fontStyle: 'italic' }}>
              🔍 Initializing security scan...
            </span>
          )}
        </div>

        {securityData && (
          <div style={{ fontSize: 14, color: '#666' }}>
            <div>🖥️ Virtual Machine: {securityData.vm ? '❌ Detected' : '✅ Not Detected'}</div>
            <div>🌐 Remote Session: {securityData.rdp ? '❌ Active' : '✅ Local'}</div>
            {securityData.suspicious_processes !== undefined && (
              <div>⚠️ Suspicious Processes: {securityData.suspicious_processes ? '❌ Found' : '✅ Clean'}</div>
            )}
            {securityData.monitor_count && (
              <div>🖥️ Monitor Count: {securityData.monitor_count}</div>
            )}
            <div style={{ color: tabSwitchCount > 0 ? '#e74c3c' : '#27ae60' }}>
              🔄 Tab Switch Attempts: {tabSwitchCount}
              {tabSwitchCount > 0 && lastTabSwitchTime && (
                <span style={{ fontSize: 11, color: '#666', marginLeft: 5 }}>
                  (Last: {new Date(lastTabSwitchTime).toLocaleTimeString()})
                </span>
              )}
            </div>
            {securityData.timestamp && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#999' }}>
                Last updated: {new Date(securityData.timestamp * 1000).toLocaleTimeString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Keystroke Analysis Section */}
      {keystrokeData && (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, color: '#2196F3' }}>⌨️ Keystroke Analysis</h3>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: 15,
            marginBottom: 15
          }}>
            <div>
              <strong>Total Keystrokes:</strong> {keystrokeData.totalKeystrokes}
            </div>
            <div>
              <strong>Typing Speed:</strong> {Math.round(keystrokeData.avgTypingSpeed)} WPM
            </div>
            <div>
              <strong>Paste Count:</strong> 
              <span style={{ color: keystrokeData.pasteCount > 5 ? '#e74c3c' : '#27ae60', marginLeft: 5 }}>
                {keystrokeData.pasteCount}
              </span>
            </div>
            <div>
              <strong>Rapid Bursts:</strong> 
              <span style={{ color: keystrokeData.rapidBursts > 3 ? '#e74c3c' : '#27ae60', marginLeft: 5 }}>
                {keystrokeData.rapidBursts}
              </span>
            </div>
            <div>
              <strong>Backspace Ratio:</strong> {(keystrokeData.backspaceRatio * 100).toFixed(1)}%
            </div>
          </div>
          
          <div style={{ marginBottom: 15 }}>
            <strong>Keystroke Risk Score:</strong> 
            <span style={{
              marginLeft: 10,
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: keystrokeData.riskScore > 5 ? '#e74c3c' : keystrokeData.riskScore > 2 ? '#f39c12' : '#27ae60',
              color: 'white',
              fontSize: 12,
              fontWeight: 'bold'
            }}>
              {keystrokeData.riskScore}/10
            </span>
          </div>
          
          {keystrokeData.recentSuspicious.length > 0 && (
            <div>
              <strong style={{ color: '#e74c3c' }}>Recent Suspicious Events:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: 20 }}>
                {keystrokeData.recentSuspicious.slice(0, 5).map((event, index) => (
                  <li key={index} style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                    {event.type.replace(/_/g, ' ')} - {event.severity} 
                    ({new Date(event.timestamp).toLocaleTimeString()})
                    {event.details && (
                      <span style={{ marginLeft: 5, fontStyle: 'italic' }}>
                        {JSON.stringify(event.details)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Test Text Area */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 20,
        marginBottom: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ marginTop: 0, color: '#2196F3' }}>📝 Keystroke Test Area</h3>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
          Type in the area below to test keystroke detection. The system will analyze your typing patterns in real-time.
        </p>
        
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="Start typing here to test keystroke detection...\n\nTry different patterns:\n- Normal typing\n- Copy and paste text\n- Very fast typing\n- Robotic/automated patterns"
          style={{
            width: '100%',
            height: 120,
            padding: 10,
            border: '1px solid #ddd',
            borderRadius: 4,
            fontSize: 14,
            fontFamily: 'monospace',
            resize: 'vertical'
          }}
        />
        
        <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
          <button
            onClick={() => setTestText('')}
            style={{
              padding: '6px 12px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Clear Text
          </button>
          
          <button
            onClick={() => {
              const sampleText = "This is a sample text for testing keystroke patterns. It includes various words and phrases that can help analyze typing behavior, speed, and consistency.";
              setTestText(sampleText);
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Load Sample Text
          </button>
        </div>
        
        <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
          Character count: {testText.length} | 
          Word count: {testText.trim() ? testText.trim().split(/\s+/).length : 0}
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={submit} 
          disabled={(risk === null && !securityError) || done}
          style={{
            padding: '12px 24px',
            backgroundColor: done ? '#4CAF50' : securityError ? '#FF9800' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 16,
            cursor: ((risk === null && !securityError) || done) ? 'not-allowed' : 'pointer',
            opacity: ((risk === null && !securityError) || done) ? 0.6 : 1
          }}
        >
          {done ? '✅ Submitted' : securityError ? '⚠️ Submit (Security Warning)' : 'Submit Exam'}
        </button>


      </div>

      {isKioskMode && (
        <div style={{
          marginTop: 30,
          padding: 15,
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: 6,
          color: '#856404'
        }}>
          <strong>🔒 Secure Exam Mode Active</strong>
          <br />
          You are currently in a secured testing environment. 
          Attempting to leave this window or access other applications may result in exam termination.
        </div>
      )}
    </div>
  );
}