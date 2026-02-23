import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { generateAccessToken, verifyWebhookSignature } from './sumsub';
import { performDvsCheck, DvsCheckRequest } from './dvsAdapter';

const fns = functions as any;

/**
 * Generate a Sumsub access token for the authenticated user.
 */
export const getSumsubToken = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');
  }

  const uid = context.auth.uid;
  const levelName = data.levelName || 'basic-kyc-level';
  const db = admin.firestore();

  try {
    const token = await generateAccessToken(uid, levelName);
    
    // Log the token generation
    await db.collection('audit_logs').add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      actorUid: uid,
      actorRole: 'client',
      action: 'SUMSUB_TOKEN_GENERATED',
      details: { levelName }
    });

    return { token };
  } catch (error: any) {
    console.error('Error generating Sumsub token:', error);
    throw new fns.https.HttpsError('internal', 'Failed to generate KYC token.');
  }
});

/**
 * Webhook endpoint for Sumsub status updates.
 */
export const sumsubWebhook = fns.https.onRequest(async (req: any, res: any) => {
  const signature = req.headers['x-payload-digest'];
  if (!signature) {
    res.status(401).send('Missing signature');
    return;
  }

  const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(401).send('Invalid signature');
    return;
  }

  const payload = req.body;
  const externalUserId = payload.externalUserId; // This is the Firebase UID
  const type = payload.type;
  const reviewResult = payload.reviewResult;
  const db = admin.firestore();

  try {
    const userKycRef = db.collection('kyc_records').doc(externalUserId);
    
    await userKycRef.set({
      lastWebhookType: type,
      reviewResult: reviewResult || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      applicantId: payload.applicantId,
      inspectionId: payload.inspectionId,
      correlationId: payload.correlationId,
    }, { merge: true });

    // If approved, update user's custom claims or main profile
    if (type === 'applicantReviewed' && reviewResult?.reviewAnswer === 'GREEN') {
      await admin.auth().setCustomUserClaims(externalUserId, { kycVerified: true });
      await db.collection('users').doc(externalUserId).update({
        kycStatus: 'verified',
        kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else if (type === 'applicantReviewed' && reviewResult?.reviewAnswer === 'RED') {
      await db.collection('users').doc(externalUserId).update({
        kycStatus: 'rejected',
        kycRejectReason: reviewResult.rejectLabels?.join(', ') || 'Unknown'
      });
    }

    // Audit log
    await db.collection('audit_logs').add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      actorUid: 'sumsub_webhook',
      actorRole: 'system',
      action: `SUMSUB_WEBHOOK_${type}`,
      targetUid: externalUserId,
      details: { reviewResult }
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing Sumsub webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Optional AU DVS check endpoint.
 */
export const runDvsCheck = fns.https.onCall(async (data: DvsCheckRequest, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');
  }

  const uid = context.auth.uid;
  const db = admin.firestore();

  try {
    const result = await performDvsCheck(data);
    
    // Save result to Firestore
    await db.collection('kyc_records').doc(uid).collection('dvs_checks').add({
      ...result,
      requestDetails: {
        documentType: data.documentType,
        // Don't store full document numbers in plain text if possible, or encrypt them
        documentNumberMasked: data.documentNumber.slice(-4).padStart(data.documentNumber.length, '*'),
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Audit log
    await db.collection('audit_logs').add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      actorUid: uid,
      actorRole: 'client',
      action: 'DVS_CHECK_PERFORMED',
      details: { success: result.success, provider: result.provider }
    });

    return result;
  } catch (error: any) {
    console.error('Error performing DVS check:', error);
    throw new fns.https.HttpsError('internal', 'Failed to perform DVS check.');
  }
});
