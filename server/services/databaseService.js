/**
 * PostgreSQL Database Service
 * Verbindung zur Railway PostgreSQL Datenbank
 */

import pg from 'pg';
import logger from '../utils/logger.js';

const { Pool } = pg;

class DatabaseService {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      logger.warn('DATABASE_URL nicht gesetzt - Datenbank deaktiviert');
      return;
    }

    try {
      this.pool = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.initialized = true;
      logger.info('✅ PostgreSQL Datenbank verbunden');
    } catch (error) {
      logger.error('❌ PostgreSQL Verbindung fehlgeschlagen', { error: error.message });
      throw error;
    }
  }

  isConfigured() {
    return !!process.env.DATABASE_URL;
  }

  async query(text, params) {
    if (!this.initialized) await this.initialize();
    if (!this.pool) throw new Error('Datenbank nicht konfiguriert');
    
    const start = Date.now();
    const result = await this.pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('DB Query', { text: text.substring(0, 50), duration, rows: result.rowCount });
    return result;
  }

  async getClient() {
    if (!this.initialized) await this.initialize();
    if (!this.pool) throw new Error('Datenbank nicht konfiguriert');
    return this.pool.connect();
  }

  // ============================================
  // SCHEMA SETUP
  // ============================================

  async setupSchema() {
    const schema = `
      -- Leads Tabelle (Cache von Close CRM)
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        status VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        custom_fields JSONB DEFAULT '{}',
        renew_score DECIMAL(5,2),
        renew_trust_level VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        synced_at TIMESTAMP DEFAULT NOW()
      );

      -- Makler Tabelle
      CREATE TABLE IF NOT EXISTS makler (
        id VARCHAR(50) PRIMARY KEY,
        close_lead_id VARCHAR(50),
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        plz VARCHAR(10),
        umkreis_km INTEGER DEFAULT 30,
        kontingent INTEGER DEFAULT 0,
        partner_abo VARCHAR(50),
        erfolgsquote DECIMAL(5,2) DEFAULT 0,
        leads_verkauft INTEGER DEFAULT 0,
        leads_verloren INTEGER DEFAULT 0,
        renew_score DECIMAL(5,2),
        aktiv BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Eigentuemer/Immobilien Leads
      CREATE TABLE IF NOT EXISTS eigentuemer (
        id VARCHAR(50) PRIMARY KEY,
        close_lead_id VARCHAR(50),
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        plz VARCHAR(10),
        immobilien_typ VARCHAR(100),
        zugewiesener_makler_id VARCHAR(50),
        zuweisung_datum TIMESTAMP,
        status VARCHAR(50) DEFAULT 'neu',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Aktivitäten Log
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR(50),
        activity_type VARCHAR(50),
        direction VARCHAR(20),
        content TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Webhooks Log
      CREATE TABLE IF NOT EXISTS webhook_log (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50),
        event_type VARCHAR(100),
        payload JSONB,
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Renew Scores History
      CREATE TABLE IF NOT EXISTS renew_scores (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR(50),
        score_type VARCHAR(50),
        score_value DECIMAL(5,2),
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Indices
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
      CREATE INDEX IF NOT EXISTS idx_makler_plz ON makler(plz);
      CREATE INDEX IF NOT EXISTS idx_makler_aktiv ON makler(aktiv);
      CREATE INDEX IF NOT EXISTS idx_eigentuemer_plz ON eigentuemer(plz);
      CREATE INDEX IF NOT EXISTS idx_eigentuemer_status ON eigentuemer(status);
      CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_processed ON webhook_log(processed);
      CREATE INDEX IF NOT EXISTS idx_renew_scores_lead ON renew_scores(lead_id);
    `;

    await this.query(schema);
    logger.info('✅ Datenbank Schema erstellt');
    return { success: true };
  }

  // ============================================
  // LEAD OPERATIONS
  // ============================================

  async upsertLead(lead) {
    const sql = `
      INSERT INTO leads (id, name, status, email, phone, custom_fields, renew_score, renew_trust_level, updated_at, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        custom_fields = EXCLUDED.custom_fields,
        renew_score = EXCLUDED.renew_score,
        renew_trust_level = EXCLUDED.renew_trust_level,
        updated_at = NOW(),
        synced_at = NOW()
      RETURNING *
    `;
    const result = await this.query(sql, [
      lead.id, lead.name, lead.status, lead.email, lead.phone,
      JSON.stringify(lead.custom_fields || {}), lead.renew_score, lead.renew_trust_level
    ]);
    return result.rows[0];
  }

  async getLeadById(id) {
    const result = await this.query('SELECT * FROM leads WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getLeadsByStatus(status) {
    const result = await this.query('SELECT * FROM leads WHERE status = $1 ORDER BY updated_at DESC', [status]);
    return result.rows;
  }

  // ============================================
  // MAKLER OPERATIONS
  // ============================================

  async upsertMakler(makler) {
    const sql = `
      INSERT INTO makler (id, close_lead_id, name, email, phone, plz, umkreis_km, kontingent, partner_abo, erfolgsquote, leads_verkauft, leads_verloren, renew_score, aktiv, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        plz = EXCLUDED.plz,
        umkreis_km = EXCLUDED.umkreis_km,
        kontingent = EXCLUDED.kontingent,
        partner_abo = EXCLUDED.partner_abo,
        erfolgsquote = EXCLUDED.erfolgsquote,
        leads_verkauft = EXCLUDED.leads_verkauft,
        leads_verloren = EXCLUDED.leads_verloren,
        renew_score = EXCLUDED.renew_score,
        aktiv = EXCLUDED.aktiv,
        updated_at = NOW()
      RETURNING *
    `;
    const result = await this.query(sql, [
      makler.id, makler.close_lead_id, makler.name, makler.email, makler.phone,
      makler.plz, makler.umkreis_km || 30, makler.kontingent || 0, makler.partner_abo,
      makler.erfolgsquote || 0, makler.leads_verkauft || 0, makler.leads_verloren || 0,
      makler.renew_score, makler.aktiv !== false
    ]);
    return result.rows[0];
  }

  async getMaklerByPLZ(plz, umkreis = 30) {
    const sql = `
      SELECT * FROM makler 
      WHERE aktiv = true AND kontingent > 0
      ORDER BY erfolgsquote DESC, renew_score DESC NULLS LAST
      LIMIT 10
    `;
    const result = await this.query(sql);
    return result.rows;
  }

  async getTopMakler(limit = 10) {
    const sql = `
      SELECT * FROM makler 
      WHERE aktiv = true
      ORDER BY erfolgsquote DESC, leads_verkauft DESC
      LIMIT $1
    `;
    const result = await this.query(sql, [limit]);
    return result.rows;
  }

  // ============================================
  // ACTIVITY LOGGING
  // ============================================

  async logActivity(leadId, type, direction, content, metadata = {}) {
    const sql = `
      INSERT INTO activities (lead_id, activity_type, direction, content, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await this.query(sql, [leadId, type, direction, content, JSON.stringify(metadata)]);
    return result.rows[0];
  }

  async getActivitiesByLead(leadId, limit = 50) {
    const sql = `
      SELECT * FROM activities 
      WHERE lead_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    const result = await this.query(sql, [leadId, limit]);
    return result.rows;
  }

  // ============================================
  // WEBHOOK LOGGING
  // ============================================

  async logWebhook(source, eventType, payload) {
    const sql = `
      INSERT INTO webhook_log (source, event_type, payload)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await this.query(sql, [source, eventType, JSON.stringify(payload)]);
    return result.rows[0];
  }

  // ============================================
  // RENEW SCORES
  // ============================================

  async saveRenewScore(leadId, scoreType, scoreValue, details = {}) {
    const sql = `
      INSERT INTO renew_scores (lead_id, score_type, score_value, details)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await this.query(sql, [leadId, scoreType, scoreValue, JSON.stringify(details)]);
    return result.rows[0];
  }

  async getRenewScoreHistory(leadId, limit = 20) {
    const sql = `
      SELECT * FROM renew_scores 
      WHERE lead_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    const result = await this.query(sql, [leadId, limit]);
    return result.rows;
  }

  // ============================================
  // STATS
  // ============================================

  async getStats() {
    const stats = await this.query(`
      SELECT 
        (SELECT COUNT(*) FROM leads) as total_leads,
        (SELECT COUNT(*) FROM makler WHERE aktiv = true) as active_makler,
        (SELECT COUNT(*) FROM eigentuemer) as total_eigentuemer,
        (SELECT COUNT(*) FROM activities WHERE created_at > NOW() - INTERVAL '24 hours') as activities_24h,
        (SELECT COUNT(*) FROM webhook_log WHERE created_at > NOW() - INTERVAL '24 hours') as webhooks_24h
    `);
    return stats.rows[0];
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.initialized = false;
      logger.info('PostgreSQL Verbindung geschlossen');
    }
  }
}

export const databaseService = new DatabaseService();
export default databaseService;
