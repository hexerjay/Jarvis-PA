import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { logger } from "../utils/logger";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export const advancedServices = {
  /**
   * Research Engine Module
   * Generates structured markdown reports.
   */
  async generateResearchReport(topic: string): Promise<string> {
    logger.info(`Generating research report for: ${topic}`);
    const prompt = `Conduct deep research on the following topic: "${topic}".
Output a structured Markdown report with the following sections:
# Overview
# Key Insights
# Opportunities
# Risks
# Recommendations`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
    });
    return response.text || "Failed to generate report.";
  },

  /**
   * Email Assistant Module
   * Drafts emails in various tones.
   */
  async draftEmail(context: string, tone: 'professional' | 'assertive' | 'friendly'): Promise<{ subject: string, body: string }> {
    logger.info(`Drafting email. Tone: ${tone}`);
    const prompt = `Draft an email based on this context: "${context}".
The tone MUST be ${tone}.
Return ONLY a JSON object with "subject" and "body" fields.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    return JSON.parse(response.text || '{"subject": "Error", "body": "Failed to draft"}');
  },

  /**
   * Data Analytics Module
   * Analyzes JSON/CSV data and returns insights.
   */
  async analyzeData(dataPayload: string): Promise<string> {
    logger.info(`Analyzing data payload.`);
    const prompt = `Analyze the following data and provide:
1. Summary
2. Key Metrics
3. Recommendations

Data:
${dataPayload}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
    });
    return response.text || "Failed to analyze data.";
  }
};
