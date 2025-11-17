//cl /EHsc /std:c++17 /O2 /MT /W4 guardian.cpp user32.lib psapi.lib /Fe:ExamGuardian.exe
#ifdef _MSC_VER
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "psapi.lib")
#endif

#include <windows.h>
#include <psapi.h>
#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include <algorithm>

class ExamGuardian {
private:
    HWND chromeWindow;
    int violationCount;
    bool isRunning;
    std::string targetUrl;
    
public:
    ExamGuardian() : chromeWindow(nullptr), violationCount(0), isRunning(true) {
        targetUrl = "http://localhost:3000";
    }
    
    bool findChromeWindow() {
        chromeWindow = nullptr;
        EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
            ExamGuardian* self = (ExamGuardian*)lParam;
            
            char windowTitle[512];
            char className[256];
            GetWindowTextA(hwnd, windowTitle, sizeof(windowTitle));
            GetClassNameA(hwnd, className, sizeof(className));
            
            // Check if it's Chrome window with our URL
            if (strstr(className, "Chrome") && 
                (strstr(windowTitle, "localhost:3000") || strstr(windowTitle, "ExamShield"))) {
                self->chromeWindow = hwnd;
                return FALSE; // Stop enumeration
            }
            
            return TRUE; // Continue enumeration
        }, (LPARAM)this);
        
        return chromeWindow != nullptr;
    }
    
    bool isChromeInForeground() {
        HWND foregroundWindow = GetForegroundWindow();
        if (!foregroundWindow || !chromeWindow) return false;
        
        // Check if foreground window is Chrome or child of Chrome
        HWND parent = foregroundWindow;
        while (parent) {
            if (parent == chromeWindow) return true;
            parent = GetParent(parent);
        }
        
        return false;
    }
    
    void bringChromeToFront() {
        if (chromeWindow) {
            SetForegroundWindow(chromeWindow);
            ShowWindow(chromeWindow, SW_MAXIMIZE);
            SetActiveWindow(chromeWindow);
        }
    }
    
    bool isChromeRunning() {
        DWORD processes[1024];
        DWORD cbNeeded;
        
        if (!EnumProcesses(processes, sizeof(processes), &cbNeeded)) {
            return false;
        }
        
        int numProcesses = cbNeeded / sizeof(DWORD);
        
        for (int i = 0; i < numProcesses; i++) {
            if (processes[i] != 0) {
                HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 
                                            FALSE, processes[i]);
                if (hProcess) {
                    char processName[MAX_PATH];
                    if (GetModuleBaseNameA(hProcess, NULL, processName, sizeof(processName))) {
                        if (_stricmp(processName, "chrome.exe") == 0) {
                            CloseHandle(hProcess);
                            return true;
                        }
                    }
                    CloseHandle(hProcess);
                }
            }
        }
        
        return false;
    }
    
    void killChrome() {
        system("taskkill /F /IM chrome.exe");
    }
    
    void run() {
        std::cout << "ExamGuardian started. Monitoring Chrome kiosk mode..." << std::endl;
        
        while (isRunning) {
            // Check if Chrome is still running
            if (!isChromeRunning()) {
                std::cout << "Chrome process terminated. Watchdog stopping." << std::endl;
                break;
            }
            
            // Find Chrome window if we don't have it
            if (!chromeWindow) {
                findChromeWindow();
            }
            
            // Check if Chrome is in foreground
            if (!isChromeInForeground()) {
                violationCount++;
                std::cout << "Violation #" << violationCount << ": Chrome not in foreground" << std::endl;
                
                if (violationCount >= 3) {
                    std::cout << "Too many violations. Terminating exam." << std::endl;
                    killChrome();
                    // Report to server here
                    break;
                }
                
                bringChromeToFront();
            } else {
                // Reset violation count if Chrome is behaving
                if (violationCount > 0) {
                    violationCount = violationCount - 1;
                }
            }
            
            std::this_thread::sleep_for(std::chrono::seconds(2));
        }
    }
    
    void stop() {
        isRunning = false;
    }
};

int main() {
    ExamGuardian guardian;
    guardian.run();
    return 0;
}