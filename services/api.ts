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
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import type { Performer, Booking, BookingStatus, DoNotServeEntry, DoNotServeStatus, Communication, PerformerStatus, AuditLog, VettingApplication } from '../types';
import { BookingFormState } from '../components/BookingProcess';
import { mockPerformers, mockBookings, mockDoNotServeList, mockCommunications } from '../data/mockData';

/** Whether the app is running in demo mode (mock data, no real Firebase writes) */
export const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo';

export const resetDemoData = async () => {
  if (import.meta.env.PROD && !isDemoMode) {
    console.error('resetDemoData called in production — blocked.');
    return;
  }
  if (!db) {
    console.error('Database not initialized. Check environment variables.');
    return;
  }
  // Seeding database...
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
    // Seed complete — reload
    window.location.reload();
  } catch (error) {
    console.error("Error seeding database:", error);
  }
};

export const api = {
  async getInitialData() {
    const isMock = isDemoMode || import.meta.env.VITE_FIREBASE_API_KEY === undefined || import.meta.env.VITE_FIREBASE_API_KEY === '';

    if (isMock || !db) {
      console.warn("Using mock data because Firebase is not configured.");
      return {
        performers: { data: mockPerformers, error: null },
        bookings: { data: mockBookings, error: null },
        doNotServeList: { data: mockDoNotServeList, error: null },
        communications: { data: mockCommunications, error: null },
        auditLogs: { data: [], error: null },
      };
    }

    const fetchCollection = async (name: string, q: any) => {
      try {
        const snap = await getDocs(q);
        return { data: snap.docs.map(d => ({ ...(d.data() as any), id: name === 'performers' ? Number(d.id) : d.id })), error: null };
      } catch (err: any) {
        console.error(`Error fetching ${name}:`, err);
        // Permission errors are expected when not logged in — return empty, not an error
        if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
          console.warn(`No permission for ${name} — user may not be logged in yet.`);
          return { data: [], error: null };
        }
        if (err.code === 'unavailable') {
          console.warn(`Firestore is currently offline or unreachable. Returning mock data for ${name} if available.`);
          if (name === 'performers') return { data: mockPerformers, error: null };
          if (name === 'bookings') return { data: mockBookings, error: null };
          if (name === 'do_not_serve') return { data: mockDoNotServeList, error: null };
          if (name === 'communications') return { data: mockCommunications, error: null };
        }
        return { data: [], error: err };
      }
    };

    const [pRes, bRes, dRes, cRes, aRes] = await Promise.all([
      fetchCollection('performers', query(collection(db, 'performers'))),
      fetchCollection('bookings', query(collection(db, 'bookings'), orderBy('created_at', 'desc'))),
      fetchCollection('do_not_serve', query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc'))),
      fetchCollection('communications', query(collection(db, 'communications'), orderBy('created_at', 'desc'))),
      fetchCollection('audit_log', query(collection(db, 'audit_log'), orderBy('createdAt', 'desc'), limit(50))),
    ]);

    return {
      performers: pRes,
      bookings: bRes,
      doNotServeList: dRes,
      communications: cRes,
      auditLogs: aRes,
    };
  },

  subscribeToBookings(callback: (bookings: Booking[]) => void) {
    if (!db) return () => { };
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const bookings = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Booking[];
      callback(bookings);
    }, (err) => {
      console.error("Error subscribing to bookings:", err);
    });
  },

  subscribeToCommunications(callback: (comms: Communication[]) => void) {
    if (!db) return () => { };
    const q = query(collection(db, 'communications'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const comms = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Communication[];
      callback(comms);
    }, (err) => {
      console.error("Error subscribing to communications:", err);
    });
  },

  subscribeToPerformers(callback: (performers: Performer[]) => void) {
    if (!db) return () => { };
    const q = query(collection(db, 'performers'));
    return onSnapshot(q, (snap) => {
      const performers = snap.docs.map(d => ({ ...d.data(), id: Number(d.id) })) as Performer[];
      callback(performers);
    }, (err) => {
      console.error("Error subscribing to performers:", err);
    });
  },

  subscribeToDoNotServe(callback: (entries: DoNotServeEntry[]) => void) {
    if (!db) return () => { };
    const q = query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const entries = snap.docs.map(d => ({ ...d.data(), id: d.id })) as DoNotServeEntry[];
      callback(entries);
    }, (err) => {
      console.error("Error subscribing to do_not_serve:", err);
    });
  },

  subscribeToAuditLogs(callback: (logs: AuditLog[]) => void) {
    if (!db) return () => { };
    const q = query(collection(db, 'audit_log'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ ...d.data(), id: d.id })) as AuditLog[];
      callback(logs);
    }, (err) => {
      console.error("Error subscribing to audit_log:", err);
    });
  },

  async uploadPerformerPhoto(file: File, performerName: string): Promise<string> {
    if (!storage) throw new Error("Firebase Storage not initialized");
    const safeName = performerName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'performer';
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `performers/${safeName}_${timestamp}.${ext}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  },

  // Fix: Added createAuditLog to allow manual logging of actions to the audit_log collection.
  async createAuditLog(action: string, actorUid: string, details: any = {}, actorRole: 'client' | 'admin' | 'system' = 'system') {
    if (!db) return { id: null, error: new Error('Firebase not initialized') };
    try {
      const docRef = await addDoc(collection(db, 'audit_log'), {
        action,
        actorUid,
        actorRole,
        details,
        createdAt: serverTimestamp()
      });
      return { id: docRef.id, error: null };
    } catch (err: any) {
      console.error("Error creating audit log:", err);
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
    if (!db) {
      console.warn('Firebase not initialized. Simulating booking request.');
      return { data: [], error: null };
    }
    try {
      // Try to authenticate — anonymous sign-in as fallback for guests
      if (auth && !auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (authErr) {
          console.warn('Anonymous auth not available, proceeding without auth:', authErr);
        }
      }

      // Try Cloud Function first, fall back to direct Firestore write
      let bookingIds: string[] = [];

      if (functions && auth?.currentUser) {
        try {
          const callCreateBooking = httpsCallable(functions, 'createBookingRequest');
          const result = await callCreateBooking({
            formState: {
              ...formState,
              phone: formState.mobile, // Cloud Function expects 'phone'
              durationHours: formState.duration, // Cloud Function expects 'durationHours'
              servicesRequested: formState.selectedServices, // Cloud Function expects 'servicesRequested'
              clientMessage: formState.client_message, // Cloud Function expects 'clientMessage'
              isAsap: formState.isASAP || false,
              performer_eta_minutes: formState.isASAP ? 60 : null,
            },
            performerIds: performers.map(p => p.id)
          }) as { data: { success: boolean; bookingIds: string[] } };
          bookingIds = result.data.bookingIds;
        } catch (cfErr: any) {
          console.warn('Cloud Function failed, using direct Firestore write:', cfErr.message);
          bookingIds = await this._createBookingsDirect(formState, performers);
        }
      } else {
        bookingIds = await this._createBookingsDirect(formState, performers);
      }

      // Build booking objects from form data instead of reading back
      // (Firestore read rules may block unauthenticated users)
      const newBookings: Booking[] = bookingIds.map((id, i) => ({
        id,
        performer_id: performers[i].id,
        performer: { id: performers[i].id, name: performers[i].name },
        client_name: formState.fullName,
        client_email: formState.email,
        client_phone: formState.mobile,
        client_dob: formState.dob,
        event_date: formState.eventDate,
        event_time: formState.eventTime,
        event_address: formState.eventAddress,
        event_type: formState.eventType,
        duration_hours: Number(formState.duration),
        number_of_guests: Number(formState.numberOfGuests),
        services_requested: formState.selectedServices,
        client_message: formState.client_message || null,
        didit_verification_id: formState.didit_verification_id || null,
        is_asap: formState.isASAP || false,
        performer_eta_minutes: formState.isASAP ? 60 : null,
        status: 'pending_performer_acceptance' as const,
        payment_status: 'unpaid' as const,
        deposit_receipt_path: null,
        verified_by_admin_name: null,
        verified_at: null,
        created_at: new Date().toISOString(),
      }));

      return { data: newBookings, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  /** Direct Firestore write fallback when Cloud Function is unavailable */
  async _createBookingsDirect(formState: BookingFormState, performers: Performer[]): Promise<string[]> {
    if (!db) throw new Error('Firebase not initialized');
    const bookingIds: string[] = [];

    for (const performer of performers) {
      const bookingData = {
        performer_id: performer.id,
        performer: { id: performer.id, name: performer.name },
        client_name: formState.fullName,
        client_email: formState.email.toLowerCase().trim(),
        client_phone: formState.mobile,
        client_dob: formState.dob,
        event_date: formState.eventDate,
        event_time: formState.eventTime,
        event_address: formState.eventAddress,
        event_type: formState.eventType,
        duration_hours: Number(formState.duration),
        service_durations: formState.serviceDurations || {},
        number_of_guests: Number(formState.numberOfGuests),
        services_requested: formState.selectedServices,
        client_message: formState.client_message || null,
        didit_verification_id: formState.didit_verification_id || null,
        is_asap: formState.isASAP || false,
        performer_eta_minutes: formState.isASAP ? 60 : null,
        status: 'pending_performer_acceptance' as const,
        payment_status: 'unpaid' as const,
        deposit_receipt_path: null,
        verified_by_admin_name: null,
        verified_at: null,
        created_at: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      bookingIds.push(docRef.id);
    }

    return bookingIds;
  },

  async updateBookingStatus(bookingId: string, status: BookingStatus, updates: any = {}) {
    if (!db) return { error: new Error('Firebase not initialized') };
    try {
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
      const currentUser = auth?.currentUser;
      const senderUid = commData.sender_uid || currentUser?.uid || 'system';
      // Ensure participant_uids is populated for Firestore security rules
      const participantUids = commData.participant_uids && commData.participant_uids.length > 0
        ? commData.participant_uids
        : currentUser ? [currentUser.uid] : [];
      const docRef = await addDoc(collection(db, 'communications'), {
        ...commData,
        sender_uid: senderUid,
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
      await setDoc(docRef, updates, { merge: true });
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
  },

  async getUsers(): Promise<{ admins: Array<{ uid: string; email?: string; grantedAt?: string }>; performerAuths: Array<{ uid: string; performerId?: number; email?: string; grantedAt?: string }> }> {
    if (!db) return { admins: [], performerAuths: [] };
    try {
      const [adminsSnap, perfAuthSnap] = await Promise.all([
        getDocs(collection(db, 'admins')),
        getDocs(collection(db, 'performers_auth'))
      ]);
      const admins = adminsSnap.docs.map(d => ({ uid: d.id, ...d.data() })) as Array<{ uid: string; email?: string; grantedAt?: string }>;
      const performerAuths = perfAuthSnap.docs.map(d => ({ uid: d.id, ...d.data() })) as Array<{ uid: string; performerId?: number; email?: string; grantedAt?: string }>;
      return { admins, performerAuths };
    } catch (err) {
      console.error('Error fetching users:', err);
      return { admins: [], performerAuths: [] };
    }
  },

  async grantAdminAccess(uid: string, email: string) {
    if (!db) throw new Error('Firebase not initialized');
    await setDoc(doc(db, 'admins', uid), { email, grantedAt: new Date().toISOString() });
  },

  async revokeAdminAccess(uid: string) {
    if (!db) throw new Error('Firebase not initialized');

    await deleteDoc(doc(db, 'admins', uid));
  },

  async grantPerformerAccess(uid: string, performerId: number, email: string) {
    if (!db) throw new Error('Firebase not initialized');
    await setDoc(doc(db, 'performers_auth', uid), { performerId, email, grantedAt: new Date().toISOString() });
  },

  async revokePerformerAccess(uid: string) {
    if (!db) throw new Error('Firebase not initialized');

    await deleteDoc(doc(db, 'performers_auth', uid));
  },

  // --- Payment Settings ---
  async getPaymentSettings(): Promise<{ auto_confirm_enabled: boolean; auto_confirm_delay_minutes: number }> {
    if (!db) return { auto_confirm_enabled: false, auto_confirm_delay_minutes: 0 };
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'payments'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        return {
          auto_confirm_enabled: data.auto_confirm_enabled || false,
          auto_confirm_delay_minutes: data.auto_confirm_delay_minutes || 0,
        };
      }
      return { auto_confirm_enabled: false, auto_confirm_delay_minutes: 0 };
    } catch (err) {
      console.error('Error fetching payment settings:', err);
      return { auto_confirm_enabled: false, auto_confirm_delay_minutes: 0 };
    }
  },

  async updatePaymentSettings(settings: { auto_confirm_enabled: boolean; auto_confirm_delay_minutes: number }) {
    if (!db) throw new Error('Firebase not initialized');
    await setDoc(doc(db, 'settings', 'payments'), {
      ...settings,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  }
};