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
import type { Performer, Booking, BookingStatus, DoNotServeEntry, DoNotServeStatus, Communication, PerformerStatus, AuditLog, VettingApplication } from '../types';
import { BookingFormState } from '../components/BookingProcess';
import { mockPerformers, mockBookings, mockDoNotServeList, mockCommunications, mockAuditLogs as mockAuditLogsImport } from '../data/mockData';

// mockAuditLogs may not exist in the production mockData.ts — default to empty array
const mockAuditLogsData: any[] = (typeof mockAuditLogsImport !== 'undefined' ? mockAuditLogsImport : []);

export const resetDemoData = async () => {
  if (import.meta.env.PROD) {
    console.error('resetDemoData called in production — blocked.');
    return;
  }
  // In pure demo mode (no Firebase), a page reload restores in-memory state from demoData
  if (!db) {
    window.location.reload();
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
      console.warn('Firebase not initialized. Returning mock/demo data.');
      return {
        performers: { data: mockPerformers, error: null },
        bookings: { data: mockBookings, error: null },
        doNotServeList: { data: mockDoNotServeList, error: null },
        communications: { data: mockCommunications, error: null },
        auditLogs: { data: mockAuditLogsData, error: null },
      };
    }

    const fetchCollection = async (name: string, q: any) => {
      try {
        const snap = await getDocs(q);
        return { data: snap.docs.map(d => ({ ...(d.data() as any), id: name === 'performers' ? Number(d.id) : d.id })), error: null };
      } catch (err: any) {
        console.error(`Error fetching ${name}:`, err);
        if (err.code === 'unavailable') {
          console.warn(`Firestore is currently offline or unreachable. Returning mock data for ${name} if available.`);
          // Fallback to mock data if connection is unavailable
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
      fetchCollection('audit_logs', query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50))),
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
    if (!db) return () => {};
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snap) => {
      const bookings = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Booking[];
      callback(bookings);
    }, (err) => {
      console.error("Error subscribing to bookings:", err);
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
  }
};