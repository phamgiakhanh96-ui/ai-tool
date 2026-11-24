@echo off
setlocal
set "PROJECT_DIR=%~dp0"
for %%I in ("%PROJECT_DIR%..\..\VieNeu-TTS") do set "VIENEU_DIR=%%~fI"
set "PYTHON=%VIENEU_DIR%\.venv\Scripts\python.exe"
set "NPM=C:\Program Files\nodejs\npm.cmd"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

if not exist "%PYTHON%" (
    echo VieNeu Python environment not found: "%PYTHON%"
    exit /b 1
)

if not exist "%NPM%" set "NPM=npm.cmd"

curl.exe --silent --fail --max-time 2 http://127.0.0.1:8000/health >nul 2>&1
if errorlevel 1 (
    echo Starting VieNeu-TTS API...
    start "VieNeu-TTS API" /D "%VIENEU_DIR%" "%PYTHON%" -m apps.openai_speech
)

echo Waiting for VieNeu-TTS API...
for /L %%I in (1,1,180) do (
    curl.exe --silent --fail --max-time 2 http://127.0.0.1:8000/health >nul 2>&1
    if not errorlevel 1 goto vieneu_ready
    timeout /t 2 /nobreak >nul
)

echo VieNeu-TTS API did not become ready. Check its server window.
exit /b 1

:vieneu_ready
echo VieNeu-TTS is ready. Starting Angular...
cd /d "%PROJECT_DIR%"
call "%NPM%" start
