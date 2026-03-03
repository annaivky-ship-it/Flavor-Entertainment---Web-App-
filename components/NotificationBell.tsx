import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  BellOff,
  CheckCircle,
  X,
  Clock,
  Wallet,
  MessageCircle,
  User,
} from 'lucide-react';
import { useNotifications, type AppNotification } from '../hooks/useNotifications';

function timeAgo(timestamp: AppNotification['createdAt'] | undefined): string {
  if (!timestamp) return '';
  const date =
    typeof (timestamp as { toDate?: () => Date }).toDate === 'function'
      ? (timestamp as { toDate: () => Date }).toDate()
      : new Date(timestamp as unknown as string);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const notificationIcon: Record<
  AppNotification['type'],
  { Icon: React.ElementType; color: string }
> = {
  booking_confirmed: { Icon: CheckCircle, color: 'text-green-400' },
  booking_cancelled: { Icon: X, color: 'text-red-400' },
  booking_pending: { Icon: Clock, color: 'text-orange-400' },
  payment_received: { Icon: Wallet, color: 'text-green-400' },
  new_message: { Icon: MessageCircle, color: 'text-blue-400' },
  performer_assigned: { Icon: User, color: 'text-purple-400' },
};

interface NotificationBellProps {
  userId: string | null;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications(userId);

  // Animate open/close
  useEffect(() => {
    if (isOpen) {
      // mount first, then fade in next frame
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) markAsRead(n.id);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="relative p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-[200] overflow-hidden transition-all duration-150"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.97)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-orange-400 transition-colors"
                aria-label="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-zinc-800/60">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
                <BellOff className="w-8 h-8 text-zinc-700" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const iconEntry = notificationIcon[n.type] ?? { Icon: Bell, color: 'text-zinc-400' };
                const { Icon, color } = iconEntry;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors ${
                      n.read
                        ? 'hover:bg-zinc-800/50'
                        : 'bg-orange-500/5 hover:bg-orange-500/10'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex-shrink-0 p-1.5 rounded-full bg-zinc-800 ${color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-xs font-semibold truncate ${
                            n.read ? 'text-zinc-300' : 'text-white'
                          }`}
                        >
                          {n.title}
                        </p>
                        <span className="text-[10px] text-zinc-500 flex-shrink-0">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                    </div>
                    {!n.read && (
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
