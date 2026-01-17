const API_BASE = 'https://zoom-control-center-production.up.railway.app/api';
const AGENT_PHONE = '+41764357375'; // Deine Nummer für Anrufe

let currentRecommendation = null;
let recommendations = [];
let currentIndex = 0;

// E-Mail Templates (One-Click)
const EMAIL_TEMPLATES = [
  {
    id: 'meeting_proposal',
    name: '📅 Terminvorschlag senden',
    desc: '3 Zeitslots zur Auswahl',
    action: 'meeting-proposal'
  },
  {
    id: 'followup',
    name: '📧 Follow-Up E-Mail',
    desc: 'Freundliche Nachfass-Mail',
    action: 'followup'
  },
  {
    id: 'info',
    name: '📋 Info-Material senden',
    desc: 'Produktinfos & Preise',
    action: 'send-info'
  }
];

async function loadRecommendations() {
  try {
    const res = await fetch(`${API_BASE}/unified/recommendations?limit=10`);
    const data = await res.json();
    recommendations = data.recommendations || [];
    
    if (recommendations.length > 0) {
      showRecommendation(0);
    } else {
      showNoRecommendations();
    }
  } catch (error) {
    showError(error.message);
  }
}

function showRecommendation(index) {
  currentIndex = index;
  const rec = recommendations[index];
  if (!rec) return showNoRecommendations();
  
  currentRecommendation = rec;
  
  const priorityClass = `priority-${rec.priority}`;
  const priorityText = {
    'urgent': '🔥 URGENT',
    'high': '⚡ HIGH',
    'medium': '📌 MEDIUM',
    'low': '💭 LOW'
  }[rec.priority] || rec.priority;

  document.getElementById('content').innerHTML = `
    <div class="recommendation">
      <div class="rec-header">
        <span class="priority-badge ${priorityClass}">${priorityText}</span>
        <span style="font-size: 12px; color: #64748b;">Score: ${rec.score}</span>
        <span style="margin-left: auto; font-size: 12px; color: #94a3b8;">${currentIndex + 1}/${recommendations.length}</span>
      </div>
      
      <div class="rec-body">
        <div class="contact-name">${rec.name}</div>
        <div class="contact-company">${rec.company || rec.brand}</div>
        <div class="contact-phone">📞 ${rec.phone}</div>
        
        <div class="reason-box">
          <strong>${rec.recommendation}</strong><br>
          ${rec.reasons?.[0] || 'Kontakt priorisiert'}
        </div>
      </div>
      
      <div class="actions">
        <button class="action-btn btn-call" onclick="doAction('call')">
          📞 Jetzt anrufen
        </button>
        <button class="action-btn btn-sms" onclick="doAction('sms-then-call')">
          💬<br>SMS+Anruf
        </button>
        <button class="action-btn btn-email" onclick="doAction('meeting-proposal')">
          📅<br>Termin
        </button>
        <button class="action-btn btn-task" onclick="doAction('create-task')">
          📋<br>Zendesk
        </button>
        <button class="action-btn btn-skip" onclick="skipAndNext()">
          ⏭️<br>Skip
        </button>
      </div>
    </div>
    
    <div class="templates">
      <div class="template-title">📧 E-MAIL TEMPLATES (1-CLICK)</div>
      ${EMAIL_TEMPLATES.map(t => `
        <button class="template-btn" onclick="doAction('${t.action}')">
          <div class="template-name">${t.name}</div>
          <div class="template-desc">${t.desc}</div>
        </button>
      `).join('')}
    </div>
  `;
}

function showNoRecommendations() {
  document.getElementById('content').innerHTML = `
    <div class="no-rec">
      <div class="icon">✅</div>
      <h3>Keine Empfehlungen</h3>
      <p>Aktuell keine priorisierten Anrufe.</p>
    </div>
  `;
}

function showError(msg) {
  document.getElementById('content').innerHTML = `
    <div class="no-rec">
      <div class="icon">⚠️</div>
      <h3>Fehler</h3>
      <p>${msg}</p>
      <button onclick="loadRecommendations()" style="margin-top: 12px; padding: 8px 16px; cursor: pointer;">
        Erneut versuchen
      </button>
    </div>
  `;
}

function showSuccess(message) {
  document.getElementById('content').innerHTML = `
    <div class="success-msg">
      <div class="icon">✅</div>
      <h3>${message}</h3>
      <p>Aktion erfolgreich ausgeführt!</p>
      <button onclick="nextRecommendation()" style="margin-top: 12px; padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 8px; cursor: pointer;">
        ➡️ Nächste Empfehlung
      </button>
    </div>
  `;
}

async function doAction(action) {
  if (!currentRecommendation) return;
  
  const contactId = currentRecommendation.contactId;
  const btn = event.target;
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳...';
  btn.disabled = true;

  try {
    let endpoint = `${API_BASE}/unified/action/${action}/${contactId}`;
    let body = {};

    if (action === 'call' || action === 'sms-then-call') {
      body = { agentPhone: AGENT_PHONE };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await res.json();

    if (result.error) {
      alert('Fehler: ' + result.error);
      btn.innerHTML = originalText;
      btn.disabled = false;
    } else {
      showSuccess(getActionLabel(action));
    }
  } catch (error) {
    alert('Fehler: ' + error.message);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function getActionLabel(action) {
  const labels = {
    'call': 'Anruf gestartet',
    'sms-then-call': 'SMS gesendet + Anruf',
    'meeting-proposal': 'Terminvorschlag gesendet',
    'create-task': 'Zendesk Task erstellt',
    'followup': 'Follow-Up gesendet',
    'send-info': 'Info-Material gesendet'
  };
  return labels[action] || 'Aktion ausgeführt';
}

async function skipAndNext() {
  if (!currentRecommendation) return;
  
  try {
    await fetch(`${API_BASE}/unified/action/skip/${currentRecommendation.contactId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Übersprungen via Extension' })
    });
  } catch (e) {}
  
  nextRecommendation();
}

function nextRecommendation() {
  if (currentIndex < recommendations.length - 1) {
    showRecommendation(currentIndex + 1);
  } else {
    showNoRecommendations();
  }
}

// Init
document.addEventListener('DOMContentLoaded', loadRecommendations);
