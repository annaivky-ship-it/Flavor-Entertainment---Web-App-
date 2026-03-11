import { db, storage, functions, auth } from './firebaseClient';
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  orderBy,
  updateDoc,
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
import type { Performer, Booking, BookingStatus, DoNotServeEntry, DoNotServeStatus, Communication, PerformerStatus, AuditLog, VettingApplication, Role } from '../types';
import { BookingFormState } from '../components/BookingProcess';
import { mockPerformers, mockBookings, mockDoNotServeList, mockCommunications } from '../data/mockData';

/** Returns the current Firebase Auth UID, or null if not signed in. */
function currentUid(): string | null {
  return auth?.currentUser?.uid ?? null;
}

/** Whether the app is running in demo mode (mock data, no real Firebase writes) */
export const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo';

export const resetDemoData = async () => {
  if (import.meta.env.PROD) {
    console.error('resetDemoData blocked in production.');
    return;
  }
  if (!db) {
    console.error('Database not initialized.');
    return;
  }
  try {
    const batch = writeBatch(db);

    // Seed Performers
    for (const p of mockPerformers) {
      const pRef = doc(db, 'performers', String(p.id));
      batch.set(pRef, p);
    }

    // Seed Bookings
    for (const b of mockBookings) {
      const bRef = doc(db, 'bookings', b.id);
      batch.set(bRef, b);
    }

    // Seed Do Not Serve
    for (const dns of mockDoNotServeList) {
      const dnsRef = doc(db, 'do_not_serve', dns.id);
      batch.set(dnsRef, dns);
    }

    // Seed Communications
    for (const comm of mockCommunications) {
      const commRef = doc(db, 'communications', comm.id);
      batch.set(commRef, comm);
    }

    await batch.commit();
    console.log("Database seeded successfully.");
    window.location.reload();
  } catch (error) {
    console.error("Error seeding database:", error);
  }
};

