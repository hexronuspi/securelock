//cl /EHsc /std:c++17 /O2 /MT /W4 /I. main.cpp user32.lib crypt32.lib advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib setupapi.lib psapi.lib ntdll.lib /Fe:ExamShield.exe
#ifdef _MSC_VER
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "setupapi.lib")
#pragma comment(lib, "psapi.lib")
#pragma comment(lib, "ntdll.lib")
#endif

#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <wincrypt.h>
#include <intrin.h>
#include <io.h>
#include <fcntl.h>
#include <iostream>
#include <string>
#include <sstream>
#include <chrono>
#include <vector>
#include <cstring>
#include <algorithm>
#include <wbemidl.h>
#include <comdef.h>
#include <setupapi.h>
#include <devguid.h>
#include <ntddvdeo.h>
#include <psapi.h>
#include <tlhelp32.h>
#include <winternl.h>
#include <deque>
#include <cmath>
#include <json.hpp>

using json = nlohmann::json;

// Keystroke monitoring structures
struct KeyEvent {
    DWORD vkCode;
    DWORD timestamp;
    bool isKeyDown;
    bool isInjected;
};

class KeystrokeMonitor {
public:
    std::deque<KeyEvent> keyEvents;
    HHOOK keyboardHook;
    int totalKeystrokes;
    int injectedKeystrokes;
    double avgInterval;
    double typingVariance;
    int rapidSequences;
    
    KeystrokeMonitor() : keyboardHook(nullptr), totalKeystrokes(0), 
                        injectedKeystrokes(0), avgInterval(0), 
                        typingVariance(0), rapidSequences(0) {}
    
    void startMonitoring();
    void stopMonitoring();
    void analyzeKeystrokes();
    int calculateKeystrokeRisk();
    json getKeystrokeData();
    
private:
    static LRESULT CALLBACK KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam);
    void processKeyEvent(DWORD vkCode, bool isKeyDown, bool isInjected);
    double calculateVariance(const std::vector<double>& intervals);
    bool isMeaningfulKeystroke(DWORD vkCode);
};

static KeystrokeMonitor* g_keystrokeMonitor = nullptr;

const char* PRIVATE_KEY = "d4f8b2c1e5a7f3b9c6d2e8f1a4b7c5e9f2a6b3c7d1e5f8a2b6c9d3e7f1a5b8c2e6";

std::string base64(const std::string& in) {
    DWORD len = 0;
    CryptBinaryToStringA((BYTE*)in.data(), (DWORD)in.size(),
                         CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF,
                         nullptr, &len);
    std::string out(len - 1, '\0');
    CryptBinaryToStringA((BYTE*)in.data(), (DWORD)in.size(),
                         CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF,
                         &out[0], &len);
    return out;
}

std::string sha256(const std::string& data) {
    HCRYPTPROV hProv;
    HCRYPTHASH hHash;
    std::string result;
    
    if (CryptAcquireContext(&hProv, NULL, NULL, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) {
        if (CryptCreateHash(hProv, CALG_SHA_256, 0, 0, &hHash)) {
            if (CryptHashData(hHash, (BYTE*)data.data(), (DWORD)data.size(), 0)) {
                DWORD hashLen = 32;
                result.resize(32);
                CryptGetHashParam(hHash, HP_HASHVAL, (BYTE*)result.data(), &hashLen, 0);
            }
            CryptDestroyHash(hHash);
        }
        CryptReleaseContext(hProv, 0);
    }
    return result;
}

std::string signData(const std::string& data) {
    // Simplified ECDSA signing (use proper crypto library in production)
    auto hash = sha256(data + PRIVATE_KEY);
    return base64(hash);
}

bool isRdpSession() {
    return GetSystemMetrics(SM_REMOTESESSION) != 0;
}

bool checkVMProcesses() {
    // VM-specific processes only
    const char* vmProcesses[] = {
        "vmtoolsd.exe", "VBoxTray.exe", "VBoxClient.exe", "VBoxService.exe",
        "vmware.exe", "vmwareuser.exe", "vmwaretray.exe", "vmsrvc.exe",
        "xenservice.exe"
    };
    
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE) return false;
    
    PROCESSENTRY32 pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32);
    
    if (!Process32First(hSnapshot, &pe32)) {
        CloseHandle(hSnapshot);
        return false;
    }
    
    do {
        for (const char* vmProc : vmProcesses) {
            if (_stricmp(pe32.szExeFile, vmProc) == 0) {
                CloseHandle(hSnapshot);
                return true;
            }
        }
    } while (Process32Next(hSnapshot, &pe32));
    
    CloseHandle(hSnapshot);
    return false;
}

