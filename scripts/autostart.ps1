# =============================================
# Maklerplan Zoom Control Center - Autostart
# =============================================
# PowerShell Version für Windows Task Scheduler
# 
# Task Scheduler Setup:
# 1. taskschd.msc öffnen
# 2. "Aufgabe erstellen" > "Bei Anmeldung" Trigger
# 3. Aktion: powershell.exe -ExecutionPolicy Bypass -File "D:\Entwicklungen 2026\Zoom 2026\scripts\autostart.ps1"

$LogFile = "$PSScriptRoot\autostart.log"
$ProjectPath = "D:\Entwicklungen 2026\Zoom 2026"

function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append $LogFile
    Write-Host $Message
}

Write-Log "Starting Maklerplan Zoom Control Center..."

# Warte auf Docker Desktop
Write-Log "Waiting for Docker Desktop..."
$maxWait = 120  # Max 2 Minuten warten
$waited = 0

while ($waited -lt $maxWait) {
    $dockerRunning = docker info 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Docker Desktop is ready"
        break
    }
    
    # Docker Desktop starten falls nicht läuft
    if ($waited -eq 0) {
        Write-Log "Starting Docker Desktop..."
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    }
    
    Start-Sleep -Seconds 5
    $waited += 5
}

if ($waited -ge $maxWait) {
    Write-Log "ERROR: Docker Desktop did not start in time"
    exit 1
}

# Container starten
Set-Location $ProjectPath
Write-Log "Starting containers..."

docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Log "Containers started successfully"
    Write-Log "Server: http://localhost:3001"
    Write-Log "ngrok Dashboard: http://localhost:4040"
} else {
    Write-Log "ERROR: Failed to start containers"
    exit 1
}

# Warte kurz und prüfe Health
Start-Sleep -Seconds 10

try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 10
    Write-Log "Health check passed: $($health.status)"
} catch {
    Write-Log "WARNING: Health check failed - $($_.Exception.Message)"
}

Write-Log "Startup complete"
