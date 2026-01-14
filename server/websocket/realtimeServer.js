/**
 * WebSocket Server für Echtzeit-Updates
 * Verwaltet Client-Verbindungen und broadcastet Zoom Events
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

export class RealtimeServer {
  constructor(server, options = {}) {
    this.wss = new WebSocketServer({ 
      server,
      path: options.path || '/ws'
    });
    
    this.clients = new Map(); // clientId -> { ws, subscriptions, metadata }
    this.rooms = new Map();   // roomName -> Set<clientId>
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    
    this.setupConnectionHandler();
    this.startHeartbeat();
    
    logger.info('🔌 WebSocket Server initialized');
  }

  setupConnectionHandler() {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const clientIp = req.socket.remoteAddress;
      
      // Client registrieren
      this.clients.set(clientId, {
        ws,
        subscriptions: new Set(['*']), // Default: alle Events
        metadata: {
          connectedAt: new Date().toISOString(),
          ip: clientIp,
          userAgent: req.headers['user-agent']
        },
        isAlive: true
      });

      logger.info(`✅ Client connected: ${clientId} (Total: ${this.clients.size})`);

      // Welcome Message senden
      this.sendToClient(clientId, {
        type: 'connection',
        status: 'connected',
        clientId,
        timestamp: Date.now(),
        message: 'Verbindung hergestellt'
      });

      // Message Handler
      ws.on('message', (data) => {
        this.handleClientMessage(clientId, data);
      });

      // Pong für Heartbeat
      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) client.isAlive = true;
      });

      // Disconnect Handler
      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${clientId}`, { error: error.message });
        this.handleDisconnect(clientId);
      });
    });
  }

  handleClientMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      
      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          // Zu bestimmten Event-Typen subscriben
          if (Array.isArray(message.events)) {
            message.events.forEach(event => client.subscriptions.add(event));
          }
          this.sendToClient(clientId, {
            type: 'subscribed',
            events: Array.from(client.subscriptions)
          });
          break;

        case 'unsubscribe':
          // Events abbestellen
          if (Array.isArray(message.events)) {
            message.events.forEach(event => client.subscriptions.delete(event));
          }
          this.sendToClient(clientId, {
            type: 'unsubscribed',
            events: Array.from(client.subscriptions)
          });
          break;

        case 'join_room':
          // Einem Raum beitreten (z.B. für Meeting-spezifische Updates)
          this.joinRoom(clientId, message.room);
          break;

        case 'leave_room':
          this.leaveRoom(clientId, message.room);
          break;

        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
          break;

        case 'get_stats':
          this.sendToClient(clientId, {
            type: 'stats',
            connectedClients: this.clients.size,
            rooms: Array.from(this.rooms.keys())
          });
          break;

        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error parsing client message', { error: error.message });
    }
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      // Aus allen Räumen entfernen
      this.rooms.forEach((clients, roomName) => {
        clients.delete(clientId);
        if (clients.size === 0) {
          this.rooms.delete(roomName);
        }
      });
      
      this.clients.delete(clientId);
      logger.info(`❌ Client disconnected: ${clientId} (Total: ${this.clients.size})`);
    }
  }

  joinRoom(clientId, roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName).add(clientId);
    
    this.sendToClient(clientId, {
      type: 'room_joined',
      room: roomName
    });
  }

  leaveRoom(clientId, roomName) {
    const room = this.rooms.get(roomName);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }
    
    this.sendToClient(clientId, {
      type: 'room_left',
      room: roomName
    });
  }

  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcast an alle Clients die für diesen Event-Typ subscribed sind
   */
  broadcast(event) {
    const eventType = event.type;
    
    this.clients.forEach((client, clientId) => {
      // Prüfen ob Client für diesen Event-Typ subscribed ist
      if (client.subscriptions.has('*') || client.subscriptions.has(eventType)) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'event',
            data: event,
            timestamp: Date.now()
          }));
        }
      }
    });
  }

  /**
   * Broadcast an einen bestimmten Raum
   */
  broadcastToRoom(roomName, data) {
    const room = this.rooms.get(roomName);
    if (room) {
      room.forEach(clientId => {
        this.sendToClient(clientId, data);
      });
    }
  }

  /**
   * Heartbeat um tote Verbindungen zu erkennen
   */
  startHeartbeat() {
    setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.handleDisconnect(clientId);
          return;
        }
        
        client.isAlive = false;
        client.ws.ping();
      });
    }, this.heartbeatInterval);
  }

  /**
   * Server Stats
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      rooms: Array.from(this.rooms.entries()).map(([name, clients]) => ({
        name,
        clientCount: clients.size
      })),
      uptime: process.uptime()
    };
  }

  /**
   * Alle Clients mit Metadaten
   */
  getConnectedClients() {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      ...client.metadata,
      subscriptions: Array.from(client.subscriptions)
    }));
  }
}

export default RealtimeServer;
