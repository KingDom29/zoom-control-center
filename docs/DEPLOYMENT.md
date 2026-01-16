# Deployment & 24/7 Betrieb

## Option A: Lokaler PC mit Autostart (Aktuell)

### Setup

1. **Docker Desktop Autostart aktivieren:**
   - Docker Desktop Settings → General → "Start Docker Desktop when you sign in"

2. **Windows Task Scheduler einrichten:**
   ```
   taskschd.msc öffnen
   → "Aufgabe erstellen"
   → Trigger: "Bei Anmeldung"
   → Aktion: powershell.exe -ExecutionPolicy Bypass -File "D:\Entwicklungen 2026\Zoom 2026\scripts\autostart.ps1"
   ```

3. **Oder einfache Variante:**
   - Verknüpfung von `scripts\autostart.bat` erstellen
   - In `shell:startup` (Win+R eingeben) ablegen

### Was passiert beim Start?

1. Docker Desktop wird gestartet (falls nicht läuft)
2. Container werden hochgefahren
3. **Catch-up Logik** verarbeitet verpasste Tasks:
   - Reply Sync
   - Auto-Replies
   - Kampagnen-Batch (Werktags 8-17 Uhr)
   - Re-Engagement (falls aktiviert)

### Einschränkungen

- ❌ PC muss eingeschaltet sein
- ❌ Keine 24/7 Verfügbarkeit
- ✅ Kostenlos
- ✅ Daten bleiben lokal

---

## Option B: Cloud Server (24/7)

### Empfohlene Anbieter

| Anbieter | Kosten | Empfehlung |
|----------|--------|------------|
| **Hetzner Cloud** | ~4€/Monat | ⭐ Beste Preis/Leistung, DE-Server |
| DigitalOcean | ~6€/Monat | Gut dokumentiert |
| Azure VM | ~10€/Monat | Microsoft Integration |
| AWS Lightsail | ~5€/Monat | Amazon Ökosystem |

### Hetzner Setup (Empfohlen)

```bash
# 1. CX11 Server erstellen (2GB RAM, 20GB SSD)
# 2. Ubuntu 22.04 installieren
# 3. SSH verbinden

# Docker installieren
curl -fsSL https://get.docker.com | sh

# Projekt klonen/hochladen
git clone <repo> /opt/zoom-control-center
cd /opt/zoom-control-center

# .env Datei erstellen
cp .env.example .env
nano .env  # Credentials eintragen

# Starten
docker-compose up -d

# Logs prüfen
docker-compose logs -f
```

### Automatische Updates

```bash
# Crontab für tägliche Updates
crontab -e

# Jeden Tag um 3:00 Uhr neu deployen
0 3 * * * cd /opt/zoom-control-center && git pull && docker-compose up -d --build
```

---

## Option C: Raspberry Pi (Immer an, Stromsparend)

### Hardware

- Raspberry Pi 4 (4GB) - ~60€
- SD-Karte 32GB - ~10€
- Netzteil - ~10€

### Setup

```bash
# Raspberry Pi OS installieren
# Docker installieren
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker pi

# Projekt deployen (wie bei Cloud Server)
```

### Vorteile

- ✅ 24/7 Betrieb
- ✅ Einmalkosten ~80€
- ✅ ~5W Stromverbrauch (~1€/Monat)
- ✅ Daten bleiben bei dir

---

## Statische ngrok URL

Für alle Optionen: Feste ngrok URL benötigt für Webhooks.

```yaml
# docker-compose.yml - ngrok mit festem Domain
ngrok:
  command:
    - "http"
    - "zoom-control-center:3001"
    - "--domain=maklerplan.ngrok.io"  # Bezahltes ngrok Feature
```

Alternative: Eigene Domain + Cloudflare Tunnel (kostenlos)

---

## Monitoring

### Health Check Endpoint

```
GET http://localhost:3001/api/health
```

### Externe Überwachung (Optional)

- **UptimeRobot** (kostenlos) - Ping alle 5 Min
- **Healthchecks.io** (kostenlos) - Cron-Job Monitoring
