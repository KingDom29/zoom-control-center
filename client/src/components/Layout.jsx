import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Users, 
  HardDrive, 
  BarChart3, 
  Settings, 
  Webhook,
  Menu,
  X,
  Zap,
  Sun,
  Moon
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTheme } from '../hooks/useTheme';
import NotificationCenter from './NotificationCenter';
import ToastContainer from './Toast';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/meetings', icon: Video, label: 'Meetings' },
  { path: '/users', icon: Users, label: 'Team' },
  { path: '/recordings', icon: HardDrive, label: 'Aufnahmen' },
  { path: '/reports', icon: BarChart3, label: 'Berichte' },
  { path: '/settings', icon: Settings, label: 'Einstellungen' },
  { path: '/webhooks', icon: Webhook, label: 'Webhooks' },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState([]);
  const { theme, toggleTheme, isDark } = useTheme();
  const { 
    isConnected, 
    notifications, 
    unreadCount, 
    lastMessage,
    clearNotifications, 
    markAsRead, 
    markAllAsRead 
  } = useWebSocket();

  // Show toast for new events
  useEffect(() => {
    if (lastMessage?.type === 'event' && lastMessage?.data?.ui) {
      const toastData = {
        id: Date.now(),
        ...lastMessage.data.ui,
        type: lastMessage.data.type
      };
      setToasts(prev => [...prev, toastData].slice(-3));
    }
  }, [lastMessage]);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zoom-blue rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-gray-800 dark:text-white">Zoom Control</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Maklerplan</p>
              </div>
            )}
          </div>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5 text-gray-500 dark:text-gray-400" /> : <Menu className="w-5 h-5 text-gray-500 dark:text-gray-400" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => 
                `sidebar-link ${isActive ? 'active' : ''} ${!sidebarOpen ? 'justify-center px-2' : ''}`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        {sidebarOpen && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700">
            <div className="bg-gradient-to-r from-zoom-blue to-blue-600 rounded-xl p-4 text-white">
              <p className="text-sm font-medium">Team-Workspace</p>
              <p className="text-xs opacity-80 mt-1">Server-to-Server OAuth</p>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-end px-6 gap-3">
          {/* Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={isDark ? 'Light Mode' : 'Dark Mode'}
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
              <Moon className="w-5 h-5 text-gray-600" />
            )}
          </button>

          {/* Notification Center */}
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            isConnected={isConnected}
            onMarkRead={markAsRead}
            onMarkAllRead={markAllAsRead}
            onClear={clearNotifications}
          />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