bool checkSuspiciousProcesses() {
    // Remote access processes only (not VM processes)
    const char* suspiciousProcesses[] = {
        "tv_x64.exe", "TeamViewer_Service.exe", "TeamViewer.exe",
        "AnyDesk.exe", "anydesk.exe", "RemotePC.exe",
        "chrome_remote_desktop_host.exe", "rdpclip.exe",
        "logmein.exe", "gotomypc.exe", "screenconnect.exe",
        "ammyy.exe", "uvnc.exe", "winvnc.exe", "vncviewer.exe"
    };
    
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE) return false;
    
    PROCESSENTRY32 pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32);
    
    bool found = false;
    if (Process32First(hSnapshot, &pe32)) {
        do {
            for (const char* proc : suspiciousProcesses) {
                if (_stricmp(pe32.szExeFile, proc) == 0) {
                    found = true;
                    break;
                }
            }
        } while (Process32Next(hSnapshot, &pe32) && !found);
    }
    
    CloseHandle(hSnapshot);
    return found;
}

bool checkVMRegistry() {
    HKEY hKey;
    
    // Check VMware registry keys
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\VMware, Inc.\\VMware Tools", 
                     0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        RegCloseKey(hKey);
        return true;
    }
    
    // Check VirtualBox registry keys
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Oracle\\VirtualBox Guest Additions", 
                     0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        RegCloseKey(hKey);
        return true;
    }
    
    // Check system manufacturer
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, 
                     "SYSTEM\\CurrentControlSet\\Control\\SystemInformation", 
                     0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        char manufacturer[256] = {0};
        DWORD size = sizeof(manufacturer);
        if (RegQueryValueExA(hKey, "SystemManufacturer", NULL, NULL, 
                           (BYTE*)manufacturer, &size) == ERROR_SUCCESS) {
            if (strstr(manufacturer, "VMware") || strstr(manufacturer, "VirtualBox") ||
                strstr(manufacturer, "QEMU") || strstr(manufacturer, "Xen")) {
                RegCloseKey(hKey);
                return true;
            }
        }
        RegCloseKey(hKey);
    }
    
    return false;
}

