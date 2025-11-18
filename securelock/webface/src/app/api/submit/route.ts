import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

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

interface SubmissionData {
  securityData: {
    risk?: number;
    vm?: boolean;
    rdp?: boolean;
    suspicious_processes?: boolean;
    monitor_count?: number;
    suspicious_monitors?: boolean;
    timestamp?: number;
    signature?: string;
    tab_switch_count?: number;
    last_tab_switch_time?: number;
    keystroke_data?: KeystrokeData;
  };
  securityError: string | null;
  sessionToken: string | null;
  timestamp: string;
  userAgent: string;
  screenResolution: string;
  isSecureMode: boolean;
  testText?: string;
}

export async function POST(request: NextRequest) {
  try {
    const submissionData: SubmissionData = await request.json();
    
    // Generate unique submission ID
    const submissionId = `sub_${Date.now()}_${randomBytes(4).toString('hex')}`;
    
    // Validate session token format
    const validToken = submissionData.sessionToken?.match(/^exam_\d+_[a-z0-9]+$/);
    if (!validToken && submissionData.isSecureMode) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Invalid session token' 
      }, { status: 400 });
    }

    // Log comprehensive submission data
    console.log('=== EXAM SUBMISSION ===');
    console.log('Submission ID:', submissionId);
    console.log('Timestamp:', submissionData.timestamp);
    console.log('Session Token:', submissionData.sessionToken);
    console.log('Secure Mode:', submissionData.isSecureMode);
    console.log('Security Status:', submissionData.securityError || 'OK');
    
    // Security Data
    console.log('--- SECURITY ANALYSIS ---');
    console.log('Overall Risk Score:', submissionData.securityData?.risk || 0);
    console.log('VM Detection:', submissionData.securityData?.vm ? 'DETECTED' : 'CLEAN');
    console.log('RDP Session:', submissionData.securityData?.rdp ? 'ACTIVE' : 'NONE');
    console.log('Suspicious Processes:', submissionData.securityData?.suspicious_processes ? 'FOUND' : 'CLEAN');
    console.log('Monitor Count:', submissionData.securityData?.monitor_count || 1);
    console.log('Tab Switch Count:', submissionData.securityData?.tab_switch_count || 0);
    
    // Keystroke Analysis
    if (submissionData.securityData?.keystroke_data) {
      const kd = submissionData.securityData.keystroke_data;
      console.log('--- KEYSTROKE ANALYSIS ---');
      console.log('Total Keystrokes:', kd.totalKeystrokes);
      console.log('Typing Speed:', Math.round(kd.avgTypingSpeed), 'WPM');
      console.log('Paste Count:', kd.pasteCount);
      console.log('Rapid Bursts:', kd.rapidBursts);
      console.log('Backspace Ratio:', (kd.backspaceRatio * 100).toFixed(1) + '%');
      console.log('Keystroke Risk Score:', kd.riskScore + '/10');
      
      if (kd.recentSuspicious.length > 0) {
        console.log('Suspicious Events:');
        kd.recentSuspicious.forEach((event, index) => {
          console.log(`  ${index + 1}. ${event.type} (${event.severity}) - ${new Date(event.timestamp).toLocaleTimeString()}`);
          if (event.details) {
            console.log(`     Details: ${JSON.stringify(event.details)}`);
          }
        });
      }
    }
    
    // Test Text Analysis
    if (submissionData.testText && submissionData.testText.length > 0) {
      console.log('--- TEST TEXT ANALYSIS ---');
      console.log('Text Length:', submissionData.testText.length, 'characters');
      console.log('Word Count:', submissionData.testText.trim().split(/\s+/).length);
      console.log('Sample Text Preview:', submissionData.testText.substring(0, 100) + (submissionData.testText.length > 100 ? '...' : ''));
    }
    
    console.log('--- SYSTEM INFO ---');
    console.log('User Agent:', submissionData.userAgent);
    console.log('Screen Resolution:', submissionData.screenResolution);
    console.log('=========================');
    
    // TODO: Integration points for production:
    // - Store in database (MongoDB, PostgreSQL, etc.)
    // - Send webhook to exam management system
    // - Validate security signature
    // - Generate PDF report
    // - Send notification email
    // - Archive session data
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return NextResponse.json({ 
      ok: true, 
      message: 'Exam submitted successfully',
      submissionId,
      timestamp: new Date().toISOString(),
      securityStatus: submissionData.securityError ? 'WARNING' : 'SECURE'
    });
    
  } catch (error) {
    console.error('Submit API error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: 'Failed to process submission' 
    }, { status: 500 });
  }
}