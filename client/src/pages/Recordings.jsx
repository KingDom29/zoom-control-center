import { useState, useEffect } from 'react';
import { 
  HardDrive, Play, Download, Trash2, Search, 
  Calendar, Clock, RefreshCw, Eye, FileVideo,
  Cloud, X
} from 'lucide-react';
import { getRecordings, getRecording, deleteRecording } from '../api';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import logger from '../utils/logger.js';

function RecordingCard({ recording, onDelete, onView }) {
  const totalSize = recording.recording_files?.reduce((sum, f) => sum + (f.file_size || 0), 0) || 0;
  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800">{recording.topic || 'Untitled Recording'}</h3>
          <p className="text-sm text-gray-500 mt-1">{recording.host_name || recording.host_email}</p>
        </div>
        <span className="badge badge-info">
          <Cloud className="w-3 h-3 mr-1" />
          Cloud
        </span>
      </div>

      <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {format(new Date(recording.start_time), 'dd.MM.yyyy', { locale: de })}
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {recording.duration || 0} min
        </div>
        <div className="flex items-center gap-1">
          <HardDrive className="w-4 h-4" />
          {formatSize(totalSize)}
        </div>
      </div>

      {/* Recording Files Preview */}
      <div className="mt-4 space-y-2">
        {recording.recording_files?.slice(0, 2).map((file, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <FileVideo className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{file.recording_type || file.file_type}</span>
            </div>
            <span className="text-gray-400">{formatSize(file.file_size || 0)}</span>
          </div>
        ))}
        {recording.recording_files?.length > 2 && (
          <p className="text-xs text-gray-400 text-center">
            +{recording.recording_files.length - 2} weitere Dateien
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={() => onView(recording)}
          className="btn-primary text-sm flex items-center gap-1 flex-1"
        >
          <Eye className="w-4 h-4" />
          Details
        </button>
        <button
          onClick={() => onDelete(recording.uuid)}
          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function RecordingDetailModal({ recording, isOpen, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && recording?.uuid) {
      setLoading(true);
      getRecording(recording.uuid)
        .then(res => setDetails(res.data))
        .catch((err) => logger.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, recording?.uuid]);

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Aufnahme Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zoom-blue"></div>
          </div>
        ) : details ? (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{details.topic}</h3>
              <p className="text-gray-500 mt-1">Meeting ID: {details.id}</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">Dauer</p>
                <p className="text-lg font-semibold text-gray-800">{details.duration || 0} min</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">Dateien</p>
                <p className="text-lg font-semibold text-gray-800">{details.recording_files?.length || 0}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">Gesamtgröße</p>
                <p className="text-lg font-semibold text-gray-800">
                  {formatSize(details.total_size)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-3">Dateien</h4>
              <div className="space-y-2">
                {details.recording_files?.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <FileVideo className="w-5 h-5 text-zoom-blue" />
                      <div>
                        <p className="font-medium text-gray-800">{file.recording_type}</p>
                        <p className="text-sm text-gray-500">{file.file_extension?.toUpperCase()} • {formatSize(file.file_size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.play_url && (
                        <a
                          href={file.play_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-sm flex items-center gap-1"
                        >
                          <Play className="w-4 h-4" />
                          Abspielen
                        </a>
                      )}
                      {file.download_url && (
                        <a
                          href={file.download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary text-sm flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Recordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      const res = await getRecordings(dateRange.from, dateRange.to);
      setRecordings(res.data?.meetings || []);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, [dateRange]);

  const handleDelete = async (uuid) => {
    if (!confirm('Aufnahme wirklich löschen? Sie wird in den Papierkorb verschoben.')) return;
    try {
      await deleteRecording(uuid);
      fetchRecordings();
    } catch (err) {
      alert('Fehler: ' + err.message);
    }
  };

  const filteredRecordings = recordings.filter(r =>
    r.topic?.toLowerCase().includes(search.toLowerCase()) ||
    r.host_email?.toLowerCase().includes(search.toLowerCase())
  );

  const totalSize = recordings.reduce((sum, r) => 
    sum + (r.recording_files?.reduce((s, f) => s + (f.file_size || 0), 0) || 0), 0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Aufnahmen</h1>
          <p className="text-gray-500 mt-1">Cloud-Aufnahmen verwalten</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-zoom-light rounded-xl">
            <HardDrive className="w-6 h-6 text-zoom-blue" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{recordings.length}</p>
            <p className="text-sm text-gray-500">Aufnahmen</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-purple-100 rounded-xl">
            <Cloud className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">
              {(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB
            </p>
            <p className="text-sm text-gray-500">Speicherplatz</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <FileVideo className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">
              {recordings.reduce((sum, r) => sum + (r.recording_files?.length || 0), 0)}
            </p>
            <p className="text-sm text-gray-500">Dateien</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Aufnahmen durchsuchen..."
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Von:</label>
          <input
            type="date"
            className="input w-auto"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Bis:</label>
          <input
            type="date"
            className="input w-auto"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
          />
        </div>
        <button onClick={fetchRecordings} className="btn-secondary">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Recordings Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zoom-blue"></div>
        </div>
      ) : filteredRecordings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecordings.map((recording) => (
            <RecordingCard
              key={recording.uuid}
              recording={recording}
              onDelete={handleDelete}
              onView={setSelectedRecording}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <HardDrive className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700">Keine Aufnahmen gefunden</h3>
          <p className="text-gray-500 mt-1">Ändere den Zeitraum oder die Suchbegriffe</p>
        </div>
      )}

      {/* Recording Detail Modal */}
      <RecordingDetailModal
        recording={selectedRecording}
        isOpen={!!selectedRecording}
        onClose={() => setSelectedRecording(null)}
      />
    </div>
  );
}
