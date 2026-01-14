/**
 * useWebSocket / useZoomRealtime Hook
 * React Hook für WebSocket-Verbindung zu Zoom Echtzeit-Events
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '../utils/logger.js';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export function useWebSocket(options = {}) {
  const {
    autoConnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    subscriptions = ['*'],
    onEvent,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [clientId, setClientId] = useState(null);
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [lastMessage, setLastMessage] = useState(null);
  const [stats, setStats] = useState({ connectedClients: 0 });

  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');
    logger.info('🔌 Verbinde zu WebSocket...');

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        logger.info('✅ WebSocket verbunden');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;

        if (subscriptions.length > 0 && !subscriptions.includes('*')) {
          wsRef.current.send(JSON.stringify({
            type: 'subscribe',
            events: subscriptions
          }));
        }

        onConnect?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        logger.info('❌ WebSocket geschlossen:', event.code);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setClientId(null);
        onDisconnect?.();

        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          setConnectionStatus('reconnecting');
          reconnectTimeoutRef.current = setTimeout(() => {
            logger.info(`🔄 Reconnect Versuch ${reconnectAttempts.current}/${maxReconnectAttempts}`);
            connect();
          }, reconnectInterval);
        }
      };

      wsRef.current.onerror = (error) => {
        logger.error('WebSocket error:', error);
        setConnectionStatus('error');
        onError?.(error);
      };

    } catch (error) {
      logger.error('Failed to create WebSocket:', error);
      setConnectionStatus('error');
    }
  }, [subscriptions, onConnect, onDisconnect, onError, reconnectInterval, maxReconnectAttempts]);

  const handleMessage = useCallback((message) => {
    setLastMessage(message);

    switch (message.type) {
      case 'connection':
        setClientId(message.clientId);
        break;

      case 'event':
        const newEvent = {
          ...message.data,
          receivedAt: new Date().toISOString()
        };
        
        setEvents(prev => [newEvent, ...prev].slice(0, 100));
        
        // Add to notifications
        const notification = {
          id: newEvent.id || Date.now(),
          ...newEvent,
          read: false
        };
        setNotifications(prev => [notification, ...prev].slice(0, 50));
        
        onEvent?.(newEvent);
        break;

      case 'stats':
        setStats(message);
        break;

      case 'subscribed':
        logger.info('Subscribed to:', message.events);
        break;

      case 'pong':
        break;

      default:
        logger.warn('Unknown message type:', message.type);
    }
  }, [onEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectAttempts.current = maxReconnectAttempts;
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, [maxReconnectAttempts]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((eventTypes) => {
    send({ type: 'subscribe', events: Array.isArray(eventTypes) ? eventTypes : [eventTypes] });
  }, [send]);

  const unsubscribe = useCallback((eventTypes) => {
    send({ type: 'unsubscribe', events: Array.isArray(eventTypes) ? eventTypes : [eventTypes] });
  }, [send]);

  const joinMeetingRoom = useCallback((meetingId) => {
    send({ type: 'join_room', room: `meeting:${meetingId}` });
  }, [send]);

  const leaveMeetingRoom = useCallback((meetingId) => {
    send({ type: 'leave_room', room: `meeting:${meetingId}` });
  }, [send]);

  const requestStats = useCallback(() => {
    send({ type: 'get_stats' });
  }, [send]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        reconnectAttempts.current = maxReconnectAttempts;
        wsRef.current.close();
      }
    };
  }, [autoConnect, connect, maxReconnectAttempts]);

  return {
    // State
    isConnected,
    connectionStatus,
    clientId,
    events,
    notifications,
    lastMessage,
    stats,
    unreadCount: notifications.filter(n => !n.read).length,
    
    // Actions
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    joinMeetingRoom,
    leaveMeetingRoom,
    requestStats,
    clearEvents,
    clearNotifications,
    markAsRead,
    markAllAsRead,
    send
  };
}

// Alias for compatibility
export const useZoomRealtime = useWebSocket;
export default useWebSocket;
