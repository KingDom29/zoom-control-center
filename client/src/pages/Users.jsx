import { useState, useEffect } from 'react';
import { 
  Users as UsersIcon, Plus, Search, Mail, Shield, 
  MoreVertical, Edit, Trash2, Settings, RefreshCw,
  UserCheck, UserX, Crown, X
} from 'lucide-react';
import { getUsers, getUser, updateUser, deleteUser } from '../api';
import logger from '../utils/logger.js';

function UserCard({ user, onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);

  const getRoleBadge = (type) => {
    switch(type) {
      case 1: return { label: 'Basic', class: 'badge-info' };
      case 2: return { label: 'Licensed', class: 'badge-success' };
      case 3: return { label: 'On-Prem', class: 'badge-warning' };
      default: return { label: 'Unknown', class: 'bg-gray-100 text-gray-600' };
    }
  };

  const role = getRoleBadge(user.type);

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-zoom-light rounded-full flex items-center justify-center">
            <span className="text-lg font-semibold text-zoom-blue">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">
              {user.first_name} {user.last_name}
            </h3>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <MoreVertical className="w-5 h-5 text-gray-400" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40 z-10">
              <button
                onClick={() => { onEdit(user); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" /> Bearbeiten
              </button>
              <button
                onClick={() => { onDelete(user.id); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Entfernen
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className={`badge ${role.class}`}>{role.label}</span>
        <span className={`badge ${user.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
          {user.status === 'active' ? 'Aktiv' : 'Inaktiv'}
        </span>
        {user.role_name && (
          <span className="badge bg-purple-100 text-purple-700">{user.role_name}</span>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400">Abteilung</p>
          <p className="text-gray-700">{user.dept || '-'}</p>
        </div>
        <div>
          <p className="text-gray-400">Timezone</p>
          <p className="text-gray-700">{user.timezone?.split('/')[1] || '-'}</p>
        </div>
      </div>
    </div>
  );
}

function UserDetailModal({ user, isOpen, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user?.id) {
      setLoading(true);
      getUser(user.id)
        .then(res => setDetails(res.data))
        .catch((err) => logger.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Benutzer Details</h2>
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
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-zoom-light rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-zoom-blue">
                  {details.first_name?.[0]}{details.last_name?.[0]}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold">{details.first_name} {details.last_name}</h3>
                <p className="text-gray-500">{details.email}</p>
                <p className="text-sm text-gray-400 mt-1">ID: {details.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Status', value: details.status },
                { label: 'Lizenztyp', value: details.type === 1 ? 'Basic' : details.type === 2 ? 'Licensed' : 'On-Prem' },
                { label: 'Rolle', value: details.role_name || '-' },
                { label: 'Abteilung', value: details.dept || '-' },
                { label: 'Timezone', value: details.timezone || '-' },
                { label: 'Sprache', value: details.language || '-' },
                { label: 'PMI', value: details.pmi || '-' },
                { label: 'Erstellt', value: details.created_at ? new Date(details.created_at).toLocaleDateString('de-DE') : '-' }
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-sm text-gray-400">{label}</p>
                  <p className="font-medium text-gray-800">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedUser, setSelectedUser] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await getUsers(statusFilter);
      setUsers(res.data?.users || []);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [statusFilter]);

  const handleDelete = async (id) => {
    if (!confirm('Benutzer wirklich entfernen?')) return;
    try {
      await deleteUser(id);
      fetchUsers();
    } catch (err) {
      alert('Fehler: ' + err.message);
    }
  };

  const filteredUsers = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.last_name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    licensed: users.filter(u => u.type === 2).length,
    basic: users.filter(u => u.type === 1).length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Team</h1>
          <p className="text-gray-500 mt-1">Verwalte dein Zoom-Team</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-zoom-light rounded-xl">
            <UsersIcon className="w-6 h-6 text-zoom-blue" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
            <p className="text-sm text-gray-500">Gesamt</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <Crown className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.licensed}</p>
            <p className="text-sm text-gray-500">Lizenziert</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <UserCheck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.basic}</p>
            <p className="text-sm text-gray-500">Basic</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Benutzer suchen..."
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="active">Aktiv</option>
          <option value="inactive">Inaktiv</option>
          <option value="pending">Ausstehend</option>
        </select>
        <button onClick={fetchUsers} className="btn-secondary">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* User Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zoom-blue"></div>
        </div>
      ) : filteredUsers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onEdit={setSelectedUser}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <UsersIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700">Keine Benutzer gefunden</h3>
          <p className="text-gray-500 mt-1">Ändere die Filtereinstellungen</p>
        </div>
      )}

      {/* User Detail Modal */}
      <UserDetailModal
        user={selectedUser}
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}
