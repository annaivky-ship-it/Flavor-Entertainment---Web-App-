import * as admin from 'firebase-admin';

export async function checkAndSetIdempotency(key: string): Promise<boolean> {
  const db = admin.firestore();
  const ref = db.collection('idempotency_keys').doc(key);
  
  try {
    await db.runTransaction(async (t: FirebaseFirestore.Transaction) => {
      const doc = await t.get(ref);
      if (doc.exists) {
        throw new Error('ALREADY_PROCESSED');
      }
      t.set(ref, {
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return true;
  } catch (e: any) {
    if (e.message === 'ALREADY_PROCESSED') {
      return false;
    }
    throw e;
  }
}
