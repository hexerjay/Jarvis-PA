import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config";
import { logger } from "../utils/logger";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export interface AIResponse {
  intent: string;
  reasoning: string;
  action: string;
  confidence: number;
  parameters: Record<string, any>;
}

export const aiService = {
  /**
   * Process user input with context and return a structured decision
   */
  async processUserInput(input: string, context: any[]): Promise<AIResponse> {
    const systemPrompt = `You are a high-trust AI Chief of Staff.
Analyze the user input and determine the intent, reasoning, and required action.

Available Actions:
- 'chat': General conversation or answering questions.
- 'manage_task': Creating or updating a to-do list item.
- 'execute_command': Running a local desktop script or opening a file.
- 'research': Generating a research report on a topic.
- 'draft_email': Drafting an email response.
- 'analyze_data': Analyzing trends from data.

You MUST return a JSON object matching the schema. Provide clear reasoning before selecting the action.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          { 
            role: "user", 
            parts: [{ text: `Context: ${JSON.stringify(context)}\n\nUser Input: ${input}` }] 
          }
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING, description: "The user's core intent" },
              reasoning: { type: Type.STRING, description: "Step-by-step reasoning for the chosen action" },
              action: { type: Type.STRING, description: "The action to take (e.g., chat, manage_task, execute_command)" },
              confidence: { type: Type.NUMBER, description: "Confidence score between 0 and 1" },
              parameters: { 
                type: Type.OBJECT, 
                description: "Action-specific parameters (e.g., { title: 'Buy milk' } for manage_task, or { command: 'open report.pdf' } for execute_command)" 
              }
            },
            required: ["intent", "reasoning", "action", "confidence"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty AI response");
      
      const parsed: AIResponse = JSON.parse(text);
      logger.info("AI Processed Input", { action: parsed.action, confidence: parsed.confidence });
      return parsed;

    } catch (error) {
      logger.error("AI Service Error", error);
      throw error;
    }
  }
};