bool checkVMWMI() {
    HRESULT hr;
    IWbemLocator* pLoc = NULL;
    IWbemServices* pSvc = NULL;
    IEnumWbemClassObject* pEnumerator = NULL;
    BSTR strNetworkResource = NULL;
    BSTR strQueryLanguage = NULL;
    BSTR strQuery = NULL;
    bool isVM = false;
    
    // Initialize COM
    hr = CoInitializeEx(0, COINIT_MULTITHREADED);
    if (FAILED(hr)) return false;
    
    // Initialize security
    hr = CoInitializeSecurity(NULL, -1, NULL, NULL, RPC_C_AUTHN_LEVEL_NONE, 
                             RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE, NULL);
    
    // Get WMI locator
    hr = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER, 
                         IID_IWbemLocator, (LPVOID*)&pLoc);
    if (FAILED(hr)) goto cleanup;
    
    // Connect to WMI
    strNetworkResource = SysAllocString(L"ROOT\\CIMV2");
    hr = pLoc->ConnectServer(strNetworkResource, NULL, NULL, 0, 0L, 0, 0, &pSvc);
    if (FAILED(hr)) goto cleanup;
    
    // Set security levels
    hr = CoSetProxyBlanket(pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, NULL,
                          RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE);
    if (FAILED(hr)) goto cleanup;
    
    // Query Win32_ComputerSystem
    strQueryLanguage = SysAllocString(L"WQL");
    strQuery = SysAllocString(L"SELECT * FROM Win32_ComputerSystem");
    hr = pSvc->ExecQuery(strQueryLanguage, strQuery,
                        WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, 
                        NULL, &pEnumerator);
    
    if (SUCCEEDED(hr)) {
        IWbemClassObject* pclsObj = NULL;
        ULONG uReturn = 0;
        
        while (pEnumerator) {
            hr = pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn);
            if (uReturn == 0) break;
            
            VARIANT vtProp;
            
            // Check HypervisorPresent
            hr = pclsObj->Get(L"HypervisorPresent", 0, &vtProp, 0, 0);
            if (SUCCEEDED(hr) && vtProp.vt == VT_BOOL && vtProp.boolVal) {
                isVM = true;
            }
            VariantClear(&vtProp);
            
            // Check Manufacturer
            hr = pclsObj->Get(L"Manufacturer", 0, &vtProp, 0, 0);
            if (SUCCEEDED(hr) && vtProp.vt == VT_BSTR) {
                std::wstring manufacturer = vtProp.bstrVal;
                if (manufacturer.find(L"VMware") != std::wstring::npos ||
                    manufacturer.find(L"VirtualBox") != std::wstring::npos ||
                    manufacturer.find(L"QEMU") != std::wstring::npos ||
                    manufacturer.find(L"Xen") != std::wstring::npos) {
                    isVM = true;
                }
            }
            VariantClear(&vtProp);
            
            // Check Model
            hr = pclsObj->Get(L"Model", 0, &vtProp, 0, 0);
            if (SUCCEEDED(hr) && vtProp.vt == VT_BSTR) {
                std::wstring model = vtProp.bstrVal;
                if (model.find(L"Virtual") != std::wstring::npos ||
                    model.find(L"VMware") != std::wstring::npos) {
                    isVM = true;
                }
            }
            VariantClear(&vtProp);
            
            pclsObj->Release();
        }
        pEnumerator->Release();
    }
    
cleanup:
    if (strNetworkResource) SysFreeString(strNetworkResource);
    if (strQueryLanguage) SysFreeString(strQueryLanguage);
    if (strQuery) SysFreeString(strQuery);
    if (pEnumerator) pEnumerator->Release();
    if (pSvc) pSvc->Release();
    if (pLoc) pLoc->Release();
    CoUninitialize();
    
    return isVM;
}

// Monitor enumeration callback
BOOL CALLBACK MonitorEnumProc(HMONITOR hMonitor, HDC hdcMonitor, LPRECT lprcMonitor, LPARAM dwData) {
    int* count = (int*)dwData;
    (*count)++;
    return TRUE;
}

int countMonitors() {
    int count = 0;
    
    // Use EnumDisplayMonitors - more reliable method
    if (EnumDisplayMonitors(NULL, NULL, MonitorEnumProc, (LPARAM)&count)) {
        return count > 0 ? count : 1; // Default to 1 if no monitors found
    }
    
    // Fallback: Use GetSystemMetrics
    int cxVirtualScreen = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int cyVirtualScreen = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    
    // If virtual screen is larger than primary, likely multiple monitors
    if (cxVirtualScreen > GetSystemMetrics(SM_CXSCREEN) || 
        cyVirtualScreen > GetSystemMetrics(SM_CYSCREEN)) {
        return 2; // Assume 2 monitors if virtual screen is larger
    }
    
    return 1; // Default to 1 monitor
}

// Keystroke monitoring implementation
void KeystrokeMonitor::startMonitoring() {
    g_keystrokeMonitor = this;
    keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, GetModuleHandle(NULL), 0);
    if (keyboardHook == nullptr) {
        std::cerr << "Failed to install keyboard hook: " << GetLastError() << std::endl;
    }
}

void KeystrokeMonitor::stopMonitoring() {
    if (keyboardHook) {
        UnhookWindowsHookEx(keyboardHook);
        keyboardHook = nullptr;
    }
    g_keystrokeMonitor = nullptr;
}

LRESULT CALLBACK KeystrokeMonitor::KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode >= 0 && g_keystrokeMonitor) {
        KBDLLHOOKSTRUCT* pKeyboard = (KBDLLHOOKSTRUCT*)lParam;
        bool isKeyDown = (wParam == WM_KEYDOWN) || (wParam == WM_SYSKEYDOWN);
        bool isInjected = (pKeyboard->flags & LLKHF_INJECTED) != 0;
        
        g_keystrokeMonitor->processKeyEvent(pKeyboard->vkCode, isKeyDown, isInjected);
    }
    
    return CallNextHookEx(NULL, nCode, wParam, lParam);
}

