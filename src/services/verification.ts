/**
 * Typed wrappers around the self-hosted verification callables.
 *
 * The new callables run in `australia-southeast1`, so this module obtains
 * a region-bound Functions instance separately from the legacy
 * `services/firebaseClient.ts` (which is regionless = us-central1).
 *
 * App Check, when enabled at the project level, is automatically attached
 * to every callable invocation by the Firebase SDK.
 */

import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { app } from '../../services/firebaseClient';

const REGION = 'australia-southeast1';

const fns: Functions | null = app ? getFunctions(app, REGION) : null;

function call<TIn, TOut>(name: string) {
  return async (data: TIn): Promise<TOut> => {
    if (!fns) throw new Error('Firebase not initialised.');
    const callable = httpsCallable<TIn, TOut>(fns, name);
    const res = await callable(data);
    return res.data;
  };
}

// --- Customer ---

export type TrustTier = 'unverified' | 'verified' | 'trusted';

export const sendSmsOtp = call<
  { bookingId: string; phoneE164: string },
  { success: boolean; expiresInSeconds: number }
>('sendSmsOtp');

export const verifySmsOtp = call<
  { bookingId: string; code: string },
  { success: boolean }
>('verifySmsOtp');

export const submitLivenessCheck = call<
  { bookingId: string; embedding: number[]; livenessScore: number; ageEstimate: number },
  { success: boolean }
>('submitLivenessCheck');

export const getCustomerVerificationStatus = call<
  { bookingId: string },
  {
    trustTier: TrustTier;
    requiredSignals: { smsOtp: boolean; liveness: boolean; payIdMatch: boolean };
    signalsCleared: { smsOtp: boolean; liveness: boolean; payIdMatch: boolean };
    verificationStatus: 'pending' | 'cleared' | 'manual_review' | 'denied';
  }
>('getCustomerVerificationStatus');

// --- Performer onboarding ---

export type PerformerStatus =
  | 'awaiting_id' | 'awaiting_id_review' | 'awaiting_liveness'
  | 'awaiting_banking' | 'awaiting_penny_drop' | 'awaiting_portfolio'
  | 'awaiting_safety' | 'awaiting_contract' | 'awaiting_activation'
  | 'active' | 'rejected' | 'suspended';

export const performerApply = call<
  { stageName: string; legalName?: string; contactPhoneE164: string; contactEmail: string },
  { success: boolean; performerId: string; status: PerformerStatus }
>('performerApply');

export const performerRequestIdUploadUrl = call<
  { contentType: 'image/jpeg' | 'image/png' },
  { uploadUrl: string; storagePath: string; expiresInSeconds: number }
>('performerRequestIdUploadUrl');

export const performerNotifyIdUploaded = call<
  { storagePath: string },
  { success: boolean; queueId: string }
>('performerNotifyIdUploaded');

export const performerSubmitLiveness = call<
  { embedding: number[]; livenessScore: number; ageEstimate: number },
  { success: boolean }
>('performerSubmitLiveness');

export const performerAddBankAccount = call<
  { bsb: string; accountNumber: string; accountName: string },
  { success: boolean }
>('performerAddBankAccount');

export const performerInitiatePennyDrop = call<
  Record<string, never>,
  { success: boolean; dropId: string; hint: string }
>('performerInitiatePennyDrop');

export const performerConfirmPennyDrop = call<
  { code: string },
  { success: boolean }
>('performerConfirmPennyDrop');

export const performerSubmitPortfolio = call<
  { photos: string[]; videoIntroUrl?: string; services: string[] },
  { success: boolean }
>('performerSubmitPortfolio');

export const performerAcknowledgeSafetyBriefing = call<
  { acknowledged: boolean },
  { success: boolean }
>('performerAcknowledgeSafetyBriefing');

export const performerSignContract = call<
  { signature: string },
  { success: boolean }
>('performerSignContract');

export type FlagReason =
  | 'no_show' | 'breached_no_touch' | 'intoxicated_aggressive'
  | 'refused_payment' | 'safety_concern' | 'other';

export const performerFlagCustomer = call<
  { bookingId: string; reason: FlagReason; notes?: string },
  { success: boolean }
>('performerFlagCustomer');

// --- Admin ---

export const adminGetIdImageReviewUrl = call<
  { queueId: string },
  { signedUrl: string; expiresInSeconds: number }
>('adminGetIdImageReviewUrl');

export const adminReviewId = call<
  {
    queueId: string;
    decision: {
      action: 'approve' | 'reject';
      nameMatches: boolean;
      photoMatches: boolean;
      documentType?: string;
      age18Plus: boolean;
      notes?: string;
    };
  },
  { success: boolean }
>('adminReviewId');

export const adminApproveBooking = call<
  { bookingId: string; notes?: string },
  { success: boolean }
>('adminApproveBooking');

export const adminDeclineBooking = call<
  { bookingId: string; addToDns?: boolean; dnsReason?: string; notes?: string },
  { success: boolean }
>('adminDeclineBooking');

export type DnsMatchType = 'phone_hash' | 'email_hash' | 'face_hash';
export type DnsSeverity = 'silent' | 'explicit';

export const adminAddDnsEntry = call<
  {
    matchType: DnsMatchType;
    value: string;
    reason: string;
    severity: DnsSeverity;
    expiresAt?: number;
    notes?: string;
  },
  { success: boolean; entryId: string }
>('adminAddDnsEntry');

export interface DnsEntry {
  id: string;
  matchType: DnsMatchType;
  value: string;
  reason: string;
  severity: DnsSeverity;
  notes: string | null;
  addedBy: string;
  addedAt: number | null;
  expiresAt: number | null;
  active: boolean;
  bookingId?: string;
}

export const adminListDnsEntries = call<
  { activeOnly?: boolean; limit?: number },
  { entries: DnsEntry[] }
>('adminListDnsEntries');

export const adminExpireDnsEntry = call<
  { entryId: string },
  { success: boolean }
>('adminExpireDnsEntry');

export const adminActivatePerformer = call<
  { performerId: string },
  { success: boolean }
>('adminActivatePerformer');
