@echo off
REM =============================================
REM Maklerplan Zoom Control Center - Autostart
REM =============================================
REM Dieses Script startet Docker Desktop und die Container
REM Legen Sie eine Verknüpfung in: shell:startup

echo [%date% %time%] Starting Maklerplan Zoom Control Center... >> "%~dp0autostart.log"

REM Warte bis Docker Desktop läuft
echo Warte auf Docker Desktop...
:wait_docker
docker info >nul 2>&1
if errorlevel 1 (
    REM Docker nicht bereit, starte Docker Desktop
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    timeout /t 10 /nobreak >nul
    goto wait_docker
)

echo Docker Desktop ist bereit.
echo [%date% %time%] Docker ready >> "%~dp0autostart.log"

REM Wechsle zum Projektverzeichnis
cd /d "D:\Entwicklungen 2026\Zoom 2026"

REM Starte Container
echo Starte Container...
docker-compose up -d

echo [%date% %time%] Containers started >> "%~dp0autostart.log"
echo.
echo =============================================
echo Maklerplan Zoom Control Center gestartet!
echo.
echo Server: http://localhost:3001
echo ngrok:  http://localhost:4040
echo =============================================

REM Öffne ngrok Dashboard im Browser (optional)
REM start http://localhost:4040

timeout /t 5
