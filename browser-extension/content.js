// Content Script - läuft auf zoom.us Seiten
// Zeigt ein schwebendes Panel mit Empfehlungen

const API_BASE = 'https://zoom-control-center-production.up.railway.app/api';

let panel = null;
let isMinimized = true;

function createPanel() {
  panel = document.createElement('div');
  panel.id = 'maklerplan-crm-panel';
  panel.innerHTML = `
    <div class="mp-header" id="mp-toggle">
      <span class="mp-logo">📞</span>
      <span class="mp-title">CRM</span>
      <span class="mp-badge" id="mp-badge">0</span>
    </div>
    <div class="mp-content" id="mp-content">
      <div class="mp-loading">Lade...</div>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('mp-toggle').addEventListener('click', togglePanel);
  
  loadRecommendations();
  
  // Alle 5 Minuten aktualisieren
  setInterval(loadRecommendations, 5 * 60 * 1000);
}

function togglePanel() {
  isMinimized = !isMinimized;
  panel.classList.toggle('minimized', isMinimized);
}

async function loadRecommendations() {
  try {
    const res = await fetch(`${API_BASE}/unified/recommendations?limit=5`);
    const data = await res.json();
    const recs = data.recommendations || [];
    
    document.getElementById('mp-badge').textContent = recs.length;
    document.getElementById('mp-badge').style.display = recs.length > 0 ? 'flex' : 'none';
    
    if (recs.length === 0) {
      document.getElementById('mp-content').innerHTML = `
        <div class="mp-empty">
          <span>✅</span>
          <p>Keine Empfehlungen</p>
        </div>
      `;
      return;
    }

    document.getElementById('mp-content').innerHTML = recs.map(rec => `
      <div class="mp-rec" data-id="${rec.contactId}">
        <div class="mp-rec-priority mp-${rec.priority}">${rec.priority === 'urgent' ? '🔥' : '📞'}</div>
        <div class="mp-rec-info">
          <div class="mp-rec-name">${rec.name}</div>
          <div class="mp-rec-company">${rec.company || rec.brand}</div>
        </div>
        <div class="mp-rec-actions">
          <button class="mp-btn mp-btn-call" data-action="call" data-id="${rec.contactId}" title="Anrufen">📞</button>
          <button class="mp-btn mp-btn-email" data-action="meeting-proposal" data-id="${rec.contactId}" title="Termin">📅</button>
        </div>
      </div>
    `).join('');

    // Event Listener für Buttons
    document.querySelectorAll('.mp-btn').forEach(btn => {
      btn.addEventListener('click', handleAction);
    });

  } catch (error) {
    document.getElementById('mp-content').innerHTML = `
      <div class="mp-empty">
        <span>⚠️</span>
        <p>Fehler beim Laden</p>
      </div>
    `;
  }
}

async function handleAction(e) {
  const btn = e.target;
  const action = btn.dataset.action;
  const contactId = btn.dataset.id;
  
  btn.textContent = '⏳';
  btn.disabled = true;

  try {
    const body = action === 'call' ? { agentPhone: '+41764357375' } : {};
    
    await fetch(`${API_BASE}/unified/action/${action}/${contactId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    btn.textContent = '✅';
    setTimeout(() => loadRecommendations(), 1500);
  } catch (error) {
    btn.textContent = '❌';
  }
}

// Panel erstellen wenn DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createPanel);
} else {
  createPanel();
}
