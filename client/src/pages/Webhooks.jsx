import { useState, useEffect } from 'react';
import { 
  Webhook, RefreshCw, Trash2, Clock, 
  CheckCircle, AlertCircle, Info, Filter,
  Video, Users, HardDrive, Bell
} from 'lucide-react';
import { getWebhookEvents, getWebhookEventTypes, clearWebhookEvents } from '../api';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import logger from '../utils/logger.js';

function EventCard({ event }) {
  const getEventIcon = (eventType) => {
    if (eventType?.includes('meeting')) return Video;
    if (eventType?.includes('user')) return Users;
    if (eventType?.includes('recording')) return HardDrive;
    return Bell;
  };

  const getEventColor = (eventType) => {
    if (eventType?.includes('started') || eventType?.includes('created')) return 'bg-green-100 text-green-700';
    if (eventType?.includes('ended') || eventType?.includes('deleted')) return 'bg-red-100 text-red-700';
    if (eventType?.includes('updated')) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-700';
  };

  const Icon = getEventIcon(event.event);
  const colorClass = getEventColor(event.event);

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClass}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium text-gray-800">{event.event}</p>
            <p className="text-xs text-gray-500 mt-1">
              {format(new Date(event.received_at), 'dd.MM.yyyy HH:mm:ss', { locale: de })}
            </p>
          </div>
        </div>
      </div>

      {event.payload && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <pre className="text-xs text-gray-600 overflow-x-auto max-h-40">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Webhooks() {
  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsRes, typesRes] = await Promise.all([
        getWebhookEvents(100).catch(() => ({ data: { events: [] } })),
        getWebhookEventTypes().catch(() => ({ data: { event_types: [] } }))
      ]);
      setEvents(eventsRes.data?.events || []);
      setEventTypes(typesRes.data?.event_types || []);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll for new events every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleClear = async () => {
    if (!confirm('Alle Webhook-Events löschen?')) return;
    try {
      await clearWebhookEvents();
      setEvents([]);
    } catch (err) {
      alert('Fehler: ' + err.message);
    }
  };

  const filteredEvents = events.filter(e => 
    !filter || e.event?.toLowerCase().includes(filter.toLowerCase())
  );

  const stats = {
    total: events.length,
    meetings: events.filter(e => e.event?.includes('meeting')).length,
    users: events.filter(e => e.event?.includes('user')).length,
    recordings: events.filter(e => e.event?.includes('recording')).length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Webhooks</h1>
          <p className="text-gray-500 mt-1">Echtzeit-Events von Zoom</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleClear} className="btn-danger flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Löschen
          </button>
          <button onClick={fetchData} className="btn-secondary">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-zoom-light rounded-xl">
            <Bell className="w-6 h-6 text-zoom-blue" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
            <p className="text-sm text-gray-500">Gesamt</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <Video className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.meetings}</p>
            <p className="text-sm text-gray-500">Meetings</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-purple-100 rounded-xl">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.users}</p>
            <p className="text-sm text-gray-500">Benutzer</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-orange-100 rounded-xl">
            <HardDrive className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.recordings}</p>
            <p className="text-sm text-gray-500">Aufnahmen</p>
          </div>
        </div>
      </div>

      {/* Webhook URL Info */}
      <div className="card bg-zoom-light border-zoom-blue">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-zoom-blue flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-800">Webhook URL für Zoom App</p>
            <p className="text-sm text-gray-600 mt-1">
              Konfiguriere diese URL in deiner Zoom App unter "Feature" → "Event Subscriptions":
            </p>
            <code className="block mt-2 p-3 bg-white rounded-lg text-sm text-zoom-blue border border-zoom-blue/20">
              https://your-domain.com/api/webhooks
            </code>
            <p className="text-xs text-gray-500 mt-2">
              Secret Token: <code className="bg-white px-1 rounded">configured in server</code>
            </p>
          </div>
        </div>
      </div>

      {/* Event Types */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Unterstützte Event-Typen</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {eventTypes.map((category, idx) => (
            <div key={idx} className="p-4 bg-gray-50 rounded-xl">
              <p className="font-medium text-gray-800 mb-2">{category.category}</p>
              <div className="space-y-1">
                {category.events?.map((event, i) => (
                  <p key={i} className="text-xs text-gray-500">{event}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Events filtern..."
            className="input pl-10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Events List */}
      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zoom-blue"></div>
        </div>
      ) : filteredEvents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Webhook className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700">Keine Events empfangen</h3>
          <p className="text-gray-500 mt-1">
            Webhook-Events erscheinen hier, sobald sie von Zoom gesendet werden
          </p>
        </div>
      )}
    </div>
  );
}