void KeystrokeMonitor::processKeyEvent(DWORD vkCode, bool isKeyDown, bool isInjected) {
    if (!isKeyDown) return; // Only process key down events
    
    KeyEvent event;
    event.vkCode = vkCode;
    event.timestamp = GetTickCount();
    event.isKeyDown = isKeyDown;
    event.isInjected = isInjected;
    
    keyEvents.push_back(event);
    
    // Keep only last 2000 events (increased for better analysis)
    if (keyEvents.size() > 2000) {
        keyEvents.pop_front();
    }
    
    totalKeystrokes++;
    if (isInjected) {
        injectedKeystrokes++;
    }
    
    // Analyze patterns every 100 keystrokes (less frequent)
    if (totalKeystrokes % 100 == 0) {
        analyzeKeystrokes();
    }
}

bool KeystrokeMonitor::isMeaningfulKeystroke(DWORD vkCode) {
    // Filter out navigation and modifier keys
    if (vkCode >= VK_F1 && vkCode <= VK_F24) return false; // Function keys
    if (vkCode == VK_SHIFT || vkCode == VK_CONTROL || vkCode == VK_MENU) return false; // Modifiers
    if (vkCode == VK_CAPITAL || vkCode == VK_NUMLOCK || vkCode == VK_SCROLL) return false; // Lock keys
    if (vkCode >= VK_PRIOR && vkCode <= VK_DELETE) return false; // Navigation keys
    if (vkCode >= VK_LEFT && vkCode <= VK_DOWN) return false; // Arrow keys
    if (vkCode == VK_RETURN || vkCode == VK_TAB || vkCode == VK_ESCAPE) return false; // Formatting
    if (vkCode == VK_SPACE || vkCode == VK_BACK) return false; // Space and backspace
    
    // Include alphanumeric and symbol keys
    return (vkCode >= 0x30 && vkCode <= 0x5A) || // 0-9, A-Z
           (vkCode >= VK_OEM_1 && vkCode <= VK_OEM_3) || // ;,-./, `
           (vkCode >= VK_OEM_4 && vkCode <= VK_OEM_8); // [\]', etc
}

void KeystrokeMonitor::analyzeKeystrokes() {
    if (keyEvents.size() < 20) return;
    
    // Filter meaningful keystrokes only
    std::vector<KeyEvent> meaningfulKeys;
    for (const auto& event : keyEvents) {
        if (isMeaningfulKeystroke(event.vkCode)) {
            meaningfulKeys.push_back(event);
        }
    }
    
    if (meaningfulKeys.size() < 10) return;
    
    std::vector<double> intervals;
    int sampleSize = (meaningfulKeys.size() < 100) ? (int)meaningfulKeys.size() : 100;
    auto startIt = meaningfulKeys.end() - sampleSize;
    
    for (auto current = startIt + 1; current != meaningfulKeys.end(); ++current) {
        auto previous = current - 1;
        double interval = current->timestamp - previous->timestamp;
        // Filter out long pauses (thinking time)
        if (interval < 5000) { // Less than 5 seconds
            intervals.push_back(interval);
        }
    }
    
    if (intervals.size() < 5) return;
    
    // Calculate average interval
    double sum = 0;
    for (double interval : intervals) {
        sum += interval;
    }
    avgInterval = sum / intervals.size();
    
    // Calculate variance
    typingVariance = calculateVariance(intervals);
    
    // Detect rapid sequences (very conservative for coding)
    int rapidCount = 0;
    for (double interval : intervals) {
        if (interval < 10) { // Less than 10ms between meaningful keystrokes
            rapidCount++;
        }
    }
    
    // Only flag if majority of intervals are extremely rapid AND we have substantial data
    if (rapidCount > intervals.size() * 0.7 && intervals.size() > 50) {
        rapidSequences++;
    }
}

