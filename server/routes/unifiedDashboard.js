/**
 * Unified CRM Dashboard
 * Visuelles Dashboard für alle Kontakte, Pipeline, Kommunikation
 */

import express from 'express';
import {
  unifiedContactService,
  pipelineService,
  communicationService,
  brandingService,
  STAGES
} from '../services/unified/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const stats = unifiedContactService.getStats();
    const pipeline = pipelineService.getPipelineStats();
    const sequences = pipelineService.getSequenceStats();
    const comms = communicationService.getChannelStats();
    const brands = brandingService.getAllBrands();

    // Letzte Kontakte
    const recentContacts = unifiedContactService.findContacts({ 
      limit: 10, 
      sortBy: 'createdAt', 
      sortOrder: 'desc' 
    }).contacts;

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unified CRM | Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Header -->
  <nav class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 shadow-lg">
    <div class="container mx-auto flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold">🚀 Unified CRM</h1>
        <p class="text-sm opacity-80">Alle Kontakte • Alle Brands • Eine Pipeline</p>
      </div>
      <div class="flex gap-4">
        ${brands.map(b => `
          <span class="px-3 py-1 rounded-full text-sm" style="background: ${b.colors.primary}20; border: 1px solid ${b.colors.primary};">
            ${b.name}
          </span>
        `).join('')}
      </div>
    </div>
  </nav>

  <main class="container mx-auto p-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-indigo-500">
        <div class="text-3xl font-bold text-indigo-600">${stats.total}</div>
        <div class="text-gray-600">Kontakte gesamt</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
        <div class="text-3xl font-bold text-blue-600">${stats.byStage?.lead || 0}</div>
        <div class="text-gray-600">Neue Leads</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-yellow-500">
        <div class="text-3xl font-bold text-yellow-600">${stats.byStage?.meeting_scheduled || 0}</div>
        <div class="text-gray-600">Meetings geplant</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
        <div class="text-3xl font-bold text-green-600">${stats.byStage?.customer || 0}</div>
        <div class="text-gray-600">Kunden</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
        <div class="text-3xl font-bold text-purple-600">${sequences.active}</div>
        <div class="text-gray-600">Aktive Sequenzen</div>
      </div>
    </div>

    <!-- Pipeline & Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <!-- Pipeline Funnel -->
      <div class="bg-white rounded-xl shadow-lg p-6">
        <h2 class="text-xl font-bold mb-4">📊 Sales Pipeline</h2>
        <div class="space-y-3">
          ${Object.entries(pipeline).map(([stage, data]) => {
            const colors = {
              lead: 'bg-blue-500',
              prospect: 'bg-indigo-500',
              contacted: 'bg-purple-500',
              meeting_scheduled: 'bg-yellow-500',
              meeting_done: 'bg-orange-500',
              proposal_sent: 'bg-pink-500',
              customer: 'bg-green-500',
              active: 'bg-emerald-500',
              churned: 'bg-gray-500',
              lost: 'bg-red-500'
            };
            const maxCount = Math.max(...Object.values(pipeline).map(p => p.count)) || 1;
            const width = Math.max(5, (data.count / maxCount) * 100);
            
            return `
              <div class="flex items-center gap-3">
                <div class="w-32 text-sm font-medium text-gray-600">${stage.replace(/_/g, ' ')}</div>
                <div class="flex-1 bg-gray-200 rounded-full h-8 relative">
                  <div class="${colors[stage] || 'bg-gray-500'} h-8 rounded-full flex items-center justify-end pr-3 text-white text-sm font-bold" style="width: ${width}%">
                    ${data.count}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Brand Distribution -->
      <div class="bg-white rounded-xl shadow-lg p-6">
        <h2 class="text-xl font-bold mb-4">🏷️ Kontakte nach Brand</h2>
        <canvas id="brandChart" height="200"></canvas>
        <div class="mt-4 grid grid-cols-2 gap-4">
          ${Object.entries(stats.byBrand || {}).map(([brand, count]) => {
            const b = brandingService.getBrand(brand);
            return `
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded" style="background: ${b.colors.primary}"></div>
                <span class="text-sm">${b.name}: <strong>${count}</strong></span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Communication Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white rounded-xl shadow-lg p-6 text-center">
        <div class="text-4xl mb-2">📧</div>
        <div class="text-2xl font-bold">${comms.email.totalSent}</div>
        <div class="text-gray-600">E-Mails gesendet</div>
        <div class="text-sm text-green-600 mt-1">${comms.email.totalOpened} geöffnet</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 text-center">
        <div class="text-4xl mb-2">📱</div>
        <div class="text-2xl font-bold">${comms.sms.enabled}</div>
        <div class="text-gray-600">SMS erlaubt</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 text-center">
        <div class="text-4xl mb-2">📞</div>
        <div class="text-2xl font-bold">${comms.phone.withPhone}</div>
        <div class="text-gray-600">Mit Telefon</div>
      </div>
      <div class="bg-white rounded-xl shadow-lg p-6 text-center">
        <div class="text-4xl mb-2">🎥</div>
        <div class="text-2xl font-bold">${comms.meetings.totalScheduled}</div>
        <div class="text-gray-600">Meetings</div>
      </div>
    </div>

    <!-- Recent Contacts Table -->
    <div class="bg-white rounded-xl shadow-lg overflow-hidden">
      <div class="p-6 border-b">
        <h2 class="text-xl font-bold">👥 Letzte Kontakte</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kontakt</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Firma</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quelle</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Erstellt</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            ${recentContacts.map(c => {
              const brand = brandingService.getBrand(c.activeBrand);
              const stageColors = {
                lead: 'bg-blue-100 text-blue-800',
                prospect: 'bg-indigo-100 text-indigo-800',
                contacted: 'bg-purple-100 text-purple-800',
                meeting_scheduled: 'bg-yellow-100 text-yellow-800',
                meeting_done: 'bg-orange-100 text-orange-800',
                customer: 'bg-green-100 text-green-800',
                lost: 'bg-red-100 text-red-800'
              };
              return `
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4">
                    <div class="font-medium">${c.firstName} ${c.lastName}</div>
                    <div class="text-sm text-gray-500">${c.email}</div>
                  </td>
                  <td class="px-6 py-4">${c.company || '-'}</td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded text-xs" style="background: ${brand.colors.primary}20; color: ${brand.colors.primary}">
                      ${brand.name}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full text-xs ${stageColors[c.stage] || 'bg-gray-100'}">
                      ${c.stage?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">${c.source?.replace(/_/g, ' ')}</td>
                  <td class="px-6 py-4 text-sm text-gray-500">${new Date(c.createdAt).toLocaleDateString('de-DE')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="mt-8 bg-white rounded-xl shadow-lg p-6">
      <h2 class="text-xl font-bold mb-4">⚡ Schnell-Aktionen</h2>
      <div class="flex flex-wrap gap-4">
        <button onclick="processSequences()" class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium">
          🔄 Sequenzen verarbeiten
        </button>
        <button onclick="location.href='/api/unified/stats'" class="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg font-medium">
          📊 API Stats
        </button>
        <button onclick="location.reload()" class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium">
          🔄 Aktualisieren
        </button>
      </div>
    </div>
  </main>

  <script>
    // Brand Chart
    const brandData = ${JSON.stringify(stats.byBrand || {})};
    const brandLabels = Object.keys(brandData);
    const brandValues = Object.values(brandData);
    const brandColors = ${JSON.stringify(brands.reduce((acc, b) => { acc[b.id] = b.colors.primary; return acc; }, {}))};
    
    new Chart(document.getElementById('brandChart'), {
      type: 'doughnut',
      data: {
        labels: brandLabels.map(l => l === 'maklerplan' ? 'Maklerplan' : 'Leadquelle'),
        datasets: [{
          data: brandValues,
          backgroundColor: brandLabels.map(l => brandColors[l] || '#6366f1'),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } }
      }
    });

    async function processSequences() {
      try {
        const res = await fetch('/api/unified/sequences/process', { method: 'POST' });
        const data = await res.json();
        alert('✅ ' + data.processed + ' Sequenzen verarbeitet');
        location.reload();
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
    logger.error('Dashboard Fehler', { error: error.message });
    res.status(500).send(`<h1>Fehler</h1><p>${error.message}</p>`);
  }
});

export default router;
