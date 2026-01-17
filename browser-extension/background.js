// Background Service Worker
// Prüft periodisch auf neue Empfehlungen und zeigt Notifications

const API_BASE = 'https://zoom-control-center-production.up.railway.app/api';

// Alle 15 Minuten auf urgente Empfehlungen prüfen
chrome.alarms.create('checkRecommendations', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkRecommendations') {
    await checkForUrgentRecommendations();
  }
});

async function checkForUrgentRecommendations() {
  try {
    const res = await fetch(`${API_BASE}/unified/recommendations?limit=5`);
    const data = await res.json();
    const recs = data.recommendations || [];
    
    const urgent = recs.filter(r => r.priority === 'urgent');
    
    if (urgent.length > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '🔥 Dringende Anrufe!',
        message: `${urgent.length} Kontakt(e) sollten SOFORT angerufen werden!`,
        priority: 2
      });
    }

    // Badge aktualisieren
    chrome.action.setBadgeText({ text: recs.length > 0 ? String(recs.length) : '' });
    chrome.action.setBadgeBackgroundColor({ color: urgent.length > 0 ? '#dc2626' : '#1a73e8' });

  } catch (error) {
    console.error('Check recommendations failed:', error);
  }
}

// Initial check
checkForUrgentRecommendations();

// Notification click handler
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: `${API_BASE.replace('/api', '')}/unified-dashboard` });
});
