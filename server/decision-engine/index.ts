import { AIResponse } from '../ai';

export type RiskLevel = 'safe' | 'moderate' | 'critical';

export interface Decision {
  type: RiskLevel;
  requires_confirmation: boolean;
  message_to_user: string;
}

export const decisionEngine = {
  /**
   * Evaluates the AI output and determines the risk level and required confirmation.
   */
  evaluate(aiOutput: AIResponse): Decision {
    const { action, reasoning, parameters, confidence } = aiOutput;
    
    // Low confidence always requires confirmation
    if (confidence < 0.7) {
      return {
        type: 'moderate',
        requires_confirmation: true,
        message_to_user: `I'm not entirely sure, but I think you want to ${action}. Reasoning: ${reasoning}. Should I proceed? (Reply YES/NO)`
      };
    }

    // Safe Actions: Reading data, general chat
    if (['chat', 'read_data'].includes(action)) {
      return { 
        type: 'safe', 
        requires_confirmation: false, 
        message_to_user: reasoning 
      };
    }
    
    // Moderate Actions: Drafting content, researching, adding tasks
    if (['draft_email', 'research', 'analyze_data', 'manage_task'].includes(action)) {
      return { 
        type: 'moderate', 
        requires_confirmation: false, 
        message_to_user: `\u2705 **Action Executed:** ${action.replace('_', ' ')}\n*Reasoning:* ${reasoning}` 
      };
    }
    
    // Critical Actions: Sending emails, deleting files, executing system commands
    if (['send_email', 'delete_file', 'execute_command'].includes(action)) {
      return { 
        type: 'critical', 
        requires_confirmation: true, 
        message_to_user: `\u26a0\ufe0f **Confirmation Required**\n\n*Reasoning:* ${reasoning}\n*Action:* \`${action}\`\n*Parameters:* \`${JSON.stringify(parameters)}\`\n\nDo you approve this action? (Reply YES to proceed)` 
      };
    }

    // Default fallback
    return { 
      type: 'safe', 
      requires_confirmation: false, 
      message_to_user: "I processed your request but I'm not sure how to handle the action: " + action 
    };
  }
};
