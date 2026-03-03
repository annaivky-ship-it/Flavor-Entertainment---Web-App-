import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebaseClient';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  updateDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import type { AppNotification } from '../types';

export type { AppNotification };

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!userId || !db) return;

    setIsLoading(true);

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AppNotification[];
        setNotifications(docs);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error subscribing to notifications:', err);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!db) return;
      try {
        await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    },
    []
  );

  const markAllRead = useCallback(async () => {
    if (!db) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db!, 'notifications', n.id), { read: true }));
      await batch.commit();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, [notifications]);

  return { notifications, unreadCount, markAsRead, markAllRead, isLoading };
}
