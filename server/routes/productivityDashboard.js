/**
 * Produktivitäts-Dashboard
 * Visueller Report für Team-Performance
 */

import express from 'express';
import { meetingQualityService } from '../services/meetingQualityService.js';
import { teamActivityService } from '../services/teamActivityService.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [activity, team] = await Promise.all([
      meetingQualityService.getInactiveUsers(),
      teamActivityService.getTeamOverview()
    ]);

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Produktivität | Zoom Control Center</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <nav class="bg-blue-600 text-white p-4 shadow-lg">
    <div class="container mx-auto flex justify-between items-center">
      <h1 class="text-2xl font-bold">📊 Team Produktivität</h1>
      <div class="text-sm opacity-80">${new Date().toLocaleString('de-DE')}</div>
    </div>
  </nav>

  <main class="container mx-auto p-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
        <div class="text-3xl font-bold text-blue-600">${team.total}</div>
        <div class="text-gray-600">Team-Mitglieder</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
        <div class="text-3xl font-bold text-green-600">${activity.summary.active}</div>
        <div class="text-gray-600">Heute aktiv</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-500">
        <div class="text-3xl font-bold text-red-600">${activity.summary.inactive}</div>
        <div class="text-gray-600">Heute inaktiv</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
        <div class="text-3xl font-bold text-purple-600">${activity.summary.activityRate}%</div>
        <div class="text-gray-600">Aktivitätsrate</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <!-- Activity Pie Chart -->
      <div class="bg-white rounded-xl shadow-lg p-6">
        <h2 class="text-xl font-bold mb-4">📈 Aktivitäts-Verteilung</h2>
        <canvas id="activityChart" height="200"></canvas>
      </div>
      
      <!-- Progress Bar -->
      <div class="bg-white rounded-xl shadow-lg p-6">
        <h2 class="text-xl font-bold mb-4">🎯 Tages-Ziel</h2>
        <div class="space-y-4">
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-gray-700">Team-Aktivität</span>
              <span class="font-bold ${activity.summary.activityRate >= 80 ? 'text-green-600' : activity.summary.activityRate >= 50 ? 'text-yellow-600' : 'text-red-600'}">${activity.summary.activityRate}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-4">
              <div class="h-4 rounded-full ${activity.summary.activityRate >= 80 ? 'bg-green-500' : activity.summary.activityRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}" style="width: ${activity.summary.activityRate}%"></div>
            </div>
          </div>
          <div class="text-sm text-gray-500 mt-4">
            <p>🎯 Ziel: 80% Team-Aktivität pro Tag</p>
            <p class="mt-2">${activity.summary.activityRate >= 80 ? '✅ Ziel erreicht!' : '⚠️ Noch ' + (80 - activity.summary.activityRate) + '% bis zum Ziel'}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Team Tables -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Active Users -->
      <div class="bg-white rounded-xl shadow-lg overflow-hidden">
        <div class="bg-green-500 text-white px-6 py-4">
          <h2 class="text-xl font-bold">✅ Aktive Mitarbeiter (${activity.summary.active})</h2>
        </div>
        <div class="p-4 max-h-96 overflow-y-auto">
          ${activity.activeUsers.length > 0 ? activity.activeUsers.map(u => `
            <div class="flex items-center justify-between p-3 hover:bg-gray-50 border-b">
              <div>
                <div class="font-medium">${u.user.name}</div>
                <div class="text-sm text-gray-500">${u.user.email}</div>
              </div>
              <div class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                ${u.meetingsToday} Meeting${u.meetingsToday !== 1 ? 's' : ''}
              </div>
            </div>
          `).join('') : '<div class="p-4 text-center text-gray-500">Keine aktiven User</div>'}
        </div>
      </div>

      <!-- Inactive Users -->
      <div class="bg-white rounded-xl shadow-lg overflow-hidden">
        <div class="bg-red-500 text-white px-6 py-4 flex justify-between items-center">
          <h2 class="text-xl font-bold">❌ Inaktive Mitarbeiter (${activity.summary.inactive})</h2>
          ${activity.summary.inactive > 0 ? `
            <button onclick="sendReminders()" class="bg-white text-red-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50">
              📧 Reminder senden
            </button>
          ` : ''}
        </div>
        <div class="p-4 max-h-96 overflow-y-auto">
          ${activity.inactiveUsers.length > 0 ? activity.inactiveUsers.map(u => `
            <div class="flex items-center justify-between p-3 hover:bg-gray-50 border-b">
              <div>
                <div class="font-medium">${u.user.name}</div>
                <div class="text-sm text-gray-500">${u.user.email}</div>
              </div>
              <div class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                Keine Meetings
              </div>
            </div>
          `).join('') : '<div class="p-4 text-center text-gray-500">🎉 Alle Mitarbeiter sind aktiv!</div>'}
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="mt-8 bg-white rounded-xl shadow-lg p-6">
      <h2 class="text-xl font-bold mb-4">⚡ Schnell-Aktionen</h2>
      <div class="flex flex-wrap gap-4">
        <button onclick="sendProductivityReport()" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium">
          📊 Report per E-Mail senden
        </button>
        <button onclick="checkNoShows()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium">
          ⚠️ No-Shows prüfen
        </button>
        <button onclick="location.reload()" class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium">
          🔄 Aktualisieren
        </button>
      </div>
    </div>
  </main>

  <script>
    // Activity Pie Chart
    const ctx = document.getElementById('activityChart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Aktiv', 'Inaktiv'],
        datasets: [{
          data: [${activity.summary.active}, ${activity.summary.inactive}],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });

    async function sendReminders() {
      if (!confirm('Reminder an alle inaktiven User senden?')) return;
      try {
        const res = await fetch('/api/users/team/reminders/send', { method: 'POST' });
        const data = await res.json();
        alert('✅ ' + data.remindersSent + ' Reminder gesendet!');
      } catch (e) {
        alert('❌ Fehler: ' + e.message);
      }
    }

    async function sendProductivityReport() {
      try {
        const res = await fetch('/api/users/team/productivity/send', { method: 'POST' });
        const data = await res.json();
        alert('✅ Produktivitäts-Report gesendet!');
      } catch (e) {
        alert('❌ Fehler: ' + e.message);
      }
    }

    async function checkNoShows() {
      try {
        const res = await fetch('/api/users/team/no-shows');
        const data = await res.json();
        if (data.noShows.length === 0) {
          alert('✅ Keine No-Shows gefunden!');
        } else {
          alert('⚠️ ' + data.noShows.length + ' No-Shows gefunden!\\n\\n' + 
            data.noShows.map(n => n.meeting.topic + ' (' + n.host.name + ')').join('\\n'));
        }
      } catch (e) {
        alert('❌ Fehler: ' + e.message);
      }
    }
  </script>
</body>
</html>
    `;

    res.send(html);
  } catch (error) {
    logger.error('Productivity Dashboard Fehler', { error: error.message });
    res.status(500).send(`<h1>Fehler</h1><p>${error.message}</p>`);
  }
});

export default router;
