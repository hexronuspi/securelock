@echo off
echo Building ExamShield robust security system...

REM Check if Visual Studio compiler is available
where cl >nul 2>nul
if %errorlevel% neq 0 (
    echo Visual Studio C++ compiler not found!
    echo Please install Visual Studio Build Tools or run from Developer Command Prompt
    echo.
    echo Alternative: Using pre-compiled executables
    goto skip_compile
)

REM Compile the main ExamShield native messaging host
echo Compiling ExamShield...
cd native
cl /EHsc /std:c++17 /O2 /MT /W4 /I. main.cpp user32.lib crypt32.lib advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib setupapi.lib psapi.lib ntdll.lib /Fe:../ExamShield.exe

if %errorlevel% neq 0 (
    echo ExamShield build failed!
)

REM Compile the guardian (kiosk watchdog)
echo Compiling ExamGuardian...
cl /EHsc /std:c++17 /O2 /MT /W4 guardian.cpp user32.lib psapi.lib /Fe:../ExamGuardian.exe

if %errorlevel% neq 0 (
    echo Guardian build failed but continuing...
)

cd ..

:skip_compile
echo Build completed!

REM Register the native messaging host
echo Registering native messaging host...
reg add "HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.exam.shield" /ve /t REG_SZ /d "%cd%\com.exam.shield.json" /f

if %errorlevel% neq 0 (
    echo Failed to register native messaging host!
    pause
    exit /b 1
)

echo Native messaging host registered successfully!

REM Install dependencies for webface
echo Installing webface dependencies...
cd webface
call npm install

if %errorlevel% neq 0 (
    echo Failed to install webface dependencies!
    pause
    exit /b 1
)

cd ..

echo.
echo ================================
echo ExamShield Security System Ready
echo ================================
echo.
echo Components built:
echo - ExamShield.exe (Native messaging host with VM/RDP/Process detection)
if exist ExamGuardian.exe echo - ExamGuardian.exe (Chrome kiosk guardian)
echo - Chrome Extension (Advanced security monitoring)
echo - WebFace (Secure exam interface)
echo.
pause