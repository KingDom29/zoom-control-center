/**
 * OpenAI Service für KI-gestützte Follow-ups und Analysen
 * Generiert personalisierte E-Mail-Texte und Meeting-Zusammenfassungen
 */

import logger from '../utils/logger.js';

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    this.baseUrl = 'https://api.openai.com/v1';
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return true;
    
    if (!this.apiKey) {
      logger.warn('⚠️ OpenAI Service: API Key nicht konfiguriert (OPENAI_API_KEY)');
      return false;
    }
    
    this.initialized = true;
    logger.info('🤖 OpenAI Service initialized');
    return true;
  }

  /**
   * Chat Completion Request
   */
  async chat(messages, options = {}) {
    if (!this.initialize()) {
      throw new Error('OpenAI Service nicht initialisiert - OPENAI_API_KEY setzen');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 1000
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Generiert Follow-up E-Mail nach Meeting
   */
  async generateMeetingFollowUp({ meetingTopic, hostName, participants, duration, notes = '' }) {
    const participantList = participants?.map(p => p.user_name || p.email).join(', ') || 'Teilnehmer';
    
    const prompt = `Du bist ein professioneller Business-Assistent für ein Immobilien-Software-Unternehmen (Maklerplan).
    
Erstelle eine freundliche, professionelle Follow-up E-Mail auf Deutsch nach einem Zoom-Meeting.

Meeting-Details:
- Thema: ${meetingTopic}
- Host: ${hostName}
- Teilnehmer: ${participantList}
- Dauer: ${duration} Minuten
${notes ? `- Notizen: ${notes}` : ''}

Die E-Mail soll:
1. Sich für die Zeit bedanken
2. Die wichtigsten besprochenen Punkte zusammenfassen (falls Notizen vorhanden)
3. Einen klaren Call-to-Action enthalten (z.B. nächster Termin, Feedback, Testaccount)
4. Professionell aber persönlich klingen

Format: Nur den E-Mail-Text, ohne Betreffzeile. HTML-formatiert mit einfachen Tags (<p>, <strong>, <ul>, <li>).`;

    return this.chat([
      { role: 'system', content: 'Du bist ein erfahrener Sales-Assistent für Maklerplan, eine Software für Immobilienmakler.' },
      { role: 'user', content: prompt }
    ]);
  }

  /**
   * Generiert personalisierte Webinar-Einladung
   */
  async generateWebinarInvitation({ webinarTopic, targetAudience, date, benefits = [] }) {
    const benefitsList = benefits.length > 0 ? benefits.join('\n- ') : 'Effizienzsteigerung im Makleralltag';
    
    const prompt = `Erstelle eine überzeugende Webinar-Einladung auf Deutsch.

Webinar-Details:
- Thema: ${webinarTopic}
- Zielgruppe: ${targetAudience}
- Datum: ${date}
- Vorteile für Teilnehmer:
- ${benefitsList}

Die Einladung soll:
1. Neugier wecken
2. Den Nutzen klar kommunizieren
3. Dringlichkeit erzeugen (begrenzte Plätze)
4. Einen starken Call-to-Action haben

Format: HTML-formatiert. Professionell aber nicht steif.`;

    return this.chat([
      { role: 'system', content: 'Du bist Marketing-Experte für B2B SaaS im Immobilienbereich.' },
      { role: 'user', content: prompt }
    ]);
  }

  /**
   * Analysiert Meeting-Erfolg basierend auf Metriken
   */
  async analyzeMeetingSuccess({ meetingTopic, duration, participantCount, participantEngagement }) {
    const prompt = `Analysiere dieses Meeting und gib eine kurze Einschätzung:

Meeting: ${meetingTopic}
Dauer: ${duration} Minuten (geplant vs. tatsächlich)
Teilnehmer: ${participantCount}
Engagement: ${JSON.stringify(participantEngagement)}

Bewerte auf einer Skala von 1-10:
1. Engagement-Score
2. Conversion-Wahrscheinlichkeit
3. Empfehlung für Follow-up Timing

Antworte im JSON-Format:
{
  "engagementScore": number,
  "conversionProbability": number,
  "followUpTiming": "sofort" | "24h" | "48h" | "1woche",
  "recommendation": "string",
  "keyInsights": ["string"]
}`;

    const response = await this.chat([
      { role: 'system', content: 'Du bist ein Sales-Analytics-Experte. Antworte nur mit validem JSON.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3 });

    try {
      return JSON.parse(response);
    } catch {
      return {
        engagementScore: 5,
        conversionProbability: 50,
        followUpTiming: '24h',
        recommendation: response,
        keyInsights: []
      };
    }
  }

  /**
   * Generiert E-Mail-Betreffzeile
   */
  async generateSubjectLine({ context, tone = 'professional' }) {
    const prompt = `Generiere 3 E-Mail-Betreffzeilen für folgenden Kontext:
${context}

Ton: ${tone}
Zielgruppe: Immobilienmakler in Deutschland

Antworte nur mit den 3 Betreffzeilen, eine pro Zeile.`;

    const response = await this.chat([
      { role: 'user', content: prompt }
    ], { temperature: 0.8, maxTokens: 200 });

    return response.split('\n').filter(line => line.trim()).slice(0, 3);
  }

  /**
   * Extrahiert Action Items aus Meeting-Transkript
   */
  async extractActionItems(transcript) {
    const prompt = `Extrahiere alle Action Items aus diesem Meeting-Transkript:

${transcript}

Antworte im JSON-Format:
{
  "actionItems": [
    {
      "task": "string",
      "assignee": "string oder null",
      "deadline": "string oder null",
      "priority": "high" | "medium" | "low"
    }
  ],
  "summary": "string (2-3 Sätze)"
}`;

    const response = await this.chat([
      { role: 'system', content: 'Du bist ein Meeting-Assistent. Antworte nur mit validem JSON.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.2 });

    try {
      return JSON.parse(response);
    } catch {
      return { actionItems: [], summary: response };
    }
  }
}

export const openaiService = new OpenAIService();
export default openaiService;
