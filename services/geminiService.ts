
import { functions } from './firebaseClient';
import { httpsCallable } from 'firebase/functions';

/**
 * Analyzes booking data for automated vetting suggestions.
 */
export async function analyzeVettingRisk(bookingDetails: any) {
  if (!functions) {
    console.warn("Firebase Functions not initialized. Skipping risk analysis.");
    return null;
  }
  try {
    const analyzeFn = httpsCallable(functions, 'analyzeVettingRisk');
    const result = await analyzeFn({ bookingDetails });
    return result.data;
  } catch (error) {
    console.error("Gemini Vetting Error:", error);
    return null;
  }
}
