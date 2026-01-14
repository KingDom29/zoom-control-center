import { useState, useEffect } from 'react';
import { 
  Video, Plus, Calendar, Clock, Users, 
  ExternalLink, Trash2, Search,
  Copy, Check, X, RefreshCw
} from 'lucide-react';
import { getMeetings, getUpcomingMeetings, createMeeting, deleteMeeting } from '../api';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import logger from '../utils/logger.js';

function CreateMeetingModal({ isOpen, onClose, onCreated }) {
  const [formData, setFormData] = useState({
    topic: '',
    type: 2,
    start_time: '',
    duration: 60,
    timezone: 'Europe/Berlin',
    agenda: '',
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: true,
      auto_recording: 'none'
    }
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = { ...formData };
      if (formData.type === 1) {
        delete data.start_time;
        delete data.duration;
      }
      await createMeeting(data);
      onCreated();
      onClose();
    } catch (err) {
      alert('Fehler beim Erstellen: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">Neues Meeting</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Thema</label>
            <input
              type="text"
              className="input"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              placeholder="Meeting-Thema eingeben"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
            <select
              className="input"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: parseInt(e.target.value) })}
            >
              <option value={1}>Sofort-Meeting</option>
              <option value={2}>Geplantes Meeting</option>
              <option value={3}>Wiederkehrendes Meeting (ohne feste Zeit)</option>
              <option value={8}>Wiederkehrendes Meeting (feste Zeit)</option>
            </select>
          </div>

          {formData.type !== 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Startzeit</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dauer (Min)</label>
                  <input
                    type="number"
                    className="input"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                    min={15}
                    max={1440}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agenda</label>
            <textarea
              className="input"
              rows={3}
              value={formData.agenda}
              onChange={(e) => setFormData({ ...formData, agenda: e.target.value })}
              placeholder="Optionale Beschreibung..."
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Einstellungen</h3>
            <div className="space-y-2">
              {[
                { key: 'waiting_room', label: 'Warteraum aktivieren' },
                { key: 'host_video', label: 'Host-Video an' },
                { key: 'participant_video', label: 'Teilnehmer-Video an' },
                { key: 'mute_upon_entry', label: 'Stummschalten beim Beitritt' },
                { key: 'join_before_host', label: 'Beitritt vor Host erlauben' }
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.settings[key]}
                    onChange={(e) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, [key]: e.target.checked }
                    })}
                    className="rounded border-gray-300 text-zoom-blue focus:ring-zoom-blue"
                  />
                  <span className="text-sm text-gray-600">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Abbrechen
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Erstelle...' : 'Meeting erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MeetingCard({ meeting, onDelete, onCopy }) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(meeting.join_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800">{meeting.topic || 'Untitled'}</h3>
          <p className="text-sm text-gray-500 mt-1">{meeting.host_name || meeting.host_email}</p>
        </div>
        <span className={`badge ${meeting.type === 1 ? 'badge-success' : 'badge-info'}`}>
          {meeting.type === 1 ? 'Sofort' : meeting.type === 2 ? 'Geplant' : 'Wiederkehrend'}
        </span>
      </div>

      {meeting.start_time && (
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {format(new Date(meeting.start_time), 'dd.MM.yyyy', { locale: de })}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {format(new Date(meeting.start_time), 'HH:mm', { locale: de })} Uhr
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {meeting.duration} min
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={copyLink}
          className="btn-secondary text-sm flex items-center gap-1"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Kopiert!' : 'Link kopieren'}
        </button>
        <a
          href={meeting.join_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-sm flex items-center gap-1"
        >
          <ExternalLink className="w-4 h-4" />
          Beitreten
        </a>
        <button
          onClick={() => onDelete(meeting.id)}
          className="ml-auto p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('upcoming');
  const [search, setSearch] = useState('');

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = filter === 'upcoming' 
        ? await getUpcomingMeetings()
        : await getMeetings(filter);
      setMeetings(res.data?.meetings || []);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [filter]);

  const handleDelete = async (id) => {
    if (!confirm('Meeting wirklich löschen?')) return;
    try {
      await deleteMeeting(id);
      fetchMeetings();
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message);
    }
  };

  const filteredMeetings = meetings.filter(m => 
    m.topic?.toLowerCase().includes(search.toLowerCase()) ||
    m.host_email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Meetings</h1>
          <p className="text-gray-500 mt-1">Verwalte alle Team-Meetings</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Neues Meeting
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Meetings durchsuchen..."
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="upcoming">Anstehend</option>
          <option value="scheduled">Geplant</option>
          <option value="live">Live</option>
        </select>
        <button onClick={fetchMeetings} className="btn-secondary">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Meeting Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zoom-blue"></div>
        </div>
      ) : filteredMeetings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMeetings.map((meeting) => (
            <MeetingCard 
              key={meeting.id || meeting.uuid} 
              meeting={meeting} 
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Video className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700">Keine Meetings gefunden</h3>
          <p className="text-gray-500 mt-1">Erstelle ein neues Meeting, um loszulegen</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
            Meeting erstellen
          </button>
        </div>
      )}

      {/* Create Modal */}
      <CreateMeetingModal 
        isOpen={showCreate} 
        onClose={() => setShowCreate(false)}
        onCreated={fetchMeetings}
      />
    </div>
  );
}
