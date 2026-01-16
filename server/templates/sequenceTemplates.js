export const SEQUENCE_EMAIL_TEMPLATES = {
  seq_cold_1_intro: {
    id: 'seq_cold_1_intro',
    name: 'Sequence Cold: Intro',
    subject: 'Kurze Frage, {{vorname}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>kurze Frage: Wie viel Zeit verbringen Sie aktuell pro Woche mit Admin-Aufgaben statt mit Kunden?</p>
        <p>Viele Makler sparen mit klaren Prozessen und Automatisierung sofort mehrere Stunden pro Woche.</p>
        <p>Hätten Sie 15 Minuten für einen kurzen Austausch?</p>
        <p><a href="{{booking_url}}">→ Termin buchen</a></p>
        <p>Viele Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_cold_2_value: {
    id: 'seq_cold_2_value',
    name: 'Sequence Cold: Value',
    subject: 'In {{city}}: Weniger Admin, mehr Akquise',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>Makler in {{city}} berichten oft von ähnlichen Themen: Termine koordinieren, Follow-ups, Übersicht behalten.</p>
        <p>Wir haben dafür ein Setup, das direkt im Alltag Zeit spart.</p>
        <p>Wenn Sie möchten, zeige ich Ihnen das in 15 Minuten:</p>
        <p><a href="{{booking_url}}">→ Kurztermin auswählen</a></p>
        <p>Viele Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_cold_3_followup: {
    id: 'seq_cold_3_followup',
    name: 'Sequence Cold: Follow-up',
    subject: 'Kurze Nachfrage',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>kurze Nachfrage zu meiner letzten Nachricht.</p>
        <p>Falls es gerade nicht passt: Kein Stress. Wenn Sie möchten, wählen Sie hier einfach einen passenden Slot:</p>
        <p><a href="{{booking_url}}">→ Termin buchen</a></p>
        <p>Beste Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_cold_4_last_chance: {
    id: 'seq_cold_4_last_chance',
    name: 'Sequence Cold: Last Chance',
    subject: 'Soll ich mich wieder melden?',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>ich möchte nicht nerven – soll ich mich in ein paar Monaten nochmal melden?</p>
        <p>Wenn Sie möchten, können Sie jederzeit hier einen Termin buchen:</p>
        <p><a href="{{booking_url}}">→ Termin buchen</a></p>
        <p>Alles Gute<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_enterprise_1_intro: {
    id: 'seq_enterprise_1_intro',
    name: 'Sequence Enterprise: Intro',
    subject: 'Kurzer Austausch zu Prozessen bei {{firma}}?',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>ich habe mir {{firma}} angesehen. Viele größere Teams kämpfen mit denselben Engpässen: Termine, Follow-ups, Reporting, Transparenz im Team.</p>
        <p>Hätten Sie 15 Minuten für eine kurze Demo?</p>
        <p><a href="{{booking_url}}">→ Demo buchen</a></p>
        <p>Viele Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_enterprise_2_roi: {
    id: 'seq_enterprise_2_roi',
    name: 'Sequence Enterprise: ROI',
    subject: 'ROI: 2 Stunden/Woche sparen = großer Effekt',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>kurzer ROI-Gedanke: Wenn Ihr Team pro Woche nur 2 Stunden Admin spart, sind das im Jahr schnell viele Stunden produktive Zeit.</p>
        <p>Wenn Sie möchten, rechnen wir das kurz für {{firma}} durch:</p>
        <p><a href="{{booking_url}}">→ ROI-Call</a></p>
        <p>Beste Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_enterprise_3_case_study: {
    id: 'seq_enterprise_3_case_study',
    name: 'Sequence Enterprise: Case Study',
    subject: 'Kurze Case Study (ähnliches Team)',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>kurze Case Study: Ein Makler-Team mit ähnlicher Größe hat Meetings, Erinnerungen und Follow-ups standardisiert – und sofort Kapazität gewonnen.</p>
        <p>Wenn Sie möchten, zeige ich Ihnen die wichtigsten Stellschrauben:</p>
        <p><a href="{{booking_url}}">→ Termin sichern</a></p>
        <p>Viele Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_solo_1_intro: {
    id: 'seq_solo_1_intro',
    name: 'Sequence Solo: Intro',
    subject: 'Als Einzelmakler: Zeit sparen ohne Stress',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>als Einzelmakler zählt jede Stunde. Viele Dinge lassen sich mit einem einfachen Setup automatisieren: Einladungen, Erinnerungen, Follow-ups.</p>
        <p>Hätten Sie 15 Minuten für einen kurzen Austausch?</p>
        <p><a href="{{booking_url}}">→ Termin buchen</a></p>
        <p>Viele Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_solo_2_tools: {
    id: 'seq_solo_2_tools',
    name: 'Sequence Solo: Tools',
    subject: '5 Dinge, die solo sofort Zeit sparen',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>5 Dinge, die solo richtig Zeit sparen:</p>
        <ul>
          <li>Feste Templates</li>
          <li>Automatisierte Termine</li>
          <li>Klare Follow-up Regeln</li>
          <li>Pipeline mit Prioritäten</li>
          <li>Einfaches Reporting</li>
        </ul>
        <p>Wenn Sie möchten, zeige ich Ihnen ein Setup, das in der Praxis funktioniert:</p>
        <p><a href="{{booking_url}}">→ Termin sichern</a></p>
        <p>Beste Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_regional_1_intro: {
    id: 'seq_regional_1_intro',
    name: 'Sequence Regional: Intro',
    subject: 'Viele Makler in {{state}} optimieren 2026 Prozesse',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>wir unterstützen bereits Makler in {{state}} dabei, effizienter zu arbeiten (Termine, Follow-ups, Übersicht im Team).</p>
        <p>Hätten Sie Interesse an einem kurzen Austausch?</p>
        <p><a href="{{booking_url}}">→ 15-Minuten-Gespräch</a></p>
        <p>Viele Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  seq_regional_2_stats: {
    id: 'seq_regional_2_stats',
    name: 'Sequence Regional: Stats',
    subject: 'In {{city}}: mehr Zeit für Kunden statt Admin',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        <p>kurzer Gedanke: Wer Prozesse im Griff hat, gewinnt sofort Kapazität für Akquise und Kundenbetreuung.</p>
        <p>Wenn Sie möchten, zeige ich Ihnen ein konkretes Setup:</p>
        <p><a href="{{booking_url}}">→ Termin buchen</a></p>
        <p>Beste Grüße<br><strong>{{sender_name}}</strong></p>
      </div>
    `
  }
};

export default SEQUENCE_EMAIL_TEMPLATES;
