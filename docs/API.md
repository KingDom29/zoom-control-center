# Zoom Control Center - API Dokumentation

## Base URL
```
http://localhost:3001/api
```

## Authentication
Lokale Nutzung - keine Auth erforderlich

---

## Health & System (3 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/health` | Vollständiger Health Check |
| GET | `/health/live` | Liveness Probe |
| GET | `/health/ready` | Readiness Probe |
| GET | `/metrics` | Performance Metrics |

---

## Campaign (28 Endpoints)

### Stats & Contacts
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/campaign/stats` | Kampagnen-Statistiken |
| GET | `/campaign/stats/attendance` | Attendance-Statistiken |
| GET | `/campaign/contacts` | Alle Kontakte |
| GET | `/campaign/contacts/attendance/:status` | Filter nach Status |

### Meetings & Emails
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/campaign/meetings/create` | Meetings erstellen |
| POST | `/campaign/emails/invitations` | Einladungen senden |
| POST | `/campaign/emails/reminders` | Erinnerungen senden |
| POST | `/campaign/emails/followups` | Follow-ups senden |

### No-Show Handling
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/campaign/noshow/:id/followup` | No-Show E-Mail |
| POST | `/campaign/noshow/process-pending` | Pending verarbeiten |

### Test
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/campaign/test/meeting-ended` | Attendance simulieren |

---

## Meetings (10 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/meetings` | Alle Meetings |
| GET | `/meetings/upcoming` | Anstehende Meetings |
| GET | `/meetings/:id` | Meeting Details |
| POST | `/meetings` | Meeting erstellen |
| PATCH | `/meetings/:id` | Meeting aktualisieren |
| DELETE | `/meetings/:id` | Meeting löschen |
| PUT | `/meetings/:id/status` | Meeting beenden |

---

## Users (11 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/users` | Alle Benutzer |
| GET | `/users/:id` | Benutzer Details |
| GET | `/users/:id/settings` | Benutzer-Einstellungen |
| POST | `/users` | Benutzer erstellen |
| PATCH | `/users/:id` | Benutzer aktualisieren |
| PATCH | `/users/:id/settings` | Einstellungen ändern |
| DELETE | `/users/:id` | Benutzer löschen |

---

## Recordings (7 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/recordings` | Alle Aufnahmen |
| GET | `/recordings/:id` | Aufnahme Details |
| DELETE | `/recordings/:id` | Aufnahme löschen |
| PUT | `/recordings/:id/status` | Aufnahme wiederherstellen |

---

## Revenue (9 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/revenue/events` | Revenue Events |
| GET | `/revenue/stats` | Revenue Statistiken |
| GET | `/revenue/overview` | Revenue Übersicht |
| GET | `/revenue/insights` | AI Insights |
| GET | `/revenue/event-types` | Event-Typen |
| POST | `/revenue/generate-followup` | Follow-up generieren |
| POST | `/revenue/generate-invitation` | Einladung generieren |
| POST | `/revenue/analyze-meeting` | Meeting analysieren |
| POST | `/revenue/generate-subjects` | Betreffzeilen generieren |

---

## Sequences (7 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/sequences/available` | Verfügbare Sequences |
| GET | `/sequences/stats` | Sequence Statistiken |
| POST | `/sequences/enroll` | Kontakt einschreiben |
| POST | `/sequences/bulk-enroll` | Bulk Einschreibung |
| POST | `/sequences/process` | Steps verarbeiten |
| GET | `/sequences/tasks` | Offene Tasks |
| POST | `/sequences/tasks/:id/complete` | Task abschließen |

---

## Logs (6 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/logs` | Logs abrufen |
| GET | `/logs/stats` | Log Statistiken |
| GET | `/logs/health` | Logging Health |
| POST | `/logs` | Log senden |
| POST | `/logs/analyze` | AI Log-Analyse |

---

## Notifications (7 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/notifications/action/:type` | Action ausführen |
| POST | `/notifications/action/followup` | Follow-up Action |
| POST | `/notifications/action/call` | Call Task |
| POST | `/notifications/action/schedule` | Schedule Task |
| POST | `/notifications/action/reschedule` | Reschedule |
| POST | `/notifications/action/demo` | Demo Task |
| GET | `/notifications/actions/stats` | Action Statistiken |

---

## Navigation (4 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/navigation/track` | Navigation tracken |
| GET | `/navigation/recommend` | Empfehlungen |
| GET | `/navigation/analytics` | Analytics |
| POST | `/navigation/event-recommend` | Event-Empfehlung |

---

## Reports (9 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/reports/daily` | Tagesbericht |
| GET | `/reports/users` | Benutzer-Report |
| GET | `/reports/meetings` | Meeting-Report |
| GET | `/reports/cloud-recording` | Recording-Report |

---

## Settings (11 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/settings/account` | Account Settings |
| GET | `/settings/account/info` | Account Info |
| GET | `/settings/security` | Security Settings |
| PATCH | `/settings/account` | Account aktualisieren |
| PATCH | `/settings/security` | Security aktualisieren |

---

## Dashboard (7 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/dashboard` | Dashboard Daten |
| GET | `/dashboard/overview` | Übersicht |
| GET | `/dashboard/quick-stats` | Quick Stats |
| GET | `/dashboard/metrics/meetings` | Meeting Metrics |

---

## Webhooks (4 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/webhooks` | Zoom Webhook |
| GET | `/webhooks/events` | Event-Historie |
| GET | `/webhooks/event-types` | Event-Typen |
| DELETE | `/webhooks/events` | Events löschen |

---

## Meeting Templates (4 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/meeting-templates` | Alle Templates |
| GET | `/meeting-templates/:id` | Template Details |
| POST | `/meeting-templates` | Template erstellen |
| DELETE | `/meeting-templates/:id` | Template löschen |

---

## Leads (12 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/leads` | Alle Leads |
| GET | `/leads/:id` | Lead Details |
| POST | `/leads` | Lead erstellen |
| PATCH | `/leads/:id` | Lead aktualisieren |
| DELETE | `/leads/:id` | Lead löschen |

---

## Geo & Market (14 Endpoints)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/geo/geocode` | Adresse geocodieren |
| GET | `/geo/reverse` | Reverse Geocoding |
| GET | `/market/analysis` | Marktanalyse |
| GET | `/market/competitors` | Wettbewerber |

---

## Rate Limits

| Typ | Limit |
|-----|-------|
| API Endpoints | 500 req / 15 min |
| Webhooks | 120 req / min |

---

## Status Codes

| Code | Bedeutung |
|------|-----------|
| 200 | Erfolg |
| 400 | Ungültige Anfrage |
| 404 | Nicht gefunden |
| 429 | Rate Limit |
| 500 | Server-Fehler |
| 503 | Service nicht verfügbar |
