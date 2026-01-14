import { useState, useEffect } from 'react';
import { 
  BarChart3, Calendar, Users, Clock, TrendingUp,
  Download, RefreshCw, Video, FileText
} from 'lucide-react';
import { getDailyReport, getQuickStats } from '../api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import logger from '../utils/logger.js';

const COLORS = ['#2D8CFF', '#10B981', '#8B5CF6', '#F59E0B'];

export default function Reports() {
  const [stats, setStats] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, dailyRes] = await Promise.all([
        getQuickStats().catch(() => ({ data: null })),
        getDailyReport(selectedYear, selectedMonth).catch(() => ({ data: { dates: [] } }))
      ]);
      
      setStats(statsRes.data);
      setDailyData(dailyRes.data?.dates?.map(d => ({
        date: format(new Date(d.date), 'dd', { locale: de }),
        fullDate: d.date,
        meetings: d.meetings || 0,
        participants: d.participants || 0,
        minutes: d.meeting_minutes || 0
      })) || []);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  const totals = {
    meetings: dailyData.reduce((sum, d) => sum + d.meetings, 0),
    participants: dailyData.reduce((sum, d) => sum + d.participants, 0),
    minutes: dailyData.reduce((sum, d) => sum + d.minutes, 0)
  };

  const avgDuration = totals.meetings > 0 ? Math.round(totals.minutes / totals.meetings) : 0;
  const avgParticipants = totals.meetings > 0 ? Math.round(totals.participants / totals.meetings) : 0;

  const pieData = [
    { name: 'Meetings', value: totals.meetings },
    { name: 'Ø Teilnehmer', value: avgParticipants },
    { name: 'Ø Dauer (min)', value: avgDuration }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Berichte</h1>
          <p className="text-gray-500 mt-1">Nutzungsstatistiken und Analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="input w-auto"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {format(new Date(2024, i, 1), 'MMMM', { locale: de })}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="input w-auto"
          >
            {[2024, 2025, 2026].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button onClick={fetchData} className="btn-secondary">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zoom-blue"></div>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-zoom-light rounded-xl">
                  <Video className="w-6 h-6 text-zoom-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{totals.meetings.toLocaleString('de-DE')}</p>
                  <p className="text-sm text-gray-500">Meetings gesamt</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{totals.participants.toLocaleString('de-DE')}</p>
                  <p className="text-sm text-gray-500">Teilnehmer gesamt</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{totals.minutes.toLocaleString('de-DE')}</p>
                  <p className="text-sm text-gray-500">Minuten gesamt</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{avgDuration} min</p>
                  <p className="text-sm text-gray-500">Ø Meeting-Dauer</p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Meetings per Day */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Meetings pro Tag</h3>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData}>
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
                    <Bar dataKey="meetings" fill="#2D8CFF" radius={[4, 4, 0, 0]} name="Meetings" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">
                  Keine Daten für diesen Zeitraum
                </div>
              )}
            </div>

            {/* Participants Trend */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Teilnehmer-Trend</h3>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="colorParticipants" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
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
                      dataKey="participants" 
                      stroke="#10B981" 
                      strokeWidth={2}
                      fill="url(#colorParticipants)" 
                      name="Teilnehmer"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">
                  Keine Daten für diesen Zeitraum
                </div>
              )}
            </div>

            {/* Minutes Usage */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Meeting-Minuten</h3>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyData}>
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
                    <Line 
                      type="monotone" 
                      dataKey="minutes" 
                      stroke="#8B5CF6" 
                      strokeWidth={2}
                      dot={{ fill: '#8B5CF6', r: 4 }}
                      name="Minuten"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">
                  Keine Daten für diesen Zeitraum
                </div>
              )}
            </div>

            {/* Summary Pie */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Zusammenfassung</h3>
              <div className="flex items-center justify-center">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    Keine Daten verfügbar
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Daily Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Tägliche Übersicht</h3>
              <button className="btn-secondary text-sm flex items-center gap-1">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Datum</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Meetings</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Teilnehmer</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Minuten</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Ø Dauer</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.slice().reverse().map((day, idx) => (
                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-800">
                        {format(new Date(day.fullDate), 'dd.MM.yyyy', { locale: de })}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-800 text-right">{day.meetings}</td>
                      <td className="py-3 px-4 text-sm text-gray-800 text-right">{day.participants}</td>
                      <td className="py-3 px-4 text-sm text-gray-800 text-right">{day.minutes}</td>
                      <td className="py-3 px-4 text-sm text-gray-800 text-right">
                        {day.meetings > 0 ? Math.round(day.minutes / day.meetings) : 0} min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
