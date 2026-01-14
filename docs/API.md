# Maklerplan Zoom Control Center - API Dokumentation

## Base URL
```
http://localhost:3001/api
```

## Authentication
Aktuell keine Auth erforderlich (lokale Nutzung)

---

## Health Endpoints

### GET /health
Vollständiger Health Check mit Service-Status

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-14T08:00:00.000Z",
  "uptime": 3600,
  "uptimeFormatted": "1h 0m 0s",
  "memory": {
    "used": "45 MB",
    "total": "64 MB"
  },
  "services": {
    "campaignData": { "status": "ok", "size": "2.50 MB" },
    "logging": { "status": "ok", "logFiles": 3 },
    "zoom": { "status": "configured" },
    "azure": { "status": "configured" }
  }
}
```

### GET /health/live
Liveness Probe (Server läuft?)

### GET /health/ready
Readiness Probe (Daten geladen?)

---

## Campaign Endpoints

### GET /campaign/stats
Kampagnen-Statistiken

**Response:**
```json
{
  "totalContacts": 1517,
  "scheduled": 0,
  "invitationsSent": 388,
  "remindersSent": 0,
  "followUpsSent": 0,
  "meetingsCompleted": 0,
  "attended": 0,
  "noShows": 0,
  "partial": 0,
  "byStatus": {
    "pending": 1129,
    "invitation_sent": 388
  }
}
```

### GET /campaign/contacts
Alle Kontakte abrufen

**Query Parameters:**
- `status` (optional): Filter nach Status (pending, scheduled, meeting_created, invitation_sent)
- `search` (optional): Suche nach Name/Firma/Email

### POST /campaign/meetings/create
Zoom Meetings erstellen

**Body:**
```json
{
  "limit": 100
}
```

### POST /campaign/emails/invitations
Einladungen senden

**Body:**
```json
{
  "limit": 100
}
```

### POST /campaign/emails/reminders
Erinnerungen senden (48h vor Meeting)

### POST /campaign/emails/followups
Follow-ups senden (24h nach Meeting)

---

## Attendance / No-Show Endpoints

### GET /campaign/stats/attendance
Attendance-Statistiken

**Response:**
```json
{
  "total": 100,
  "attended": 85,
  "noShows": 12,
  "partial": 3,
  "attendanceRate": 85,
  "noShowRate": 12,
  "partialRate": 3,
  "todayNoShows": [
    {
      "id": "...",
      "name": "Max Mustermann",
      "email": "max@example.com",
      "time": "10:00"
    }
  ],
  "pendingNoShowEmails": 2
}
```

### GET /campaign/contacts/attendance/:status
Kontakte nach Attendance-Status filtern

**Parameters:**
- `status`: attended, no_show, partial

### POST /campaign/noshow/:id/followup
Manuelle No-Show E-Mail senden

### POST /campaign/noshow/process-pending
Pending No-Show E-Mails verarbeiten

### POST /campaign/test/meeting-ended
Test-Endpoint für Attendance-Tracking

**Body:**
```json
{
  "contactId": "uuid",
  "attended": false,
  "duration": 0
}
```

---

## Meeting Templates

### GET /meeting-templates
Alle Templates abrufen

**Response:**
```json
[
  {
    "id": "neujahr_update",
    "name": "Neujahres-Update 2026",
    "description": "Standard-Template für Kampagne",
    "settings": {
      "duration": 30,
      "waitingRoom": true,
      "autoRecording": "cloud"
    }
  }
]
```

### GET /meeting-templates/:id
Einzelnes Template

### POST /meeting-templates
Neues Template erstellen

### DELETE /meeting-templates/:id
Template löschen

---

## Scheduler Endpoints

### GET /campaign/scheduler/status
Scheduler-Status und nächster Run

**Response:**
```json
{
  "scheduler": {
    "active": true,
    "schedule": "Täglich um 08:00 Uhr (Europe/Berlin)",
    "nextRun": "2026-01-15T07:00:00.000Z"
  }
}
```

---

## Webhook Endpoints

### POST /webhooks
Zoom Webhook empfangen

### GET /webhooks/events
Event-Historie abrufen

### POST /webhooks/test
Test-Event simulieren

### GET /webhooks/stats
WebSocket-Statistiken

---

## Dashboard

### GET /dashboard
Komplette Dashboard-Daten (verschiedene Statistiken kombiniert)

---

## Rate Limits

- **API Endpoints:** 500 Requests / 15 Minuten
- **Webhook Endpoints:** 120 Requests / Minute

---

## Error Responses

```json
{
  "error": "Error message"
}
```

**Status Codes:**
- `200` - Erfolg
- `400` - Ungültige Anfrage
- `404` - Nicht gefunden
- `429` - Rate Limit erreicht
- `500` - Server-Fehler
- `503` - Service nicht verfügbar
