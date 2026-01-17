/**
 * Leadquelle Dashboard - Server-Side Rendered
 */

import express from 'express';
import { multiLeadService, BRANCHES } from '../services/multiLeadService.js';

const router = express.Router();

// GET /leadquelle - Dashboard
router.get('/', async (req, res) => {
  const stats = multiLeadService.getStats();
  const branches = Object.values(BRANCHES);
  
  // Leads nach Status gruppieren
  const allLeads = stats.recentLeads || [];
  
  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leadquelle AI Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Header -->
  <header class="gradient-bg text-white py-6 px-4">
    <div class="max-w-7xl mx-auto">
      <h1 class="text-3xl font-bold">🎯 Leadquelle AI</h1>
      <p class="text-purple-200">Mehr Kunden. Ganz sicher.</p>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 py-8">
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-white rounded-xl shadow-lg p-6">
        <div class="text-4xl font-bold text-blue-600">${stats.overall.total}</div>
        <div class="text-gray-500">Leads gesamt</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6">
        <div class="text-4xl font-bold text-yellow-600">${stats.overall.contacted}</div>
        <div class="text-gray-500">Kontaktiert</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6">
        <div class="text-4xl font-bold text-green-600">${stats.overall.booked}</div>
        <div class="text-gray-500">Gebucht</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6">
        <div class="text-4xl font-bold text-purple-600">${stats.overall.total > 0 ? Math.round((stats.overall.booked / stats.overall.total) * 100) : 0}%</div>
        <div class="text-gray-500">Conversion</div>
      </div>
    </div>

    <!-- Branchen Stats -->
    <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
      <h2 class="text-xl font-bold mb-4">📊 Leads nach Branche</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        ${Object.entries(stats.byBranch).map(([branch, data]) => {
          const config = BRANCHES[branch];
          return `
          <div class="bg-gray-50 rounded-lg p-4 text-center">
            <div class="text-2xl">${config?.emoji || '📊'}</div>
            <div class="font-medium text-sm">${config?.name || branch}</div>
            <div class="text-lg font-bold text-blue-600">${data.total}</div>
            <div class="text-xs text-gray-500">${data.contacted} kontaktiert</div>
          </div>
          `;
        }).join('')}
      </div>
      ${Object.keys(stats.byBranch).length === 0 ? '<p class="text-gray-400 text-center py-8">Noch keine Leads nach Branche</p>' : ''}
    </div>

    <!-- Recent Leads -->
    <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
      <h2 class="text-xl font-bold mb-4">🕐 Letzte Leads</h2>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b">
              <th class="text-left py-3 px-4">Firma</th>
              <th class="text-left py-3 px-4">Branche</th>
              <th class="text-left py-3 px-4">Stadt</th>
              <th class="text-left py-3 px-4">Rating</th>
              <th class="text-left py-3 px-4">Status</th>
              <th class="text-left py-3 px-4">Erstellt</th>
            </tr>
          </thead>
          <tbody>
            ${allLeads.map(lead => {
              const config = BRANCHES[lead.branch];
              const statusColors = {
                'new': 'bg-gray-100 text-gray-600',
                'contacted': 'bg-yellow-100 text-yellow-700',
                'booked': 'bg-green-100 text-green-700',
                'opted_out': 'bg-red-100 text-red-700'
              };
              return `
              <tr class="border-b hover:bg-gray-50">
                <td class="py-3 px-4">
                  <div class="font-medium">${lead.company}</div>
                  <div class="text-sm text-gray-500">${lead.email || '-'}</div>
                </td>
                <td class="py-3 px-4">${config?.emoji || ''} ${config?.name || lead.branch}</td>
                <td class="py-3 px-4">${lead.city || '-'}</td>
                <td class="py-3 px-4">⭐ ${lead.rating || '-'}</td>
                <td class="py-3 px-4">
                  <span class="px-2 py-1 rounded-full text-xs ${statusColors[lead.status] || 'bg-gray-100'}">${lead.status}</span>
                </td>
                <td class="py-3 px-4 text-sm text-gray-500">${new Date(lead.createdAt).toLocaleDateString('de-DE')}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${allLeads.length === 0 ? '<p class="text-gray-400 text-center py-8">Noch keine Leads</p>' : ''}
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="bg-white rounded-xl shadow-lg p-6">
      <h2 class="text-xl font-bold mb-4">⚡ Quick Actions</h2>
      <div class="flex flex-wrap gap-4">
        <button onclick="searchLeads()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
          🔍 Neue Leads suchen
        </button>
        <button onclick="location.reload()" class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition">
          🔄 Aktualisieren
        </button>
        <a href="/api/multi-leads/stats" target="_blank" class="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition inline-block">
          📊 API Stats
        </a>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="text-center py-6 text-gray-500 text-sm">
    Leadquelle Deutschland | Friedrichstraße 171, 10117 Berlin | leadquelle.ai
  </footer>

  <script>
    async function searchLeads() {
      const branch = prompt('Branche (z.B. steuerberater, maler, gaertner):');
      if (!branch) return;
      const city = prompt('Stadt (z.B. Berlin, München, Hamburg):');
      if (!city) return;
      
      try {
        const res = await fetch('/api/multi-leads/search-and-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch, city, limit: 5 })
        });
        const data = await res.json();
        alert(\`✅ \${data.imported} Leads importiert, \${data.withEmail} mit E-Mail\`);
        location.reload();
      } catch (e) {
        alert('Fehler: ' + e.message);
      }
    }
  </script>
</body>
</html>
  `;

  res.send(html);
});

export default router;
