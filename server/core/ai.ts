import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { config } from "../config";
import { logger } from "../utils/logger";
import { decisionEngine } from "../decision/engine";

export class CognitiveCore {
  private ai: GoogleGenAI;
  private modelName = "gemini-3.1-pro-preview";

  // We will dynamically build this from the DecisionEngine in Phase 2
  private tools: FunctionDeclaration[] = [
    {
      name: "manageTask",
      description: "Create, complete, or list tasks and to-dos.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: "The action to perform: 'create', 'complete', or 'list'" },
          title: { type: Type.STRING, description: "The title of the task" }
        },
        required: ["action"]
      }
    },
    {
      name: "executeDesktopCommand",
      description: "Execute a command on the user's local machine (e.g., run script, delete file).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          command: { type: Type.STRING, description: "The terminal command to run" }
        },
        required: ["command"]
      }
    }
  ];

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  private getSystemInstruction(): string {
    return `You are a highly capable, high-trust Personal Executive Assistant (Chief of Staff).
CORE PRINCIPLES:
1. REASONING FIRST: Before making any decision or calling a tool, briefly explain your reasoning to the user.
2. ASK BEFORE ACTING: If an action is destructive, modifies external state, or communicates with others, you MUST use the appropriate tool, which will automatically ask the user for confirmation.
3. BE CONCISE: You operate via Telegram. Keep responses highly readable, using markdown for structure.`;
  }

  async processMessage(text: string, userId: string): Promise<string> {
    try {
      logger.info(`Processing message for user ${userId}`);
      
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: text,
        config: {
          systemInstruction: this.getSystemInstruction(),
          tools: [{ functionDeclarations: this.tools }]
        }
      });

      // Handle Tool Calls via Decision Engine
      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        const decision = await decisionEngine.evaluateAndExecute(call, userId);
        return decision.text;
      }

      return response.text || "I have processed your request.";
    } catch (error) {
      logger.error("Cognitive Core Error:", error);
      throw error;
    }
  }
}

export const cognitiveCore = new CognitiveCore();