double KeystrokeMonitor::calculateVariance(const std::vector<double>& intervals) {
    if (intervals.size() < 2) return 0;
    
    double mean = 0;
    for (double interval : intervals) {
        mean += interval;
    }
    mean /= intervals.size();
    
    double variance = 0;
    for (double interval : intervals) {
        variance += (interval - mean) * (interval - mean);
    }
    variance /= intervals.size();
    
    return variance;
}

int KeystrokeMonitor::calculateKeystrokeRisk() {
    int risk = 0;
    
    // High injection rate (very lenient for coding)
    if (totalKeystrokes > 200) { // Require substantial keystrokes before flagging
        double injectionRate = (double)injectedKeystrokes / totalKeystrokes;
        if (injectionRate > 0.3) risk += 3; // More than 30% injected
        else if (injectionRate > 0.2) risk += 1; // More than 20% injected
    }
    
    // Suspicious timing patterns (very strict)
    if (typingVariance < 25 && avgInterval < 15 && totalKeystrokes > 500) {
        risk += 2; // Only flag with massive data and extreme consistency
    }
    
    // Too many rapid sequences (very lenient)
    if (rapidSequences > 20) { // Much higher threshold
        risk += 1; // Minimal penalty
    }
    
    // Impossibly fast typing (extremely lenient)
    if (avgInterval > 0 && avgInterval < 10 && totalKeystrokes > 200) {
        risk += 2; // Only flag truly impossible speeds
    }
    
    return (risk < 10) ? risk : 10; // Cap at 10
}

json KeystrokeMonitor::getKeystrokeData() {
    json data;
    data["totalKeystrokes"] = totalKeystrokes;
    data["injectedKeystrokes"] = injectedKeystrokes;
    data["injectionRate"] = totalKeystrokes > 0 ? (double)injectedKeystrokes / totalKeystrokes : 0;
    data["avgInterval"] = avgInterval;
    data["typingVariance"] = typingVariance;
    data["rapidSequences"] = rapidSequences;
    data["riskScore"] = calculateKeystrokeRisk();
    data["wpm"] = avgInterval > 0 ? (60000.0 / avgInterval) / 4.0 : 0; // Assuming 4 chars per word for coding
    
    return data;
}

bool checkSuspiciousMonitors() {
    // Flag only if more than 1 monitor (multiple displays could enable cheating)
    // Single monitor (1) = OK, Multiple monitors (2+) = Suspicious
    int monitors = countMonitors();
    return monitors != 1;
}

bool isVirtualMachine() {
    // Multiple detection methods - require at least 2 indicators to reduce false positives
    int vmIndicators = 0;
    bool vmDetected = false;
    
    // 1. CPUID hypervisor bit (can be false positive on Windows 10+ with Hyper-V)
    int cpuInfo[4] = {};
    __cpuid(cpuInfo, 1);
    bool hypervisorBit = (cpuInfo[2] >> 31) & 1;
    if (hypervisorBit) vmIndicators++;
    
    // 2. Check WMI (strong indicator)
    if (checkVMWMI()) vmIndicators += 2;
    
    // 3. Check registry (strong indicator)
    if (checkVMRegistry()) vmIndicators += 2;
    
    // 4. Check VM-specific processes (strong indicator)
    if (checkVMProcesses()) vmIndicators += 2;
    
    // Require at least 3 indicators to flag as VM (reduces false positives) 
    //    it's likely just Windows security features
    if (hypervisorBit && !vmDetected) {
        // Check for common VM hypervisor signatures
        __cpuid(cpuInfo, 0x40000000);
        char vendor[13] = {0};
        memcpy(vendor, &cpuInfo[1], 4);
        memcpy(vendor + 4, &cpuInfo[2], 4);
        memcpy(vendor + 8, &cpuInfo[3], 4);
        
        if (strstr(vendor, "VMwareVMware") ||
            strstr(vendor, "VBoxVBoxVBox") ||
            strstr(vendor, "KVMKVMKVM") ||
            strstr(vendor, "XenVMMXenVMM")) {
            vmDetected = true;
        }
    }
    
    return vmDetected;
}

std::string findChromePath() {
    const char* chromePaths[] = {
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"
    };
    
    for (const char* path : chromePaths) {
        char expandedPath[MAX_PATH];
        ExpandEnvironmentStringsA(path, expandedPath, MAX_PATH);
        
        if (GetFileAttributesA(expandedPath) != INVALID_FILE_ATTRIBUTES) {
            return std::string(expandedPath);
        }
    }
    
    return "";
}

