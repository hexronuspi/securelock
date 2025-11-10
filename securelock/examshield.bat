@echo off
setlocal enabledelayedexpansion

echo ========================================
echo ExamShield Secure Testing Platform
echo Version 1.0
echo ========================================
echo.
echo Usage: examshield.bat [options]
echo   --windowed         Launch in windowed mode ^(for testing^)
echo   --auto             Skip confirmations
echo   --debug            Enable debug output
echo.
echo Note: Always uses your default Chrome profile where extension is installed
echo.
echo Initializing secure exam environment...
echo.

REM Check for admin privileges (recommended for kiosk mode)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Running without administrator privileges.
    echo For maximum security, run as administrator.
    echo.
)

REM Parse command line arguments
set KIOSK_MODE=true
set AUTO_CONFIRM=false
set DEBUG_MODE=false
set USE_DEFAULT_PROFILE=true

:parse_args
if "%1"=="--windowed" (
    set KIOSK_MODE=false
    shift
    goto parse_args
)
if "%1"=="--auto" (
    set AUTO_CONFIRM=true
    shift
    goto parse_args
)
if "%1"=="--debug" (
    set DEBUG_MODE=true
    shift
    goto parse_args
)
if not "%1"=="" (
    shift
    goto parse_args
)

REM Display mode information
if "%KIOSK_MODE%"=="true" (
    echo Mode: Secure Kiosk ^(Fullscreen, Restricted^)
) else (
    echo Mode: Windowed ^(Development/Testing^)
)

if "%DEBUG_MODE%"=="true" (
    echo Debug: Enabled
)

echo.

REM Security confirmation for kiosk mode
if "%KIOSK_MODE%"=="true" if "%AUTO_CONFIRM%"=="false" (
    echo WARNING: Kiosk mode will:
    echo - Launch Chrome in fullscreen with restricted access
    echo - Block access to other applications
    echo - Only allow access to the exam interface
    echo.
    set /p confirm="Continue with secure kiosk mode? (y/N): "
    if /i not "!confirm!"=="y" (
        echo Operation cancelled.
        pause
        exit /b 0
    )
    echo.
)

echo Starting secure exam environment...

REM Cleanup existing processes
echo Terminating existing browser sessions...
taskkill /F /IM chrome.exe >nul 2>&1
taskkill /F /IM msedge.exe >nul 2>&1

REM Check if webface server is already running
echo Checking exam interface server...
curl -s -m 5 http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo Server is already running.
) else (
    echo Starting exam interface server...
    cd webface
    if not exist node_modules (
        echo Installing dependencies... ^(This may take a moment^)
        call npm install --silent
        if !errorlevel! neq 0 (
            echo ERROR: Failed to install dependencies.
            echo Please ensure Node.js and npm are installed.
            pause
            exit /b 1
        )
    )
    
    start /min "ExamShield Server" cmd /c "npm run dev"
    cd ..
    
    REM Wait for server with timeout
    echo Waiting for server initialization...
    set retry_count=0
    :wait_server
    timeout /t 2 /nobreak >nul
    curl -s -m 5 http://localhost:3000 >nul 2>&1
    if %errorlevel% equ 0 goto server_ready
    set /a retry_count+=1
    if !retry_count! geq 15 (
        echo ERROR: Server failed to start within 30 seconds.
        echo Please check the server logs and try again.
        pause
        exit /b 1
    )
    if "%DEBUG_MODE%"=="true" echo Server startup attempt !retry_count!/15...
    goto wait_server
)

:server_ready
echo Server is ready.

REM Register native messaging host
echo Configuring security bridge...
reg add "HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.exam.shield" /ve /t REG_SZ /d "%cd%\com.exam.shield.json" /f >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Failed to register security bridge. Some features may not work.
)

REM Generate secure session token
echo Generating secure session token...
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /format:value 2^>nul') do set datetime=%%I
for /f %%I in ('powershell -command "[System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes(16) | ForEach-Object { $_.ToString('x2') }" 2^>nul') do set random_hex=%%I

if defined datetime if defined random_hex (
    set token=exam_%datetime:~0,14%_%random_hex%
) else (
    REM Fallback token generation
    set token=exam_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%_%random%
)

set token=!token: =0!
if "%DEBUG_MODE%"=="true" echo Generated token: !token!

REM Start security guardian if available
if exist ExamGuardian.exe (
    echo Starting security guardian...
    start /min "ExamGuardian" ExamGuardian.exe
)

REM Locate Chrome browser
echo Locating Chrome browser...
set chrome_path=""
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set chrome_path="C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set chrome_path="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else (
    echo ERROR: Google Chrome not found.
    echo Please install Google Chrome and try again.
    pause
    exit /b 1
)

REM Using default Chrome profile (where extension is installed and working)
echo Using default Chrome profile ^(extension should work^)
set user_data_dir_flag=

echo Launching secure browser session...
echo.

REM Launch Chrome with appropriate flags
if "%KIOSK_MODE%"=="true" (
    echo Starting in secure kiosk mode...
    %chrome_path% ^
        --start-fullscreen ^
        --disable-pinch ^
        --disable-session-restore ^
        --no-first-run ^
        --disable-default-apps ^
        --disable-features=TranslateUI ^
        --load-extension="%cd%\extension" ^
        %user_data_dir_flag% ^
        "http://localhost:3000?token=!token!&mode=exam"
) else (
    echo Starting in windowed mode...
    %chrome_path% ^
        --disable-session-restore ^
        --no-first-run ^
        --disable-default-apps ^
        --load-extension="%cd%\extension" ^
        %user_data_dir_flag% ^
        "http://localhost:3000?token=!token!&mode=exam"
)

echo.
echo Browser session ended.

REM Cleanup
echo Using default profile - no cleanup needed

REM Stop server if we started it
wmic process where "commandline like '%%npm run dev%%'" delete >nul 2>&1

echo.
echo ExamShield session completed.
if "%KIOSK_MODE%"=="true" if "%AUTO_CONFIRM%"=="false" pause