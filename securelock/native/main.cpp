//cl /EHsc /std:c++17 /O2 /MT /W4 /I. main.cpp user32.lib crypt32.lib advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib setupapi.lib psapi.lib ntdll.lib /Fe:ExamShield.exe
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "setupapi.lib")
#pragma comment(lib, "psapi.lib")
#pragma comment(lib, "ntdll.lib")

#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
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
#include <json.hpp>

using json = nlohmann::json;

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

bool checkSuspiciousProcesses() {
    const char* suspiciousProcesses[] = {
        "vmtoolsd.exe", "VBoxTray.exe", "VBoxClient.exe", "VBoxService.exe",
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
    hr = pLoc->ConnectServer(_bstr_t(L"ROOT\\CIMV2"), NULL, NULL, 0, NULL, 0, 0, &pSvc);
    if (FAILED(hr)) goto cleanup;
    
    // Set security levels
    hr = CoSetProxyBlanket(pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, NULL,
                          RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE);
    if (FAILED(hr)) goto cleanup;
    
    // Query Win32_ComputerSystem
    IEnumWbemClassObject* pEnumerator = NULL;
    hr = pSvc->ExecQuery(bstr_t("WQL"), 
                        bstr_t("SELECT * FROM Win32_ComputerSystem"),
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
    if (pSvc) pSvc->Release();
    if (pLoc) pLoc->Release();
    CoUninitialize();
    
    return isVM;
}

int countMonitors() {
    int count = 0;
    
    // Use SetupAPI to enumerate monitors
    HDEVINFO hDevInfo = SetupDiGetClassDevs(&GUID_DEVINTERFACE_MONITOR, NULL, NULL, 
                                           DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (hDevInfo == INVALID_HANDLE_VALUE) return 1;
    
    SP_DEVICE_INTERFACE_DATA deviceInterfaceData;
    deviceInterfaceData.cbSize = sizeof(SP_DEVICE_INTERFACE_DATA);
    
    for (DWORD i = 0; SetupDiEnumDeviceInterfaces(hDevInfo, NULL, &GUID_DEVINTERFACE_MONITOR, 
                                                  i, &deviceInterfaceData); i++) {
        count++;
    }
    
    SetupDiDestroyDeviceInfoList(hDevInfo);
    return count > 0 ? count : 1; // Default to 1 if enumeration fails
}

bool checkSuspiciousMonitors() {
    // This would require WMI query for WmiMonitorID
    // Simplified version - just check monitor count
    return countMonitors() > 2; // More than 2 monitors suspicious
}

bool isVirtualMachine() {
    // Multiple detection methods
    bool vmDetected = false;
    
    // 1. CPUID hypervisor bit
    int cpuInfo[4] = {};
    __cpuid(cpuInfo, 1);
    bool hypervisorBit = (cpuInfo[2] >> 31) & 1;
    
    // 2. Check WMI
    if (checkVMWMI()) vmDetected = true;
    
    // 3. Check registry
    if (checkVMRegistry()) vmDetected = true;
    
    // 4. Check processes
    if (checkSuspiciousProcesses()) vmDetected = true;
    
    // 5. If hypervisor bit is set but no other indicators, 
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
            
            // Calculate risk score
            int riskScore = 0;
            if (vm) riskScore += 70;
            if (rdp) riskScore += 30;
            if (suspiciousProcesses) riskScore += 40;
            if (suspiciousMonitors) riskScore += 20;
            
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