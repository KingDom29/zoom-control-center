# 🚀 Zoom Control Center - Maklerplan

Eine umfassende Steuerungskonsole für das Zoom-Team-Management mit Echtzeit-Updates.

## 🚀 Quick Start

```bash
# Dependencies installieren
npm install

# Environment konfigurieren
cp .env.example .env
# → Zoom + Azure Credentials eintragen

# Server starten
npm run server

# Server läuft auf http://localhost:3001
```

## ✨ Features

- **Dashboard** - Übersicht über Live-Meetings, Statistiken und Aktivitäten
- **Meeting-Management** - Erstellen, planen, bearbeiten und löschen von Meetings
- **Team-Verwaltung** - Alle Benutzer verwalten mit Rollen und Berechtigungen
- **Aufnahmen** - Cloud-Aufnahmen ansehen, herunterladen und verwalten
- **Berichte & Analytics** - Detaillierte Nutzungsstatistiken mit Diagrammen
- **Einstellungen** - Account- und Meeting-Einstellungen konfigurieren
- **🔴 Echtzeit-Events** - WebSocket Live-Updates mit Toast-Notifications
- **🌙 Dark Mode** - Systemweites Dark Theme mit Toggle

## 📦 Unterstützte Echtzeit-Events

| Kategorie | Events |
|-----------|--------|
| **Meetings** | `meeting.started`, `meeting.ended`, `participant_joined`, `participant_left` |
| **Recordings** | `recording.started`, `recording.completed`, `recording.deleted` |
| **Webinars** | `webinar.started`, `webinar.ended`, `registration_created` |
| **Users** | `user.created`, `user.deactivated`, `user.updated` |
| **Phone** | `phone.callee_answered`, `phone.callee_ended` |

## Tech Stack

- **Backend**: Node.js + Express + WebSocket (ws)
- **Frontend**: React + Vite + TailwindCSS
- **Echtzeit**: WebSocket mit Auto-Reconnect
- **Charts**: Recharts
- **Icons**: Lucide React

## Installation

```bash
# Dependencies installieren
npm run install:all

# Entwicklungsserver starten
npm run dev
```

## Umgebungsvariablen

Die `.env` Datei enthält bereits deine Zoom-Credentials:

```env
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
ZOOM_SECRET_TOKEN=your_secret_token
```

## Zoom App Konfiguration

Stelle sicher, dass deine Zoom Server-to-Server OAuth App folgende Scopes hat:

- `user:read:admin` - Benutzer lesen
- `user:write:admin` - Benutzer verwalten
- `meeting:read:admin` - Meetings lesen
- `meeting:write:admin` - Meetings verwalten
- `recording:read:admin` - Aufnahmen lesen
- `recording:write:admin` - Aufnahmen verwalten
- `report:read:admin` - Berichte lesen
- `account:read:admin` - Account-Einstellungen lesen
- `account:write:admin` - Account-Einstellungen schreiben
- `dashboard:read:admin` - Dashboard-Metriken lesen

## URLs

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api

## API Endpoints

| Endpoint | Beschreibung |
|----------|-------------|
| `/api/dashboard/*` | Dashboard-Daten und Metriken |
| `/api/meetings/*` | Meeting-Management |
| `/api/users/*` | Benutzer-Verwaltung |
| `/api/recordings/*` | Aufnahmen-Verwaltung |
| `/api/reports/*` | Berichte und Statistiken |
| `/api/settings/*` | Account-Einstellungen |
| `/api/webhooks` | POST - Zoom Webhook Endpoint |
| `/api/webhooks/events` | GET - Event-Historie |
| `/api/webhooks/test` | POST - Test-Event senden |
| `/api/webhooks/stats` | GET - WebSocket Stats |
| `/api/webhooks/clients` | GET - Verbundene Clients |

## 🧪 Testen ohne Zoom

Sende Test-Events über die API:

```bash
# Meeting gestartet
curl -X POST http://localhost:3001/api/webhooks/test -H "Content-Type: application/json" -d '{"eventType": "meeting.started"}'

# Teilnehmer beigetreten
curl -X POST http://localhost:3001/api/webhooks/test -H "Content-Type: application/json" -d '{"eventType": "meeting.participant_joined"}'

# Recording fertig
curl -X POST http://localhost:3001/api/webhooks/test -H "Content-Type: application/json" -d '{"eventType": "recording.completed"}'
```

## 🔌 WebSocket Protokoll

### Verbindung

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');
```

### Client → Server Messages

```javascript
// Zu Event-Typen subscriben
{ "type": "subscribe", "events": ["meeting.started", "meeting.ended"] }

// Events abbestellen
{ "type": "unsubscribe", "events": ["meeting.ended"] }

// Meeting-Room beitreten (für Meeting-spezifische Updates)
{ "type": "join_room", "room": "meeting:123456789" }

// Stats anfragen
{ "type": "get_stats" }
```

### Server → Client Messages

```javascript
// Verbindung hergestellt
{ "type": "connection", "status": "connected", "clientId": "abc-123" }

// Event empfangen
{ 
  "type": "event", 
  "data": {
    "type": "meeting.started",
    "payload": { ... },
    "ui": {
      "icon": "🟢",
      "title": "Meeting gestartet",
      "message": "Team Standup wurde gestartet",
      "color": "green"
    }
  }
}
```

## 🔒 Zoom Webhook Setup (für echte Events)

1. Öffentlichen Tunnel erstellen:
   ```bash
   npx ngrok http 3001
   ```

2. Gehe zu [marketplace.zoom.us](https://marketplace.zoom.us)
3. Öffne deine App → **Feature** → **Event Subscriptions**
4. Aktiviere Event Subscriptions
5. **Event notification endpoint URL**: `https://deine-ngrok-url/api/webhooks`
6. Wähle die Events aus die du empfangen willst
7. Kopiere das **Secret Token** in deine `.env` als `ZOOM_SECRET_TOKEN`
