import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { aiService } from '../ai';
import { decisionEngine } from '../decision-engine';
import { memoryService } from '../memory';
import { config } from '../config';

export const telegramController = {
  /**
   * Handle incoming Telegram Webhook updates
   */
  async handleWebhook(req: Request, res: Response) {
    // 1. Acknowledge Telegram immediately to prevent retries
    res.sendStatus(200);

    const message = req.body.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id.toString();
    const text = message.text;

    logger.info(`[Telegram] Received message from ${chatId}: ${text}`);

    try {
      // 2. Get Context from Memory
      const context = await memoryService.getRecentContext(chatId);
      
      // 3. Save User Message to Memory
      await memoryService.saveMessage(chatId, 'user', text);

      // 4. Process with AI
      const aiOutput = await aiService.processUserInput(text, context);
      
      // 5. Run Decision Engine
      const decision = decisionEngine.evaluate(aiOutput);

      let replyText = decision.message_to_user;

      // 6. Execute or Ask
      if (!decision.requires_confirmation) {
        // Execute safe/moderate action
        if (aiOutput.action === 'manage_task') {
           await memoryService.saveTask(chatId, aiOutput.parameters);
           replyText += "\n\n*(Task saved to database)*";
        }
        // Other actions (research, draft_email) would be routed to their respective services here
      } else {
        // Save pending decision to memory for later approval
        await memoryService.saveTask(chatId, { 
          type: 'pending_decision', 
          action: aiOutput.action,
          parameters: aiOutput.parameters 
        });
      }

      // 7. Respond to User
      await sendTelegramMessage(chatId, replyText);

      // 8. Save Assistant Message to Memory
      await memoryService.saveMessage(chatId, 'assistant', replyText);

    } catch (error) {
      logger.error("Webhook processing error", error);
      await sendTelegramMessage(chatId, "\u26a0\ufe0f An error occurred while processing your request.");
    }
  }
};

/**
 * Service function to send a message back via Telegram API
 */
async function sendTelegramMessage(chatId: string, text: string) {
  if (!config.telegramBotToken || config.telegramBotToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
    logger.warn("Telegram bot token not configured. Cannot send message.");
    return;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text, 
        parse_mode: 'Markdown' 
      })
    });
    
    if (!response.ok) {
      logger.error(`Telegram API error: ${response.statusText}`);
    }
  } catch (e) {
    logger.error("Failed to send telegram message", e);
  }
}
