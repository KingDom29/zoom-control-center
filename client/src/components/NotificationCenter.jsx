import { useState } from 'react';
import { 
  Bell, X, Check, CheckCheck, Trash2, 
  Video, Users, HardDrive, Wifi, WifiOff 
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

function NotificationItem({ notification, onMarkRead }) {
  const ui = notification.ui || {
    icon: '📌',
    title: notification.type,
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
      className={`p-3 rounded-lg transition-colors cursor-pointer ${
        notification.read 
          ? 'bg-gray-50 dark:bg-gray-800/50' 
          : 'bg-white dark:bg-gray-800 shadow-sm'
      }`}
      onClick={() => onMarkRead(notification.id)}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <span className="text-lg">{ui.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">
              {ui.title}
            </p>
            {!notification.read && (
              <span className="w-2 h-2 bg-zoom-blue rounded-full" />
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1">
            {ui.message}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {format(new Date(notification.timestamp || Date.now()), 'HH:mm:ss', { locale: de })}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NotificationCenter({ 
  notifications, 
  unreadCount, 
  isConnected,
  onMarkRead,
  onMarkAllRead,
  onClear 
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Connection Status Indicator */}
      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${
        isConnected ? 'bg-green-500' : 'bg-red-500'
      }`} />

      {/* Dropdown */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 dark:text-white">Benachrichtigungen</h3>
                  {isConnected ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Wifi className="w-3 h-3" /> Live
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <WifiOff className="w-3 h-3" /> Offline
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              {notifications.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={onMarkAllRead}
                    className="text-xs text-zoom-blue hover:underline flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3" /> Alle gelesen
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <button
                    onClick={onClear}
                    className="text-xs text-red-500 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Löschen
                  </button>
                </div>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length > 0 ? (
                <div className="p-2 space-y-2">
                  {notifications.map(notification => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={onMarkRead}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Keine Benachrichtigungen</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                    Events erscheinen hier live
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
