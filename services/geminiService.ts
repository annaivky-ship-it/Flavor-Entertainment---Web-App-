
// Fix: Implement Google GenAI using correct SDK patterns and models.
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Generates a professional response for customer support.
 */
export async function getGeminiSupportResponse(prompt: string, context: string = "") {
  try {
    // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: context ? `Context: ${context}\n\nClient Message: ${prompt}` : prompt,
      config: {
        systemInstruction: "You are a professional assistant for Flavor Entertainers. Provide helpful, polite, and discreet responses regarding booking inquiries and performer details.",
      },
    });

    // Fix: Access .text property directly instead of calling it as a method.
    return response.text;
  } catch (error) {
    console.error("Gemini Support Error:", error);
    return "I'm sorry, I'm unable to assist right now. Please contact our support team directly.";
  }
}

/**
 * Analyzes booking data for automated vetting suggestions.
 */
export async function analyzeVettingRisk(bookingDetails: any) {
  try {
    // Fix: Create a new GoogleGenAI instance right before making an API call.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // Fix: Upgrade to 'gemini-3-pro-preview' for complex reasoning tasks like risk assessment.
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Evaluate this booking request for risk assessment:\n${JSON.stringify(bookingDetails)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskLevel: { type: Type.STRING, description: "Low, Medium, or High risk level" },
            reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
            vettedStatusRecommendation: { type: Type.STRING },
            notes: { type: Type.STRING }
          },
          propertyOrdering: ["riskLevel", "reasons", "vettedStatusRecommendation", "notes"],
          required: ["riskLevel", "reasons", "vettedStatusRecommendation"],
        },
      },
    });

    // Fix: Use .text property directly as per latest SDK guidelines.
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini Vetting Error:", error);
    return null;
  }
}
