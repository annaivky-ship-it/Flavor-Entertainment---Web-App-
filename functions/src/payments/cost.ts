import { getFirestore } from 'firebase-admin/firestore';

export const DEPOSIT_PERCENTAGE = 0.25;
export const TRAVEL_FEE_THRESHOLD_KM = 50;
export const TRAVEL_FEE_RATE_PER_KM = 1;

// Mirrors data/suburbs.ts. Kept inline so the function can compute fees without
// reaching back into the frontend package.
const SUBURB_DISTANCES_KM: Record<string, number> = {
  'Perth CBD': 0, 'Northbridge': 1, 'East Perth': 2, 'West Perth': 2,
  'South Perth': 3, 'Subiaco': 4, 'Leederville': 3, 'Mount Lawley': 4,
  'Victoria Park': 5, 'Claremont': 9, 'Cottesloe': 11, 'Fremantle': 19,
  'Scarborough': 12, 'Innaloo': 9, 'Osborne Park': 8, 'Morley': 10,
  'Bayswater': 8, 'Cannington': 12, 'Rivervale': 6, 'Belmont': 7,
  'Como': 6, 'Applecross': 8, 'Melville': 11, 'Nedlands': 6,
  'Dalkeith': 7, 'Karrinyup': 11, 'Joondalup': 26, 'Wanneroo': 25,
  'Hillarys': 22, 'Duncraig': 17, 'Warwick': 15, 'Midland': 18,
  'Kalamunda': 24, 'Mundaring': 30, 'Armadale': 28, 'Gosnells': 20,
  'Canning Vale': 18, 'Cockburn': 22, 'Success': 25, 'Ellenbrook': 28,
  'Swan View': 22, 'Rockingham': 40, 'Baldivis': 42, 'Yanchep': 48,
  'Two Rocks': 50, 'Byford': 38, 'Serpentine': 45, 'Bullsbrook': 35,
  'Gingin': 50, 'Mandurah': 72, 'Pinjarra': 86, 'Bunbury': 175,
  'Busselton': 220, 'Margaret River': 270, 'Geraldton': 420, 'Kalgoorlie': 595,
  'Northam': 97, 'York': 97, 'Toodyay': 85, 'Lancelin': 105,
  'Jurien Bay': 220, 'Dunsborough': 250, 'Collie': 160, 'Harvey': 140,
};

export interface ServiceDoc {
  id: string;
  rate: number;
  rate_type: 'per_hour' | 'flat';
  min_duration_hours?: number;
}

export interface BookingCost {
  totalAmount: number;
  depositAmount: number;
  travelFee: number;
}

export const calculateTravelFee = (distanceKm: number): number => {
  if (distanceKm <= TRAVEL_FEE_THRESHOLD_KM) return 0;
  return (distanceKm - TRAVEL_FEE_THRESHOLD_KM) * TRAVEL_FEE_RATE_PER_KM;
};

export const getSuburbDistance = (suburbName?: string | null): number | null => {
  if (!suburbName) return null;
  const d = SUBURB_DISTANCES_KM[suburbName];
  return typeof d === 'number' ? d : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Look up service rate definitions from Firestore. Throws if any requested
 * service is missing — the caller should treat that as an invalid booking.
 */
export async function loadServices(serviceIds: string[]): Promise<ServiceDoc[]> {
  if (!serviceIds || serviceIds.length === 0) return [];
  const db = getFirestore('default');
  const snaps = await Promise.all(
    serviceIds.map((id) => db.collection('services').doc(id).get())
  );
  const out: ServiceDoc[] = [];
  for (const snap of snaps) {
    if (!snap.exists) {
      throw new Error(`Unknown service id: ${snap.id}`);
    }
    const data = snap.data() as any;
    out.push({
      id: snap.id,
      rate: Number(data.rate) || 0,
      rate_type: data.rate_type === 'flat' ? 'flat' : 'per_hour',
      min_duration_hours: data.min_duration_hours,
    });
  }
  return out;
}

/**
 * Server-side mirror of utils/bookingUtils.ts:calculateBookingCost. The client
 * shows a preview, but this is the value that gets persisted and matched
 * against the Monoova webhook.
 */
export function calculateBookingCost(
  durationHours: number,
  services: ServiceDoc[],
  numPerformers: number,
  suburbName?: string | null
): BookingCost {
  if (!services.length || numPerformers <= 0) {
    return { totalAmount: 0, depositAmount: 0, travelFee: 0 };
  }

  const duration = durationHours || 0;
  let hourly = 0;
  let flat = 0;

  for (const svc of services) {
    if (svc.rate_type === 'flat') {
      flat += svc.rate;
    } else {
      const hours = Math.max(duration, svc.min_duration_hours || 0);
      hourly += svc.rate * hours;
    }
  }

  const distance = getSuburbDistance(suburbName);
  const travelFee = distance !== null ? calculateTravelFee(distance) : 0;
  const total = hourly * numPerformers + flat + travelFee;

  return {
    totalAmount: round2(total),
    depositAmount: round2(total * DEPOSIT_PERCENTAGE),
    travelFee: round2(travelFee),
  };
}
