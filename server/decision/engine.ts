import { FunctionCall } from "@google/genai";
import { logger } from "../utils/logger";

export enum ActionRiskLevel {
  LOW = "low",       // Safe to execute automatically (e.g., listing tasks, reading weather)
  MEDIUM = "medium", // Modifies non-critical state (e.g., creating a draft, adding a task)
  HIGH = "high"      // Destructive or external actions (e.g., sending email, deleting files, executing scripts)
}

export interface ToolDefinition {
  name: string;
  riskLevel: ActionRiskLevel;
  execute: (args: any, userId: string) => Promise<string>;
}

export class DecisionEngine {
  private tools: Map<string, ToolDefinition> = new Map();

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
    logger.info(`Registered tool: ${tool.name} [Risk: ${tool.riskLevel}]`);
  }

  async evaluateAndExecute(call: FunctionCall, userId: string): Promise<{ text: string, requiresConfirmation: boolean }> {
    const tool = this.tools.get(call.name);
    
    if (!tool) {
      logger.warn(`AI attempted to call unknown tool: ${call.name}`);
      return { text: `Error: Tool ${call.name} is not recognized.`, requiresConfirmation: false };
    }

    const args = call.args as any;

    // ASK BEFORE ACTING LOGIC
    if (tool.riskLevel === ActionRiskLevel.HIGH) {
      logger.info(`High risk action intercepted: ${call.name}`, args);
      // In Phase 2, we will store this pending action in Firestore and wait for user approval.
      return { 
        text: `\u26a0\ufe0f **Confirmation Required**\nI am about to execute \`${call.name}\` with parameters:\n\`${JSON.stringify(args, null, 2)}\`\n\nDo you approve this action? (Reply YES or NO)`, 
        requiresConfirmation: true 
      };
    }

    // Execute Low/Medium risk actions immediately
    try {
      logger.debug(`Executing tool: ${call.name}`, args);
      const result = await tool.execute(args, userId);
      return { text: result, requiresConfirmation: false };
    } catch (error) {
      logger.error(`Tool execution failed: ${call.name}`, error);
      return { text: `Failed to execute ${call.name}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`, requiresConfirmation: false };
    }
  }
}

export const decisionEngine = new DecisionEngine();
