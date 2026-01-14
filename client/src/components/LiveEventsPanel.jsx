/**
 * Live Events Panel
 * Zeigt alle Zoom-Events in Echtzeit als scrollbare Liste
 */

import { useState, useMemo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { Zap, ChevronDown, Trash2, RefreshCw, Filter } from 'lucide-react';

export function LiveEventsPanel({ className = '' }) {
  const { 
    events, 
    isConnected,
    connectionStatus,
    clearEvents,
    stats,
    requestStats 
  } = useWebSocket();
  
  const [filter, setFilter] = useState('all');
  const [isExpanded, setIsExpanded] = useState(true);

  // Event-Typen für Filter extrahieren
  const eventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.type));
    return ['all', ...Array.from(types)];
  }, [events]);

  // Gefilterte Events
  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter(e => e.type === filter);
  }, [events, filter]);

  // Zeit formatieren
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Zeitdifferenz berechnen
  const getTimeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `vor ${seconds}s`;
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}m`;
    return `vor ${Math.floor(seconds / 3600)}h`;
  };

  const statusColors = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    reconnecting: 'bg-yellow-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500'
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-zoom-blue to-blue-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">Live Events</h3>
              <p className="text-sm text-blue-100">{events.length} Events</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <div className="flex items-center gap-2 text-sm bg-white/20 px-3 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                {(connectionStatus === 'connected' || connectionStatus === 'connecting') && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusColors[connectionStatus]} opacity-75`}></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColors[connectionStatus]}`}></span>
              </span>
              <span>{connectionStatus === 'connected' ? 'Live' : connectionStatus}</span>
            </div>
            
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter & Actions */}
        {isExpanded && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1.5">
              <Filter className="w-4 h-4" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-transparent border-0 text-sm text-white focus:ring-0 cursor-pointer"
              >
                {eventTypes.map(type => (
                  <option key={type} value={type} className="text-gray-900">
                    {type === 'all' ? 'Alle Events' : type}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={clearEvents}
              className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-sm py-1.5 px-3 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Leeren
            </button>
            
            <button
              onClick={requestStats}
              className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-sm py-1.5 px-3 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Stats
            </button>
          </div>
        )}
      </div>

      {/* Events Liste */}
      {isExpanded && (
        <div className="max-h-[500px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <Zap className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="font-medium">Keine Events</p>
              <p className="text-sm">Events werden hier live angezeigt</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredEvents.map((event, index) => (
                <EventItem key={event.id || index} event={event} formatTime={formatTime} getTimeAgo={getTimeAgo} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Einzelnes Event Item
function EventItem({ event, formatTime, getTimeAgo }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const ui = event.ui || {
    icon: '📌',
    title: event.type,
    message: 'Event empfangen',
    color: 'gray'
  };

  const colorClasses = {
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  };

  const bgColor = colorClasses[ui.color] || colorClasses.gray;

  return (
    <div 
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center text-lg`}>
          {ui.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-gray-900 dark:text-white truncate">{ui.title}</p>
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
              {getTimeAgo(event.timestamp)}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{ui.message}</p>
          
          {/* Event Type Badge */}
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {event.type}
          </span>
        </div>

        {/* Expand Icon */}
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 ml-13 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs">
          <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-300">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Event ID:</span>
              <span className="ml-2 font-mono">{event.id?.slice(0, 8)}...</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Zeit:</span>
              <span className="ml-2">{formatTime(event.timestamp)}</span>
            </div>
            {ui.meetingId && (
              <div className="col-span-2">
                <span className="text-gray-500 dark:text-gray-400">Meeting ID:</span>
                <span className="ml-2 font-mono">{ui.meetingId}</span>
              </div>
            )}
          </div>
          
          {/* Raw Payload Toggle */}
          <details className="mt-2">
            <summary className="text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
              Raw Payload anzeigen
            </summary>
            <pre className="mt-2 p-2 bg-gray-900 text-green-400 rounded overflow-x-auto text-xs max-h-48">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default LiveEventsPanel;
