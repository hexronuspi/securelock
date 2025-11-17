@echo off
setlocal enabledelayedexpansion
echo Building ExamShield robust security system...

REM Check if Visual Studio compiler is available
where cl >nul 2>nul
if %errorlevel% neq 0 (
    echo Visual Studio C++ compiler not found!
    echo.
    echo Trying alternative compilers...
    
    REM Check for MinGW g++
    g++ --version >nul 2>nul
    if !errorlevel! equ 0 (
        echo Found g++ compiler, using MinGW...
        goto compile_with_mingw
    )
    
    REM Check for clang++
    where clang++ >nul 2>nul
    if %errorlevel% equ 0 (
        echo Found clang++ compiler...
        goto compile_with_clang
    )
    
    echo No suitable compiler found!
    echo.
    echo Please install one of the following:
    echo 1. Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
    echo 2. MinGW-w64: https://www.mingw-w64.org/downloads/
    echo 3. Clang/LLVM: https://releases.llvm.org/download.html
    echo.
    echo Cannot build ExamShield.exe without a C++ compiler!
    pause
    exit /b 1
)

REM Compile the main ExamShield native messaging host
echo Compiling ExamShield with Visual Studio...
cd native
cl /EHsc /std:c++17 /O2 /MT /W4 /I. main.cpp user32.lib crypt32.lib advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib setupapi.lib psapi.lib ntdll.lib /Fe:../ExamShield.exe

if %errorlevel% neq 0 (
    echo ExamShield build failed!
    cd ..
    pause
    exit /b 1
)

REM Compile the guardian (kiosk watchdog)
echo Compiling ExamGuardian...
cl /EHsc /std:c++17 /O2 /MT /W4 guardian.cpp user32.lib psapi.lib /Fe:../ExamGuardian.exe

if %errorlevel% neq 0 (
    echo Guardian build failed but continuing...
)

cd ..
goto build_complete

:compile_with_mingw
echo Compiling ExamShield with MinGW g++...
cd native
g++ -std=c++17 -O2 -static -Wall -I. main.cpp -luser32 -lcrypt32 -ladvapi32 -lwbemuuid -lole32 -loleaut32 -lsetupapi -lpsapi -lntdll -o ../ExamShield.exe

if %errorlevel% neq 0 (
    echo ExamShield build failed with MinGW!
    cd ..
    pause
    exit /b 1
)

echo Compiling ExamGuardian with MinGW g++...
g++ -std=c++17 -O2 -static -Wall guardian.cpp -luser32 -lpsapi -o ../ExamGuardian.exe

if %errorlevel% neq 0 (
    echo Guardian build failed but continuing...
)

cd ..
goto build_complete

:compile_with_clang
echo Compiling ExamShield with Clang++...
cd native
clang++ -std=c++17 -O2 -static -Wall -I. main.cpp -luser32 -lcrypt32 -ladvapi32 -lwbemuuid -lole32 -loleaut32 -lsetupapi -lpsapi -lntdll -o ../ExamShield.exe

if %errorlevel% neq 0 (
    echo ExamShield build failed with Clang!
    cd ..
    pause
    exit /b 1
)

echo Compiling ExamGuardian with Clang++...
clang++ -std=c++17 -O2 -static -Wall guardian.cpp -luser32 -lpsapi -o ../ExamGuardian.exe

if %errorlevel% neq 0 (
    echo Guardian build failed but continuing...
)

cd ..
goto build_complete

:build_complete

echo Build completed successfully!

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