bool launchKioskChrome(const std::string& token) {
    std::string chromePath = findChromePath();
    if (chromePath.empty()) {
        return false; // Chrome not found
    }
    
    std::ostringstream cmdLine;
    cmdLine << "\"" << chromePath << "\" "
            << "--chrome-frame "
            << "--kiosk "
            << "--fullscreen "
            << "--incognito "
            << "--disable-pinch "
            << "--disable-extensions "
            << "--disable-developer-mode "
            << "--disable-session-restore "
            << "--no-first-run "
            << "--disable-features=TranslateUI,AudioServiceOutOfProcess "
            << "--app=http://localhost:3000?token=" << token;
    
    STARTUPINFOA si = {0};
    PROCESS_INFORMATION pi = {0};
    si.cb = sizeof(si);
    
    return CreateProcessA(NULL, (LPSTR)cmdLine.str().c_str(), NULL, NULL, 
                         FALSE, 0, NULL, NULL, &si, &pi);
}

void send(const json& j) {
    std::string s = j.dump();
    uint32_t len = (uint32_t)s.size();
    fwrite(&len, 4, 1, stdout);
    fwrite(s.data(), 1, len, stdout);
    fflush(stdout);
}

json recv() {
    uint32_t len = 0;
    if (fread(&len, 4, 1, stdin) != 1) exit(0);
    std::string buf(len, '\0');
    if (fread(&buf[0], 1, len, stdin) != len) exit(0);
    return json::parse(buf);
}

int main() {
    SetConsoleCP(65001);
    SetConsoleOutputCP(65001);
    _setmode(_fileno(stdin),  _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);

    try {
        while (true) {
            json req = recv();
            json rep;

            // Get current timestamp
            auto now = std::chrono::system_clock::now();
            auto timestamp = std::chrono::duration_cast<std::chrono::seconds>(
                now.time_since_epoch()).count();
            
            // Perform all security checks
            bool vm = isVirtualMachine();
            bool rdp = isRdpSession();
            bool suspiciousProcesses = checkSuspiciousProcesses();
            bool suspiciousMonitors = checkSuspiciousMonitors();
            int monitorCount = countMonitors();
            
            // Initialize keystroke monitoring
            static KeystrokeMonitor keystrokeMonitor;
            static bool keystrokeInitialized = false;
            
            if (!keystrokeInitialized) {
                keystrokeMonitor.startMonitoring();
                keystrokeInitialized = true;
            }
            
            // Calculate risk score (adjusted to total 100)
            int riskScore = 0;
            if (vm) riskScore += 47;  // Reduced from 50
            if (rdp) riskScore += 27;  // Reduced from 30
            if (suspiciousProcesses) riskScore += 36;  // Reduced from 40
            if (suspiciousMonitors) riskScore += 27;  // Reduced from 30
            
            // Add keystroke risk (up to 10 points)
            int keystrokeRisk = keystrokeMonitor.calculateKeystrokeRisk();
            riskScore += keystrokeRisk;
            
            // Cap at 100
            if (riskScore > 100) riskScore = 100;
            
            // Build response
            rep["timestamp"] = timestamp;
            rep["risk"] = riskScore;
            rep["vm"] = vm;
            rep["rdp"] = rdp;
            rep["suspicious_processes"] = suspiciousProcesses;
            rep["monitor_count"] = monitorCount;
            rep["suspicious_monitors"] = suspiciousMonitors;
            rep["keystroke_data"] = keystrokeMonitor.getKeystrokeData();
            
            // Create tamper-proof signature
            std::string dataToSign = rep.dump();
            rep["signature"] = signData(dataToSign);
            
            // Handle special commands
            if (req.contains("command")) {
                std::string cmd = req["command"];
                if (cmd == "launch_kiosk") {
                    std::string token = req.value("token", "");
                    bool launched = launchKioskChrome(token);
                    rep["kiosk_launched"] = launched;
                    rep["chrome_path"] = findChromePath();
                }
            }
            
            send(rep);
        }
    } catch (...) {
        // Silent exit on error
    }
    
    return 0;
}