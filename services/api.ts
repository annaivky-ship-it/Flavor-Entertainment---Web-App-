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
  type Query,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Performer, Booking, BookingStatus, DoNotServeEntry, DoNotServeStatus, Communication, PerformerStatus, AuditLog, VettingApplication, AppNotification } from '../types';
import { BookingFormState } from '../components/BookingProcess';
import { mockPerformers, mockBookings, mockDoNotServeList, mockCommunications } from '../data/mockData';

export const resetDemoData = async (adminToken?: string) => {
  if (import.meta.env.PROD) {
    console.error('resetDemoData called in production — blocked.');
    return;
  }
  // Require an explicit token to prevent accidental calls
  if (adminToken !== 'CONFIRM_RESET') {
    console.warn('resetDemoData: pass adminToken="CONFIRM_RESET" to proceed.');
    return;
  }
  if (!db) {
    console.error('Database not initialized. Check environment variables.');
    return;
  }
  console.log("Starting database seed...");
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
  async getInitialData() {
    if (!db) {
      console.warn('Firebase not initialized. Returning mock data.');
      return {
        performers: { data: mockPerformers, error: null },
        bookings: { data: mockBookings, error: null },
        doNotServeList: { data: mockDoNotServeList, error: null },
        communications: { data: mockCommunications, error: null },
        auditLogs: { data: [] as AuditLog[], error: null },
        usingMockData: true,
      };
    }

    let usingMockData = false;

    const fetchCollection = async <T extends { id: string | number }>(
      name: string,
      q: Query<DocumentData>,
      idMapper: (rawId: string) => string | number = (id) => id
    ): Promise<{ data: T[]; error: FirestoreError | null }> => {
      try {
        const snap = await getDocs(q);
        return {
          data: snap.docs.map(d => ({ ...(d.data() as Omit<T, 'id'>), id: idMapper(d.id) } as T)),
          error: null,
        };
      } catch (err) {
        const firestoreErr = err as FirestoreError;
        console.error(`Error fetching ${name}:`, firestoreErr);
        if (firestoreErr.code === 'unavailable') {
          usingMockData = true;
          if (name === 'performers') return { data: mockPerformers as unknown as T[], error: null };
          if (name === 'bookings') return { data: mockBookings as unknown as T[], error: null };
          if (name === 'do_not_serve') return { data: mockDoNotServeList as unknown as T[], error: null };
          if (name === 'communications') return { data: mockCommunications as unknown as T[], error: null };
        }
        return { data: [], error: firestoreErr };
      }
    };

    const [pRes, bRes, dRes, cRes, aRes] = await Promise.all([
      fetchCollection<Performer>('performers', query(collection(db, 'performers')), (id) => Number(id)),
      fetchCollection<Booking>('bookings', query(collection(db, 'bookings'), orderBy('created_at', 'desc'))),
      fetchCollection<DoNotServeEntry>('do_not_serve', query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc'))),
      fetchCollection<Communication>('communications', query(collection(db, 'communications'), orderBy('created_at', 'desc'))),
      fetchCollection<AuditLog>('audit_logs', query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50))),
    ]);

    return {
      performers: pRes,
      bookings: bRes,
      doNotServeList: dRes,
      communications: cRes,
      auditLogs: aRes,
      usingMockData,
    };
  },

  subscribeToBookings(callback: (bookings: Booking[]) => void) {
    if (!db) return () => {};
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const bookings = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Booking[];
      callback(bookings);
    }, (err) => {
      console.error("Error subscribing to bookings:", err);
    });
  },

  subscribeToBooking(bookingId: string, callback: (booking: Booking | null) => void) {
    if (!db) return () => {};
    const bookingRef = doc(db, 'bookings', bookingId);
    return onSnapshot(bookingRef, (snap) => {
      if (!snap.exists()) { callback(null); return; }
      callback({ ...snap.data(), id: snap.id } as Booking);
    }, (err) => {
      console.error("Error subscribing to booking:", err);
    });
  },

  subscribeToCommunications(callback: (comms: Communication[]) => void) {
    if (!db) return () => {};
    const q = query(collection(db, 'communications'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const comms = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Communication[];
      callback(comms);
    }, (err) => {
      console.error("Error subscribing to communications:", err);
    });
  },

  subscribeToPerformers(callback: (performers: Performer[]) => void) {
    if (!db) return () => {};
    const q = query(collection(db, 'performers'));
    return onSnapshot(q, (snap) => {
      const performers = snap.docs.map(d => ({ ...d.data(), id: Number(d.id) })) as Performer[];
      callback(performers);
    }, (err) => {
      console.error("Error subscribing to performers:", err);
    });
  },

  subscribeToDoNotServe(callback: (entries: DoNotServeEntry[]) => void) {
    if (!db) return () => {};
    const q = query(collection(db, 'do_not_serve'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const entries = snap.docs.map(d => ({ ...d.data(), id: d.id })) as DoNotServeEntry[];
      callback(entries);
    }, (err) => {
      console.error("Error subscribing to do_not_serve:", err);
    });
  },

  subscribeToAuditLogs(callback: (logs: AuditLog[]) => void) {
    if (!db) return () => {};
    const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ ...d.data(), id: d.id })) as AuditLog[];
      callback(logs);
    }, (err) => {
      console.error("Error subscribing to audit_logs:", err);
    });
  },

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
    if (!db || !auth || !storage || !functions) {
      console.warn('Firebase not initialized. Simulating booking request.');
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
      const docRef = await addDoc(collection(db, 'communications'), {
        ...commData,
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

  async getUserProfile(uid: string) {
    if (!db) return { data: null, error: new Error('Firebase not initialized') };
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { data: docSnap.data(), error: null };
      }
      return { data: null, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  async createUserProfile(uid: string, data: any) {
    if (!db) return { data: null, error: new Error('Firebase not initialized') };
    try {
      const docRef = doc(db, 'users', uid);
      await setDoc(docRef, {
        ...data,
        uid,
        created_at: serverTimestamp()
      }, { merge: true });
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async createNotification(
    notification: Omit<AppNotification, 'id' | 'createdAt'>
  ): Promise<void> {
    if (!db) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        ...notification,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to create notification:', err);
    }
  },

  async triggerBookingStatusNotification(
    booking: Booking,
    newStatus: BookingStatus,
    clientUserId: string,
    performerUserId: string
  ): Promise<void> {
    const statusMessages: Partial<
      Record<
        BookingStatus,
        { clientTitle: string; clientMessage: string; performerTitle: string; performerMessage: string; type: AppNotification['type'] }
      >
    > = {
      confirmed: {
        clientTitle: 'Booking Confirmed!',
        clientMessage: `Your booking for ${booking.event_type} is confirmed. See you on ${new Date(booking.event_date).toLocaleDateString()}!`,
        performerTitle: 'Booking Confirmed',
        performerMessage: `Booking for ${booking.client_name} on ${new Date(booking.event_date).toLocaleDateString()} is confirmed.`,
        type: 'booking_confirmed',
      },
      cancelled: {
        clientTitle: 'Booking Cancelled',
        clientMessage: `Your booking for ${booking.event_type} has been cancelled.`,
        performerTitle: 'Booking Cancelled',
        performerMessage: `Booking for ${booking.client_name} has been cancelled.`,
        type: 'booking_cancelled',
      },
      deposit_pending: {
        clientTitle: 'Action Required: Pay Deposit',
        clientMessage: `Your booking for ${booking.event_type} is approved. Please pay the deposit to confirm.`,
        performerTitle: 'Booking Approved for Deposit',
        performerMessage: `Booking from ${booking.client_name} is awaiting deposit.`,
        type: 'payment_received',
      },
      pending_vetting: {
        clientTitle: 'Booking Under Review',
        clientMessage: `Your booking for ${booking.event_type} is being reviewed by our team.`,
        performerTitle: 'New Booking Accepted',
        performerMessage: `You accepted ${booking.client_name}'s booking. It is now pending admin review.`,
        type: 'booking_pending',
      },
      rejected: {
        clientTitle: 'Booking Rejected',
        clientMessage: `Unfortunately your booking for ${booking.event_type} could not be completed.`,
        performerTitle: 'Booking Rejected',
        performerMessage: `Booking for ${booking.client_name} has been rejected.`,
        type: 'booking_cancelled',
      },
    };

    const msgs = statusMessages[newStatus];
    if (!msgs) return;

    const baseNotif = {
      bookingId: booking.id,
      read: false,
    };

    await Promise.all([
      this.createNotification({
        ...baseNotif,
        userId: clientUserId,
        type: msgs.type,
        title: msgs.clientTitle,
        message: msgs.clientMessage,
      }),
      this.createNotification({
        ...baseNotif,
        userId: performerUserId,
        type: msgs.type,
        title: msgs.performerTitle,
        message: msgs.performerMessage,
      }),
    ]);
  },

  async getAvailability(performerId: string | number): Promise<string[]> {
    if (!db) return [];
    try {
      const docRef = doc(db, 'performers', String(performerId), 'availability', 'blocked_dates');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as { dates?: string[] };
        return data.dates ?? [];
      }
      return [];
    } catch (err) {
      console.error('Failed to get availability:', err);
      return [];
    }
  },

  async saveAvailability(performerId: string | number, dates: string[]): Promise<void> {
    if (!db) return;
    try {
      const docRef = doc(db, 'performers', String(performerId), 'availability', 'blocked_dates');
      await setDoc(docRef, { dates, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error('Failed to save availability:', err);
    }
  },
};
