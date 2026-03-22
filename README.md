# Executive Assistant - Desktop App

This is a plug-and-play Desktop AI Assistant built with React, Vite, Electron, and Gemini AI.

## How to Run the Desktop App

1. **Download the Code:**
   If you are in AI Studio, click the **Settings** gear icon in the top right, then click **Export to ZIP** or **Export to GitHub**.

2. **Install Dependencies:**
   Open a terminal in the downloaded folder and run:
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory and add your API keys:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key
   GEMINI_API_KEY=your_gemini_api_key
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   ```

4. **Start the App (Development Mode):**
   ```bash
   npm run electron:start
   ```

5. **Build the Executable (Production):**
   To create a standalone `.exe` (Windows), `.app` (Mac), or `.AppImage` (Linux), run:
   ```bash
   npm run electron:build
   ```
   The built application will be located in the `release/` folder.

## Features
- **Desktop Commands:** Open files and URLs directly from the app.
- **Telegram Bot:** The Telegram bot runs natively inside the desktop app using polling. No webhooks or cloud servers required!
- **AI Chat:** Powered by Gemini 3.1 Pro.
- **Tasks:** Manage your to-dos.
