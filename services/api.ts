import { db, storage, functions, auth } from './firebaseClient';
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  orderBy,
  addDoc,
  getDoc,
  serverTimestamp,
  limit,
  setDoc,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type {
  Performer, Booking, BookingStatus, DoNotServeEntry, DoNotServeStatus,
  Communication, PerformerStatus, AuditLog, VettingApplication
} from '../types';
import { BookingFormState } from '../components/BookingProcess';

/** Whether the app is running in demo mode (mock data, no real Firebase writes) */
export const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo';

// Dev/demo-only seed loader. The dynamic `import()` is gated on the build-time
// constants `import.meta.env.DEV`/`isDemoMode`, so Vite tree-shakes the module
// out of production bundles entirely.
const loadDevSeed = async () => {
  if (!import.meta.env.DEV && !isDemoMode) {
    throw new Error('Demo seed data requested in a production build — refusing.');
  }
  return import('../src/dev/seed/mockData');
};

export const resetDemoData = async () => {
  if (!import.meta.env.DEV && !isDemoMode) {
    console.error('resetDemoData() called in a production build — ignoring.');
    return;
  }
  if (!db) {
    console.error('Database not initialized. Check environment variables.');
    return;
  }
  try {
    const batch = writeBatch(db);
    const { mockPerformers } = await loadDevSeed();
    const { allServices } = await import('../data/mockData');

    for (const p of mockPerformers) {
      const pRef = doc(db, 'performers', String(p.id));
      batch.set(pRef, { ...p, created_at: new Date().toISOString() });
    }
    for (const s of allServices) {
      const sRef = doc(db, 'services', s.id);
      batch.set(sRef, s);
    }

    await batch.commit();
    window.location.reload();
  } catch (error: unknown) {
    console.error('Error seeding database:', error);
  }
};

// --- Internal helpers ---

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions not initialized.');
  return functions;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

async function callFn<TIn, TOut>(name: string, payload: TIn): Promise<TOut> {
  const callable = httpsCallable(requireFunctions(), name);
  const result = await callable(payload as any);
  return result.data as TOut;
}

const isPermissionError = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string };
  return e.code === 'permission-denied' ||
    e.code === 'PERMISSION_DENIED' ||
    !!e.message?.includes('Missing or insufficient permissions') ||
    !!e.message?.includes('permission-denied');
};

