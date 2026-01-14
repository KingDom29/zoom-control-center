import { useState, useEffect } from 'react';
import { 
  Users, Video, Clock, TrendingUp, 
  PlayCircle, Calendar, Activity, Zap 
} from 'lucide-react';
import { getDashboardOverview, getQuickStats } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

function StatCard({ icon: Icon, label, value, subvalue, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500'
  };

  return (
    <div className="card flex items-center gap-4">
      <div className={`${colors[color]} p-3 rounded-xl`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {subvalue && <p className="text-xs text-gray-400 mt-1">{subvalue}</p>}
      </div>
    </div>
  );
}

function LiveMeetingCard({ meeting }) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <div>
          <p className="font-medium text-gray-800">{meeting.topic || 'Untitled Meeting'}</p>
          <p className="text-sm text-gray-500">{meeting.host || 'Unknown Host'}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-gray-700">{meeting.participants || 0} Teilnehmer</p>
        <p className="text-xs text-gray-500">{meeting.duration || '0'} min</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [overviewRes, statsRes] = await Promise.all([
          getDashboardOverview().catch(() => ({ data: null })),
          getQuickStats().catch(() => ({ data: null }))
        ]);
        setOverview(overviewRes.data);
        setStats(statsRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const chartData = stats?.daily_data?.map(d => ({
    date: format(new Date(d.date), 'dd.MM', { locale: de }),
    meetings: d.meetings || 0,
    participants: d.participants || 0,
    minutes: d.meeting_minutes || 0
  })) || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 mt-1">Willkommen im Zoom Control Center</p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zoom-blue"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          <p className="font-medium">Fehler beim Laden der Daten</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Stats Grid */}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              icon={Users} 
              label="Team-Mitglieder" 
              value={overview?.users?.total || 0}
              subvalue={`${overview?.users?.active || 0} aktiv`}
              color="blue"
            />
            <StatCard 
              icon={PlayCircle} 
              label="Live Meetings" 
              value={overview?.meetings?.live || 0}
              subvalue="Gerade aktiv"
              color="green"
            />
            <StatCard 
              icon={Calendar} 
              label="Geplante Meetings" 
              value={overview?.meetings?.upcoming || 0}
              subvalue="In den nächsten Tagen"
              color="purple"
            />
            <StatCard 
              icon={Clock} 
              label="Meeting-Minuten" 
              value={stats?.minutes_this_month?.toLocaleString('de-DE') || 0}
              subvalue="Diesen Monat"
              color="orange"
            />
          </div>

          {/* Charts and Live Meetings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Activity Chart */}
            <div className="lg:col-span-2 card">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Meeting-Aktivität</h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorMeetings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2D8CFF" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2D8CFF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="meetings" 
                      stroke="#2D8CFF" 
                      strokeWidth={2}
                      fill="url(#colorMeetings)" 
                      name="Meetings"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">
                  <p>Keine Daten verfügbar</p>
                </div>
              )}
            </div>

            {/* Live Meetings */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Live Meetings</h2>
                <span className="badge badge-success flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Live
                </span>
              </div>
              <div className="space-y-3">
                {overview?.meetings?.live_details?.length > 0 ? (
                  overview.meetings.live_details.map((meeting, idx) => (
                    <LiveMeetingCard key={idx} meeting={meeting} />
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Keine aktiven Meetings</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Schnellaktionen</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button 
                onClick={() => window.location.href = '/meetings'}
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl hover:bg-zoom-light transition-colors"
              >
                <Video className="w-8 h-8 text-zoom-blue" />
                <span className="text-sm font-medium text-gray-700">Meeting erstellen</span>
              </button>
              <button 
                onClick={() => window.location.href = '/users'}
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl hover:bg-zoom-light transition-colors"
              >
                <Users className="w-8 h-8 text-zoom-blue" />
                <span className="text-sm font-medium text-gray-700">Team verwalten</span>
              </button>
              <button 
                onClick={() => window.location.href = '/recordings'}
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl hover:bg-zoom-light transition-colors"
              >
                <PlayCircle className="w-8 h-8 text-zoom-blue" />
                <span className="text-sm font-medium text-gray-700">Aufnahmen ansehen</span>
              </button>
              <button 
                onClick={() => window.location.href = '/reports'}
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl hover:bg-zoom-light transition-colors"
              >
                <TrendingUp className="w-8 h-8 text-zoom-blue" />
                <span className="text-sm font-medium text-gray-700">Berichte anzeigen</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
