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
   * Transkribiert Audio mit Whisper API
   * @param {Buffer|ReadableStream} audioData - Audio-Daten
   * @param {Object} options - Optionen
   * @returns {Promise<{text: string, language: string, duration: number}>}
   */
  async transcribeAudio(audioData, options = {}) {
    if (!this.initialize()) {
      throw new Error('OpenAI Service nicht initialisiert - OPENAI_API_KEY setzen');
    }

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    // Audio-Datei hinzufügen
    formData.append('file', audioData, {
      filename: options.filename || 'audio.mp3',
      contentType: options.contentType || 'audio/mpeg'
    });
    formData.append('model', 'whisper-1');
    formData.append('language', options.language || 'de');
    formData.append('response_format', 'verbose_json');
    
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Whisper API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    logger.info('🎤 Audio transkribiert', { 
      duration: data.duration,
      language: data.language,
      textLength: data.text?.length 
    });

    return {
      text: data.text,
      language: data.language,
      duration: data.duration,
      segments: data.segments
    };
  }

  /**
   * Transkribiert Audio von URL (z.B. Twilio Recording)
   * @param {string} audioUrl - URL zur Audio-Datei
   * @param {Object} options - Optionen
   */
  async transcribeFromUrl(audioUrl, options = {}) {
    if (!this.initialize()) {
      throw new Error('OpenAI Service nicht initialisiert');
    }

    logger.info('🎤 Lade Audio von URL...', { url: audioUrl.substring(0, 50) + '...' });

    // Audio herunterladen
    const audioResponse = await fetch(audioUrl, {
      headers: options.authHeader ? { 'Authorization': options.authHeader } : {}
    });

    if (!audioResponse.ok) {
      throw new Error(`Audio download failed: ${audioResponse.status} ${audioResponse.statusText}`);
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    
    // Dateityp aus URL oder Content-Type ermitteln
    const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
    const extension = contentType.includes('wav') ? 'wav' : 'mp3';

    return this.transcribeAudio(audioBuffer, {
      ...options,
      filename: `recording.${extension}`,
      contentType
    });
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
