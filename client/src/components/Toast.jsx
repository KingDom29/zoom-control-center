import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

function ToastItem({ toast, onClose }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDismissed(true);
      setTimeout(() => onClose(toast.id), 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const colorClasses = {
    green: 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-800 dark:text-green-200',
    red: 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-800 dark:text-red-200',
    blue: 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-800 dark:text-blue-200',
    purple: 'bg-purple-50 dark:bg-purple-900/30 border-purple-500 text-purple-800 dark:text-purple-200',
    orange: 'bg-orange-50 dark:bg-orange-900/30 border-orange-500 text-orange-800 dark:text-orange-200',
    gray: 'bg-gray-50 dark:bg-gray-800 border-gray-500 text-gray-800 dark:text-gray-200'
  };

  const baseClass = colorClasses[toast.color] || colorClasses.gray;

  return (
    <div 
      className={`
        min-w-[320px] max-w-md p-4 rounded-lg shadow-lg border-l-4
        transform transition-all duration-300 ease-out
        ${baseClass}
        ${dismissed ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0 animate-slide-in'}
      `}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{toast.icon || '📌'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{toast.title}</p>
          <p className="text-sm opacity-90 truncate">{toast.message}</p>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            setTimeout(() => onClose(toast.id), 300);
          }}
          className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function ToastContainer({ toasts, onClose }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}
