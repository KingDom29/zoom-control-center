# Maklerplan CRM Browser Extension

## Installation (Chrome/Edge)

1. Öffne `chrome://extensions/` (oder `edge://extensions/`)
2. Aktiviere "Entwicklermodus" (oben rechts)
3. Klicke "Entpackte Erweiterung laden"
4. Wähle diesen `browser-extension` Ordner

## Features

### Popup (Klick auf Extension Icon)
- Top 10 Anruf-Empfehlungen
- One-Click Buttons:
  - 📞 Jetzt anrufen (Twilio)
  - 💬 SMS + Anrufen
  - 📅 Terminvorschlag senden
  - 📋 Zendesk Task erstellen
  - ⏭️ Überspringen

### Overlay auf zoom.us
- Schwebendes Panel mit Empfehlungen
- Minimierbar
- Quick-Actions direkt neben Meeting

### Notifications
- Alle 15 Minuten Check auf urgente Empfehlungen
- Desktop-Benachrichtigung bei 🔥 URGENT

## Icons erstellen

Die Extension braucht Icons. Erstelle diese Dateien:
- `icons/icon16.png` (16x16)
- `icons/icon48.png` (48x48)
- `icons/icon128.png` (128x128)

Oder nutze einen Icon-Generator mit diesem Emoji: 📞

## API Endpoints

Die Extension nutzt:
- `GET /api/unified/recommendations` - Empfehlungen laden
- `POST /api/unified/action/call/:id` - Anruf starten
- `POST /api/unified/action/meeting-proposal/:id` - Termin senden
- `POST /api/unified/action/skip/:id` - Überspringen

## Konfiguration

In `popup.js` und `content.js`:
```javascript
const API_BASE = 'https://zoom-control-center-production.up.railway.app/api';
const AGENT_PHONE = '+41764357375'; // Deine Nummer
```