export const api = {
  async getInitialData(role?: string, uid?: string, performerId?: number) {
    if (isDemoMode) {
      const seed = await loadDevSeed();
      return {
        performers: { data: seed.mockPerformers, error: null },
        bookings: { data: seed.mockBookings, error: null },
        doNotServeList: { data: seed.mockDoNotServeList, error: null },
        communications: { data: seed.mockCommunications, error: null },
        auditLogs: { data: [], error: null },
      };
    }

    if (!db) {
      throw new Error('Firestore is not initialized. Check VITE_FIREBASE_* configuration.');
    }

    const fetchCollection = async (name: string, q: any) => {
      try {
        const snap = await getDocs(q);
        return {
          data: snap.docs.map(d => ({
            ...(d.data() as any),
            id: name === 'performers' ? Number(d.id) : d.id,
          })),
          error: null,
        };
      } catch (err: unknown) {
        if (isPermissionError(err)) {
          console.warn(`No permission for ${name} — returning empty.`);
          return { data: [], error: null };
        }
        console.error(`Error fetching ${name}:`, err);
        return { data: [], error: toError(err) };
      }
    };

    let bookingsQuery;
    if (role === 'admin') {
      bookingsQuery = query(collection(db, 'bookings'), orderBy('created_at', 'desc'), limit(500));
    } else if (role === 'performer' && performerId) {
      bookingsQuery = query(
        collection(db, 'bookings'),
        where('performer_id', '==', performerId),
        orderBy('created_at', 'desc')
      );
    } else if (uid) {
      bookingsQuery = query(
        collection(db, 'bookings'),
        where('client_uid', '==', uid),
        orderBy('created_at', 'desc')
      );
    } else {
      bookingsQuery = null;
    }

    let commsQuery;
    if (role === 'admin') {
      commsQuery = query(collection(db, 'communications'), orderBy('createdAt', 'desc'), limit(200));
    } else if (uid) {
      commsQuery = query(
        collection(db, 'communications'),
        where('participant_uids', 'array-contains', uid),
        orderBy('createdAt', 'desc'),
        limit(200)
      );
    } else {
      commsQuery = null;
    }

    const [pRes, bRes, dRes, cRes, aRes] = await Promise.all([
      fetchCollection('performers', query(collection(db, 'performers'))),
      bookingsQuery
        ? fetchCollection('bookings', bookingsQuery)
        : Promise.resolve({ data: [] as any[], error: null as Error | null }),
      role === 'admin'
        ? fetchCollection('do_not_serve', query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc')))
        : Promise.resolve({ data: [] as any[], error: null as Error | null }),
      commsQuery
        ? fetchCollection('communications', commsQuery)
        : Promise.resolve({ data: [] as any[], error: null as Error | null }),
      role === 'admin'
        ? fetchCollection('audit_logs', query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50)))
        : Promise.resolve({ data: [] as any[], error: null as Error | null }),
    ]);

    return {
      performers: pRes,
      bookings: bRes,
      doNotServeList: dRes,
      communications: cRes,
      auditLogs: aRes,
    };
  },

  subscribeToBookings(callback: (bookings: Booking[]) => void, role?: string, uid?: string, performerId?: number) {
    if (!db) return () => { };
    let q;
    if (role === 'admin') {
      q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'), limit(500));
    } else if (role === 'performer' && performerId) {
      q = query(collection(db, 'bookings'), where('performer_id', '==', performerId), orderBy('created_at', 'desc'));
    } else if (uid) {
      q = query(collection(db, 'bookings'), where('client_uid', '==', uid), orderBy('created_at', 'desc'));
    } else {
      callback([]);
      return () => { };
    }
    return onSnapshot(q, (snap) => {
      const bookings = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Booking[];
      callback(bookings);
    }, (err) => {
      console.warn('Bookings subscription error (likely auth issue):', err.message);
      callback([]);
    });
  },

  subscribeToCommunications(callback: (comms: Communication[]) => void, role?: string, uid?: string) {
    if (!db) return () => { };
    let q;
    if (role === 'admin') {
      q = query(collection(db, 'communications'), orderBy('createdAt', 'desc'), limit(200));
    } else if (uid) {
      q = query(
        collection(db, 'communications'),
        where('participant_uids', 'array-contains', uid),
        orderBy('createdAt', 'desc'),
        limit(200)
      );
    } else {
      callback([]);
      return () => { };
    }
    return onSnapshot(q, (snap) => {
      const comms = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Communication[];
      callback(comms);
    }, (err) => {
      console.warn('Communications subscription error:', err.message);
      callback([]);
    });
  },

  subscribeToPerformers(callback: (performers: Performer[]) => void) {
    if (!db) return () => { };
    const q = query(collection(db, 'performers'));
    return onSnapshot(q, (snap) => {
      const performers = snap.docs.map(d => ({ ...d.data(), id: Number(d.id) })) as Performer[];
      callback(performers);
    }, (err) => {
      console.error('Error subscribing to performers:', err);
    });
  },

  subscribeToDoNotServe(callback: (entries: DoNotServeEntry[]) => void, role?: string) {
    if (!db) return () => { };
    if (role !== 'admin') {
      callback([]);
      return () => { };
    }
    const q = query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const entries = snap.docs.map(d => ({ ...d.data(), id: d.id })) as DoNotServeEntry[];
      callback(entries);
    }, (err) => {
      console.warn('DNS subscription error:', err.message);
      callback([]);
    });
  },

  subscribeToAuditLogs(callback: (logs: AuditLog[]) => void, role?: string) {
    if (!db) return () => { };
    if (role !== 'admin') {
      callback([]);
      return () => { };
    }
    const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ ...d.data(), id: d.id })) as AuditLog[];
      callback(logs);
    }, (err) => {
      console.warn('Audit log subscription error:', err.message);
      callback([]);
    });
  },

  // --- Vetting flow (still uses Firebase Storage directly for upload) ---
  async createVettingDraft(data: Partial<VettingApplication>) {
    if (!db || !auth) throw new Error('Firebase not initialized');
    const user = auth.currentUser;
    if (!user) throw new Error('Authentication required');

    const appRef = doc(collection(db, 'vetting_applications'));
    const application: Partial<VettingApplication> = {
      ...data,
      id: appRef.id,
      applicationId: appRef.id,
      userId: user.uid,
      status: 'draft',
      riskFlags: [],
      lastUpdatedAt: new Date().toISOString(),
    };

    await setDoc(appRef, application);
    return appRef.id;
  },

  async uploadVettingFiles(applicationId: string, idFile: File, selfieFile: File) {
    if (!db || !auth || !storage) throw new Error('Firebase not initialized');
    const user = auth.currentUser;
    if (!user) throw new Error('Authentication required');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024;
    for (const file of [idFile, selfieFile]) {
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, PDF.`);
      }
      if (file.size > maxSize) {
        throw new Error(`File "${file.name}" exceeds 10MB limit.`);
      }
    }

    const idPath = `vetting/${user.uid}/${applicationId}/id_${idFile.name}`;
    const selfiePath = `vetting/${user.uid}/${applicationId}/selfie_${selfieFile.name}`;

    const idRef = ref(storage, idPath);
    const selfieRef = ref(storage, selfiePath);

    await Promise.all([
      uploadBytes(idRef, idFile),
      uploadBytes(selfieRef, selfieFile),
    ]);

    // Vetting application doc update is owner-only per firestore.rules; the
    // ID + selfie path live on the draft and are written here.
    await setDoc(doc(db, 'vetting_applications', applicationId), {
      idFilePath: idPath,
      selfieFilePath: selfiePath,
      lastUpdatedAt: new Date().toISOString(),
    }, { merge: true });

    return { idPath, selfiePath };
  },

  async submitVettingApplication(applicationId: string) {
    return callFn<{ applicationId: string }, { success: boolean }>('submitApplication', { applicationId });
  },

  // --- Booking creation (server callable) ---
  async createBookingRequest(formState: BookingFormState, performers: Performer[]) {
    if (!db || !auth || !storage || !functions) {
      if (isDemoMode || import.meta.env.DEV) {
        console.warn('Firebase not initialized. Returning empty booking response (dev/demo).');
        return { data: [], error: null };
      }
      return { data: null, error: new Error('Firebase services are not initialized.') };
    }
    try {
      if (!performers || performers.length === 0) throw new Error('No performers selected.');

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      const maxFileSize = 10 * 1024 * 1024;

      let idUrl: string | null = null;
      let selfieUrl: string | null = null;
      const timestamp = Date.now();
      const submissionId = `booking_${timestamp}`;

      if (formState.idDocument || formState.selfieDocument) {
        const currentUid = auth.currentUser?.uid;
        if (!currentUid || auth.currentUser?.isAnonymous === false) {
          // anonymous OK; we just need *some* UID for the path
        }
        const userUid = currentUid ?? `guest_${timestamp}`;
        const uploadPromises: Promise<void>[] = [];

        if (formState.idDocument) {
          if (!allowedTypes.includes(formState.idDocument.type)) {
            throw new Error(`Invalid ID file type: ${formState.idDocument.type}`);
          }
          if (formState.idDocument.size > maxFileSize) throw new Error('ID document exceeds 10MB limit.');
          const idPath = `vetting/${userUid}/${submissionId}/id_${formState.idDocument.name}`;
          const idRef = ref(storage, idPath);
          uploadPromises.push(
            uploadBytes(idRef, formState.idDocument).then(async res => {
              idUrl = await getDownloadURL(res.ref);
            })
          );
        }

        if (formState.selfieDocument) {
          if (!allowedTypes.includes(formState.selfieDocument.type)) {
            throw new Error(`Invalid selfie file type: ${formState.selfieDocument.type}`);
          }
          if (formState.selfieDocument.size > maxFileSize) throw new Error('Selfie document exceeds 10MB limit.');
          const selfiePath = `vetting/${userUid}/${submissionId}/selfie_${formState.selfieDocument.name}`;
          const selfieRef = ref(storage, selfiePath);
          uploadPromises.push(
            uploadBytes(selfieRef, formState.selfieDocument).then(async res => {
              selfieUrl = await getDownloadURL(res.ref);
            })
          );
        }

        await Promise.all(uploadPromises);
      }

      const response = await callFn<
        { formState: any; performerIds: (string | number)[] },
        { success: boolean; bookingIds: string[]; trustTier?: string }
      >('createBookingRequest', {
        formState: {
          ...formState,
          id_document_path: idUrl,
          selfie_document_path: selfieUrl,
          idDocument: null,
          selfieDocument: null,
        },
        performerIds: performers.filter(p => p && p.id != null).map(p => p.id),
      });

      if (!response?.success || !response?.bookingIds?.length) {
        throw new Error('Booking creation failed — no bookings were returned from the server.');
      }

      const newBookings = await Promise.all(response.bookingIds.map(async (id) => {
        const bDoc = await getDoc(doc(db!, 'bookings', id));
        return { ...bDoc.data(), id: bDoc.id } as Booking;
      }));

      return { data: newBookings, error: null };
    } catch (err: unknown) {
      return { data: null, error: toError(err) };
    }
  },

  // --- Booking lifecycle: thin callable wrappers ---
  async clientCancelBooking(bookingId: string, reason: string) {
    try {
      await callFn<{ bookingId: string; reason: string }, { success: boolean }>(
        'clientCancelBooking',
        { bookingId, reason }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async performerDecideBooking(bookingId: string, decision: 'accepted' | 'declined', etaMinutes?: number) {
    try {
      const data = await callFn<
        { bookingId: string; decision: string; etaMinutes?: number },
        { success: boolean; status: string }
      >('performerDecideBooking', { bookingId, decision, etaMinutes });
      return { data, error: null };
    } catch (err: unknown) {
      return { data: null, error: toError(err) };
    }
  },

  async performerUpdateEta(bookingId: string, etaMinutes: number) {
    try {
      await callFn<{ bookingId: string; etaMinutes: number }, { success: boolean }>(
        'performerUpdateEta',
        { bookingId, etaMinutes }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async performerUpdateLiveStatus(bookingId: string, status: 'en_route' | 'arrived' | 'in_progress' | 'completed') {
    try {
      await callFn<{ bookingId: string; status: string }, { success: boolean }>(
        'performerUpdateLiveStatus',
        { bookingId, status }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async adminUpdateBookingStatus(bookingId: string, status: BookingStatus, updates: any = {}) {
    try {
      await callFn<{ bookingId: string; status: string; updates: any }, { success: boolean }>(
        'adminUpdateBookingStatus',
        { bookingId, status, updates }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async adminCancelBooking(bookingId: string, reason: string) {
    try {
      await callFn<{ bookingId: string; reason: string }, { success: boolean }>(
        'adminCancelBooking',
        { bookingId, reason }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async adminReassignPerformer(bookingId: string, newPerformerId: number | string) {
    try {
      await callFn<{ bookingId: string; newPerformerId: string }, { success: boolean }>(
        'adminReassignPerformer',
        { bookingId, newPerformerId: String(newPerformerId) }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  // Unified entry point — picks the right callable based on the actor role.
  async updateBookingStatus(
    bookingId: string,
    status: BookingStatus,
    updates: any = {},
    actorRole: 'admin' | 'performer' | 'client' = 'admin'
  ) {
    if (actorRole === 'admin') {
      return api.adminUpdateBookingStatus(bookingId, status, updates);
    }
    if (actorRole === 'performer') {
      // Performer-allowed transitions are routed through performerUpdateLiveStatus
      // or performerDecideBooking. ETA updates go through performerUpdateEta.
      if (status === 'en_route' || status === 'arrived' || status === 'in_progress' || status === 'completed') {
        return api.performerUpdateLiveStatus(bookingId, status);
      }
      return { error: new Error('Use adminUpdateBookingStatus or performerDecideBooking for this status.') };
    }
    if (actorRole === 'client' && status === 'cancelled') {
      return api.clientCancelBooking(bookingId, updates?.cancellation_reason || '');
    }
    return { error: new Error('Unsupported status transition for actor role.') };
  },

  async cancelBooking(bookingId: string, reason: string, cancelledBy: 'client' | 'admin' | 'performer') {
    if (cancelledBy === 'admin') return api.adminCancelBooking(bookingId, reason);
    if (cancelledBy === 'client') return api.clientCancelBooking(bookingId, reason);
    // performer cancellation: rejected-via-decision
    return api.performerDecideBooking(bookingId, 'declined') as any;
  },

  // --- Communications ---
  async getBookingMessages(bookingId: string) {
    if (!db) return { data: [], error: null };
    try {
      const q = query(
        collection(db, 'communications'),
        where('booking_id', '==', bookingId),
        orderBy('createdAt', 'asc')
      );
      const snap = await getDocs(q);
      return { data: snap.docs.map(d => ({ ...d.data(), id: d.id })) as Communication[], error: null };
    } catch (err: unknown) {
      return { data: [], error: toError(err) };
    }
  },

  // System / local-only communication for in-app UX. Server-broadcast messages
  // for cross-role threads should go through sendBookingMessage callable.
  async addCommunication(commData: Omit<Communication, 'id' | 'created_at' | 'read'>) {
    // The communications collection is now create-via-callable only. For
    // booking-scoped messages with a booking_id, route through the server.
    if (commData.booking_id) {
      try {
        const result = await callFn<
          { bookingId: string; message: string; type?: string },
          { success: boolean; message: Communication }
        >('sendBookingMessage', {
          bookingId: commData.booking_id,
          message: commData.message,
          type: commData.type,
        });
        return { data: [result.message], error: null };
      } catch (err: unknown) {
        // For UX-only system messages (no real persistence required) we
        // fall back to a synthetic in-memory message so the toast still
        // appears for the user.
        return {
          data: [{
            ...commData,
            id: `local-${Date.now()}`,
            created_at: new Date().toISOString(),
            read: false,
          }] as Communication[],
          error: toError(err),
        };
      }
    }
    // Non-booking system message — purely client-side for UX feedback.
    return {
      data: [{
        ...commData,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
        read: false,
      }] as Communication[],
      error: null,
    };
  },

  async sendBookingMessage(bookingId: string, message: string, _sender: string, _recipient: string) {
    try {
      const result = await callFn<
        { bookingId: string; message: string; type?: string },
        { success: boolean; message: Communication }
      >('sendBookingMessage', { bookingId, message, type: 'direct_message' });
      return { data: result.message, error: null };
    } catch (err: unknown) {
      return { data: null, error: toError(err) };
    }
  },

  // --- Audit log (system-side append; admin reads via subscription) ---
  // Client-side audit-log writes are blocked by firestore.rules. Server-side
  // callables write their own audit entries. This is a no-op shim retained
  // so existing call sites compile while we migrate them.
  async createAuditLog(_action: string, _actorUid: string, _details: any = {}, _actorRole: 'client' | 'admin' | 'system' = 'system') {
    return { id: null, error: null };
  },

  // --- Performer admin actions (admin role only) ---
  async updatePerformerStatus(performerId: number, status: PerformerStatus) {
    try {
      await callFn<{ performerId: string; status: string }, { success: boolean }>(
        'adminSetPerformerStatus',
        { performerId: String(performerId), status }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async updatePerformerAcceptsAsap(performerId: number, acceptsAsap: boolean) {
    try {
      await callFn<{ performerId: string; acceptsAsap: boolean }, { success: boolean }>(
        'adminSetPerformerAcceptsAsap',
        { performerId: String(performerId), acceptsAsap }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async uploadPerformerPhoto(performerId: number, file: File, type: 'main' | 'gallery' = 'main'): Promise<{ url: string | null; error: Error | null }> {
    if (!storage) return { url: null, error: new Error('Storage not initialized') };
    try {
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedImageTypes.includes(file.type)) {
        return { url: null, error: new Error(`Invalid image type: ${file.type}. Use JPEG, PNG, or WebP.`) };
      }
      if (file.size > 5 * 1024 * 1024) {
        return { url: null, error: new Error('Image exceeds 5MB limit.') };
      }
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = type === 'main'
        ? `performers/${performerId}/main_${timestamp}_${safeName}`
        : `performers/${performerId}/gallery_${timestamp}_${safeName}`;
      const storageRef = ref(storage, path);
      const result = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(result.ref);
      return { url, error: null };
    } catch (err: unknown) {
      return { url: null, error: toError(err) };
    }
  },

  async createPerformer(performerData: Omit<Performer, 'id'>) {
    try {
      const result = await callFn<
        { performer: Omit<Performer, 'id'> },
        { success: boolean; performerId: string; performer: Performer }
      >('adminCreatePerformer', { performer: performerData });
      return { data: result.performer, error: null };
    } catch (err: unknown) {
      return { data: null, error: toError(err) };
    }
  },

  async updatePerformer(performerId: number, updates: Partial<Performer>) {
    try {
      await callFn<{ performerId: string; updates: any }, { success: boolean }>(
        'adminUpdatePerformer',
        { performerId: String(performerId), updates }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async deletePerformer(performerId: number) {
    // Soft delete by setting status to 'offline'. Admin-only via callable.
    return api.updatePerformerStatus(performerId, 'offline');
  },

  async updateDoNotServeStatus(entryId: string, status: DoNotServeStatus) {
    try {
      await callFn<{ entryId: string; status: string }, { success: boolean }>(
        'adminUpdateDoNotServeStatus',
        { entryId, status }
      );
      return { error: null };
    } catch (err: unknown) {
      return { error: toError(err) };
    }
  },

  async createDoNotServeEntry(newEntryData: Omit<DoNotServeEntry, 'id' | 'created_at' | 'status'>) {
    try {
      const result = await callFn<
        { entry: any },
        { success: boolean; entryId: string; entry: DoNotServeEntry }
      >('adminCreateDoNotServeEntry', { entry: newEntryData });
      return { data: [result.entry], error: null };
    } catch (err: unknown) {
      return { data: null, error: toError(err) };
    }
  },
};

// Type-only re-export — kept for backwards compatibility with existing imports.
export type { Performer, Booking };