export const api = {
  /**
   * Fetch initial data scoped by role.
   * - Performers are always public.
   * - Bookings/communications are scoped like subscriptions.
   * - Do-not-serve & audit logs are admin-only.
   */
  async getInitialData(role: Role = 'user') {
    const isMock = isDemoMode || import.meta.env.VITE_FIREBASE_API_KEY === undefined || import.meta.env.VITE_FIREBASE_API_KEY === '';

    if (isMock || !db) {
      if (!import.meta.env.PROD) {
        console.warn("Using mock data because Firebase is not configured.");
      }
      return {
        performers: { data: mockPerformers, error: null },
        bookings: { data: mockBookings, error: null },
        doNotServeList: { data: mockDoNotServeList, error: null },
        communications: { data: mockCommunications, error: null },
        auditLogs: { data: [], error: null },
      };
    }

    const uid = currentUid();

    const fetchCollection = async (name: string, q: any) => {
      try {
        const snap = await getDocs(q);
        return { data: snap.docs.map(d => ({ ...(d.data() as any), id: name === 'performers' ? Number(d.id) : d.id })), error: null };
      } catch (err: any) {
        if (!import.meta.env.PROD) console.error(`Error fetching ${name}:`, err);
        return { data: [], error: err };
      }
    };

    // Build role-scoped booking query
    let bookingsQuery;
    if (role === 'admin') {
      bookingsQuery = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    } else if (role === 'performer' && uid) {
      bookingsQuery = query(collection(db, 'bookings'), where('performer_uid', '==', uid), orderBy('created_at', 'desc'));
    } else if (uid) {
      bookingsQuery = query(collection(db, 'bookings'), where('client_uid', '==', uid), orderBy('created_at', 'desc'));
    } else {
      bookingsQuery = null;
    }

    // Build role-scoped communications query
    let commsQuery;
    if (role === 'admin') {
      commsQuery = query(collection(db, 'communications'), orderBy('created_at', 'desc'));
    } else if (uid) {
      commsQuery = query(collection(db, 'communications'), where('participant_uids', 'array-contains', uid), orderBy('created_at', 'desc'));
    } else {
      commsQuery = null;
    }

    const fetches: Promise<{ data: any[]; error: any }>[] = [
      fetchCollection('performers', query(collection(db, 'performers'))),
      bookingsQuery ? fetchCollection('bookings', bookingsQuery) : Promise.resolve({ data: [], error: null }),
      role === 'admin' ? fetchCollection('do_not_serve', query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc'))) : Promise.resolve({ data: [], error: null }),
      commsQuery ? fetchCollection('communications', commsQuery) : Promise.resolve({ data: [], error: null }),
      role === 'admin' ? fetchCollection('audit_logs', query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50))) : Promise.resolve({ data: [], error: null }),
    ];

    const [pRes, bRes, dRes, cRes, aRes] = await Promise.all(fetches);

    return {
      performers: pRes,
      bookings: bRes,
      doNotServeList: dRes,
      communications: cRes,
      auditLogs: aRes,
    };
  },

  /**
   * Subscribe to bookings scoped by role:
   * - admin: all bookings
   * - performer: only bookings assigned to their UID
   * - user/client: only bookings they created
   */
  subscribeToBookings(callback: (bookings: Booking[]) => void, role: Role = 'user') {
    if (!db) return () => { };
    const uid = currentUid();
    let q;
    if (role === 'admin') {
      q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    } else if (role === 'performer' && uid) {
      q = query(collection(db, 'bookings'), where('performer_uid', '==', uid), orderBy('created_at', 'desc'));
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
      if (!import.meta.env.PROD) console.error("Error subscribing to bookings:", err);
    });
  },

  /**
   * Subscribe to communications scoped by role:
   * - admin: all communications
   * - others: only messages where the user's UID is in participant_uids
   */
  subscribeToCommunications(callback: (comms: Communication[]) => void, role: Role = 'user') {
    if (!db) return () => { };
    const uid = currentUid();
    let q;
    if (role === 'admin') {
      q = query(collection(db, 'communications'), orderBy('created_at', 'desc'));
    } else if (uid) {
      q = query(collection(db, 'communications'), where('participant_uids', 'array-contains', uid), orderBy('created_at', 'desc'));
    } else {
      callback([]);
      return () => { };
    }
    return onSnapshot(q, (snap) => {
      const comms = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Communication[];
      callback(comms);
    }, (err) => {
      if (!import.meta.env.PROD) console.error("Error subscribing to communications:", err);
    });
  },

  subscribeToPerformers(callback: (performers: Performer[]) => void) {
    if (!db) return () => { };
    const q = query(collection(db, 'performers'));
    return onSnapshot(q, (snap) => {
      const performers = snap.docs.map(d => ({ ...d.data(), id: Number(d.id) })) as Performer[];
      callback(performers);
    }, (err) => {
      if (!import.meta.env.PROD) console.error("Error subscribing to performers:", err);
    });
  },

  /** Subscribe to do-not-serve list (admin only). */
  subscribeToDoNotServe(callback: (entries: DoNotServeEntry[]) => void, role: Role = 'user') {
    if (!db || role !== 'admin') {
      callback([]);
      return () => { };
    }
    const q = query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const entries = snap.docs.map(d => ({ ...d.data(), id: d.id })) as DoNotServeEntry[];
      callback(entries);
    }, (err) => {
      if (!import.meta.env.PROD) console.error("Error subscribing to do_not_serve:", err);
    });
  },

  /** Subscribe to audit logs (admin only). */
  subscribeToAuditLogs(callback: (logs: AuditLog[]) => void, role: Role = 'user') {
    if (!db || role !== 'admin') {
      callback([]);
      return () => { };
    }
    const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ ...d.data(), id: d.id })) as AuditLog[];
      callback(logs);
    }, (err) => {
      if (!import.meta.env.PROD) console.error("Error subscribing to audit_logs:", err);
    });
  },

  // Fix: Added createAuditLog to allow manual logging of actions to the audit_logs collection.
  async createAuditLog(action: string, actorUid: string, details: any = {}, actorRole: 'client' | 'admin' | 'system' = 'system') {
    if (!db) return { id: null, error: new Error('Firebase not initialized') };
    try {
      const docRef = await addDoc(collection(db, 'audit_logs'), {
        action,
        actorUid,
        actorRole,
        details,
        createdAt: serverTimestamp()
      });
      return { id: docRef.id, error: null };
    } catch (err: any) {
      if (!import.meta.env.PROD) console.error("Error creating audit log:", err);
      return { id: null, error: err };
    }
  },

  async createVettingDraft(data: Partial<VettingApplication>) {
    if (!db || !auth) throw new Error("Firebase not initialized");
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required");

    const appRef = doc(collection(db, 'vetting_applications'));
    const application: Partial<VettingApplication> = {
      ...data,
      id: appRef.id,
      applicationId: appRef.id,
      userId: user.uid,
      status: 'draft',
      riskFlags: [],
      lastUpdatedAt: new Date().toISOString()
    };

    await setDoc(appRef, application);
    return appRef.id;
  },

  async uploadVettingFiles(applicationId: string, idFile: File, selfieFile: File) {
    if (!db || !auth || !storage) throw new Error("Firebase not initialized");
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required");

    const idPath = `vetting/${user.uid}/${applicationId}/id_${idFile.name}`;
    const selfiePath = `vetting/${user.uid}/${applicationId}/selfie_${selfieFile.name}`;

    const idRef = ref(storage, idPath);
    const selfieRef = ref(storage, selfiePath);

    await Promise.all([
      uploadBytes(idRef, idFile),
      uploadBytes(selfieRef, selfieFile)
    ]);

    await updateDoc(doc(db, 'vetting_applications', applicationId), {
      idFilePath: idPath,
      selfieFilePath: selfiePath,
      lastUpdatedAt: new Date().toISOString()
    });

    return { idPath, selfiePath };
  },

  async submitVettingApplication(applicationId: string) {
    if (!functions) throw new Error("Firebase not initialized");
    const submitFn = httpsCallable(functions, 'submitApplication');
    return await submitFn({ applicationId });
  },

  async createBookingRequest(formState: BookingFormState, performers: Performer[]) {
    if (!db || !auth || !storage || !functions) {
      if (!import.meta.env.PROD) console.warn('Firebase not initialized. Simulating booking request.');
      return { data: [], error: null };
    }
    try {
      const callCreateBooking = httpsCallable(functions, 'createBookingRequest');

      let idUrl = null;
      let selfieUrl = null;

      // Handle parallel file uploads for legacy/demo structure
      const timestamp = Date.now();
      const uploadPromises = [];
      const user = auth.currentUser;
      if (!user) throw new Error("Authentication required for booking submission");
      const userUid = user.uid;
      const submissionId = `booking_kyc_${timestamp}`;

      if (formState.idDocument) {
        const idPath = `vetting/${userUid}/${submissionId}/id_${formState.idDocument.name}`;
        const idRef = ref(storage, idPath);
        uploadPromises.push(uploadBytes(idRef, formState.idDocument).then(async res => idUrl = await getDownloadURL(res.ref)));
      }

      if (formState.selfieDocument) {
        const selfiePath = `vetting/${userUid}/${submissionId}/selfie_${formState.selfieDocument.name}`;
        const selfieRef = ref(storage, selfiePath);
        uploadPromises.push(uploadBytes(selfieRef, formState.selfieDocument).then(async res => selfieUrl = await getDownloadURL(res.ref)));
      }

      await Promise.all(uploadPromises);

      const result = await callCreateBooking({
        formState: {
          ...formState,
          id_document_path: idUrl,
          selfie_document_path: selfieUrl,
          idDocument: null,
          selfieDocument: null
        },
        performerIds: performers.map(p => p.id)
      }) as { data: { success: boolean; bookingIds: string[] } };

      const { bookingIds } = result.data;

      const newBookings = await Promise.all(bookingIds.map(async (id) => {
        const bDoc = await getDoc(doc(db!, 'bookings', id));
        return { ...bDoc.data(), id: bDoc.id } as Booking;
      }));

      return { data: newBookings, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  async updateBookingStatus(bookingId: string, status: BookingStatus, updates: any = {}) {
    if (!db) return { error: new Error('Firebase not initialized') };
    try {
      if (import.meta.env.VITE_FIREBASE_API_KEY === undefined || import.meta.env.VITE_FIREBASE_API_KEY === '') {
        return { error: null };
      }
      const docRef = doc(db, 'bookings', bookingId);
      await updateDoc(docRef, {
        status,
        ...updates,
        ...(status === 'confirmed' ? { verified_at: new Date().toISOString() } : {})
      });
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async getBookingMessages(bookingId: string) {
    if (!db) return { data: [], error: null };
    try {
      const q = query(collection(db, 'communications'), where('booking_id', '==', bookingId), orderBy('created_at', 'asc'));
      const snap = await getDocs(q);
      return { data: snap.docs.map(d => ({ ...d.data(), id: d.id })) as Communication[], error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  async addCommunication(commData: Omit<Communication, 'id' | 'created_at' | 'read'>) {
    if (!db) return { data: null, error: new Error('Firebase not initialized') };
    try {
      if (import.meta.env.VITE_FIREBASE_API_KEY === undefined || import.meta.env.VITE_FIREBASE_API_KEY === '') {
        return { data: [{ ...commData, id: `msg-${Date.now()}`, created_at: new Date().toISOString(), read: false }] as Communication[], error: null };
      }

      const uid = currentUid();
      // Build participant_uids for ownership scoping
      const participantUids: string[] = [];
      if (uid) participantUids.push(uid);
      if (commData.recipient_uid && commData.recipient_uid !== uid) {
        participantUids.push(commData.recipient_uid);
      }

      const docRef = await addDoc(collection(db, 'communications'), {
        ...commData,
        sender_uid: uid,
        participant_uids: participantUids,
        created_at: new Date().toISOString(),
        read: false
      });
      const newDoc = await getDoc(docRef);
      return { data: [{ ...newDoc.data(), id: newDoc.id }] as Communication[], error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  async updatePerformerStatus(performerId: number, status: PerformerStatus) {
    if (!db) return { error: new Error('Firebase not initialized') };
    try {
      if (import.meta.env.VITE_FIREBASE_API_KEY === undefined || import.meta.env.VITE_FIREBASE_API_KEY === '') {
        return { error: null };
      }
      const docRef = doc(db, 'performers', String(performerId));
      await updateDoc(docRef, { status });
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async createPerformer(performerData: Omit<Performer, 'id'>) {
    if (!db) return { data: null, error: new Error('Firebase not initialized') };
    try {
      if (import.meta.env.VITE_FIREBASE_API_KEY === undefined || import.meta.env.VITE_FIREBASE_API_KEY === '') {
        return { data: { ...performerData, id: Math.floor(Math.random() * 1000) } as Performer, error: null };
      }
      const performersSnap = await getDocs(query(collection(db, 'performers'), orderBy('id', 'desc'), limit(1)));
      const lastId = performersSnap.docs.length > 0 ? (performersSnap.docs[0].data() as Performer).id : 0;
      const newId = lastId + 1;

      const docRef = doc(db, 'performers', String(newId));
      const newPerformer = { ...performerData, id: newId };
      await setDoc(docRef, newPerformer);
      return { data: newPerformer, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  async updatePerformer(performerId: number, updates: Partial<Performer>) {
    if (!db) return { error: new Error('Firebase not initialized') };
    try {
      const docRef = doc(db, 'performers', String(performerId));
      await updateDoc(docRef, updates);
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async deletePerformer(performerId: number) {
    if (!db) return { error: new Error('Firebase not initialized') };
    try {
      const docRef = doc(db, 'performers', String(performerId));
      // In a real app, we might want to check for active bookings first
      await updateDoc(docRef, { status: 'offline' }); // Soft delete/Deactivate
      // Or hard delete: await deleteDoc(docRef);
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async updateDoNotServeStatus(entryId: string, status: DoNotServeStatus) {
    if (!db) return { error: new Error('Firebase not initialized') };
    try {
      if (import.meta.env.VITE_FIREBASE_API_KEY === undefined || import.meta.env.VITE_FIREBASE_API_KEY === '') {
        return { error: null };
      }
      const docRef = doc(db, 'do_not_serve', entryId);
      await updateDoc(docRef, { status });
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async createDoNotServeEntry(newEntryData: Omit<DoNotServeEntry, 'id' | 'created_at' | 'status'>) {
    if (!db) return { data: null, error: new Error('Firebase not initialized') };
    try {
      const docRef = await addDoc(collection(db, 'do_not_serve'), {
        ...newEntryData,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      const newDoc = await getDoc(docRef);
      return { data: [{ ...newDoc.data(), id: newDoc.id }] as DoNotServeEntry[], error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  async sendBookingMessage(bookingId: string, message: string, sender: string, recipient: string) {
    try {
      const res = await this.addCommunication({
        booking_id: bookingId,
        message,
        sender,
        recipient,
        type: 'direct_message'
      });
      return {
        data: res.data ? res.data[0] : null,
        error: res.error
      };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }
};