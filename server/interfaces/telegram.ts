import TelegramBot from "node-telegram-bot-api";
import { config } from "../config";
import { logger } from "../utils/logger";
import { cognitiveCore } from "../core/ai";

export class TelegramInterface {
  private bot: TelegramBot | null = null;

  constructor() {
    if (!config.telegramBotToken || config.telegramBotToken === "YOUR_TELEGRAM_BOT_TOKEN") {
      logger.warn("Telegram bot token not configured. Interface disabled.");
      return;
    }

    this.bot = new TelegramBot(config.telegramBotToken, { polling: true });
    this.initializeRoutes();
    logger.info("Telegram Interface initialized and polling.");
  }

  private initializeRoutes() {
    if (!this.bot) return;

    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const userId = chatId.toString(); // In Phase 2, map this to Firestore UID

      if (!text) return;

      if (text === "/start") {
        this.bot?.sendMessage(chatId, "Hello! I am your AI Chief of Staff. My systems are currently initializing. Your Chat ID is: " + chatId);
        return;
      }

      this.bot?.sendChatAction(chatId, "typing");

      try {
        const reply = await cognitiveCore.processMessage(text, userId);
        this.bot?.sendMessage(chatId, reply, { parse_mode: "Markdown" });
      } catch (error) {
        this.bot?.sendMessage(chatId, "\u26a0\ufe0f System Error: Unable to process request at this time.");
      }
    });
  }
}

export const initTelegram = () => new TelegramInterface();
