@echo off
setlocal
set "PROJECT_DIR=%~dp0"
for %%I in ("%PROJECT_DIR%..\..\VieNeu-TTS") do set "VIENEU_DIR=%%~fI"
set "PYTHON=%VIENEU_DIR%\.venv\Scripts\python.exe"
set "NPM=C:\Program Files\nodejs\npm.cmd"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

if not exist "%NPM%" (
    set "NPM=npm.cmd"
    where.exe npm.cmd >nul 2>&1
    if errorlevel 1 (
        echo Node.js and npm were not found. Install Node.js, then run this file again.
        pause
        exit /b 1
    )
)

if not exist "%PROJECT_DIR%node_modules\.bin\ng.cmd" (
    echo Installing frontend dependencies...
    cd /d "%PROJECT_DIR%"
    call "%NPM%" install
    if errorlevel 1 (
        echo Frontend dependency installation failed.
        pause
        exit /b 1
    )
)

if not exist "%PYTHON%" (
    echo VieNeu Python environment not found. TTS will be unavailable.
    goto start_frontend
)

curl.exe --silent --fail --max-time 1 http://127.0.0.1:8000/health >nul 2>&1
if errorlevel 1 (
    echo Starting VieNeu-TTS API...
    start "VieNeu-TTS API" /D "%VIENEU_DIR%" "%PYTHON%" -m apps.openai_speech
    echo Waiting up to 2 minutes for VieNeu-TTS...
    for /L %%I in (1,1,60) do (
        curl.exe --silent --fail --max-time 1 http://127.0.0.1:8000/health >nul 2>&1
        if not errorlevel 1 goto vieneu_ready
        timeout /t 1 /nobreak >nul
    )
    echo VieNeu-TTS did not become ready. Uploaded-audio video mode is still available.
    goto start_frontend
)

echo VieNeu-TTS API is already running.

:vieneu_ready
echo VieNeu-TTS is ready.

:start_frontend
cd /d "%PROJECT_DIR%"
curl.exe --silent --fail --max-time 1 http://127.0.0.1:4200/ >nul 2>&1
if not errorlevel 1 (
    echo Angular is already running. Opening the app...
    start "" "http://127.0.0.1:4200/"
    exit /b 0
)

echo Starting Angular and opening the app...
call "%NPM%" start -- --open
if errorlevel 1 (
    echo Angular failed to start. Check the messages above.
    pause
    exit /b 1
)
