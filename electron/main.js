const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

let mainWindow;
let bot;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Handle permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(true); // Allow other permissions for local app
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'media') {
      return true;
    }
    return true; // Allow other permissions for local app
  });

  // In development, load the Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // Initialize Telegram Bot if token exists
  if (process.env.TELEGRAM_BOT_TOKEN) {
    initTelegramBot();
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers for Desktop Commands ---
const fs = require('fs').promises;
const logFilePath = path.join(app.getPath('userData'), 'file_operations_log.json');
const dbFilePath = path.join(app.getPath('userData'), 'scanned_files_db.json');
const permissionsFilePath = path.join(app.getPath('userData'), 'folder_permissions.json');

async function getPermissions() {
  try {
    const data = await fs.readFile(permissionsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function savePermissions(perms) {
  await fs.writeFile(permissionsFilePath, JSON.stringify(perms, null, 2));
}

async function writeLog(entry) {
  try {
    let logs = [];
    try {
      const data = await fs.readFile(logFilePath, 'utf8');
      logs = JSON.parse(data);
    } catch (e) { /* ignore if file doesn't exist yet */ }
    logs.unshift({ ...entry, timestamp: new Date().toISOString() });
    await fs.writeFile(logFilePath, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

async function walkDir(dir, fileList = []) {
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (file.isDirectory()) {
        await walkDir(filePath, fileList);
      } else {
        try {
          const stats = await fs.stat(filePath);
          fileList.push({
            name: file.name,
            path: filePath,
            size: stats.size,
            extension: path.extname(file.name).toLowerCase(),
            lastModified: stats.mtime.toISOString(),
            scannedAt: new Date().toISOString()
          });
        } catch (e) {
          // Skip files we don't have permission to read stats for
        }
      }
    }
  } catch (e) {
    // Skip directories we don't have permission to read
  }
  return fileList;
}

ipcMain.handle('desktop:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder to Scan and Index'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('desktop:scan-folder', async (event, folderPath) => {
  try {
    const files = await walkDir(folderPath);
    
    // Load existing db
    let db = [];
    try {
      const data = await fs.readFile(dbFilePath, 'utf8');
      db = JSON.parse(data);
    } catch (e) {}

    // Merge, updating existing paths
    const existingPaths = new Map(db.map(f => [f.path, f]));
    for (const file of files) {
      existingPaths.set(file.path, file);
    }
    db = Array.from(existingPaths.values());

    await fs.writeFile(dbFilePath, JSON.stringify(db, null, 2));

    // Update permissions
    const perms = await getPermissions();
    if (!perms.find(p => p.path === folderPath)) {
      perms.push({ path: folderPath, grantedAt: new Date().toISOString() });
      await savePermissions(perms);
    }

    await writeLog({ action: 'SCAN_FOLDER', source: folderPath, status: 'SUCCESS', details: `Indexed ${files.length} files` });
    return { success: true, count: files.length };
  } catch (error) {
    await writeLog({ action: 'SCAN_FOLDER', source: folderPath, status: 'FAILED', error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('desktop:get-permissions', async () => {
  return await getPermissions();
});

ipcMain.handle('desktop:remove-permission', async (event, folderPath) => {
  const perms = await getPermissions();
  const newPerms = perms.filter(p => p.path !== folderPath);
  await savePermissions(newPerms);
  
  // Also remove from DB
  try {
    let db = [];
    try {
      const data = await fs.readFile(dbFilePath, 'utf8');
      db = JSON.parse(data);
    } catch (e) {}
    db = db.filter(f => !f.path.startsWith(folderPath));
    await fs.writeFile(dbFilePath, JSON.stringify(db, null, 2));
  } catch(e) {}

  await writeLog({ action: 'REMOVE_PERMISSION', source: folderPath, status: 'SUCCESS' });
  return { success: true };
});

ipcMain.handle('desktop:save-file', async (event, { name, data, folder }) => {
  try {
    // data is base64 string
    const buffer = Buffer.from(data, 'base64');
    const targetFolder = folder || app.getPath('downloads');
    const targetPath = path.join(targetFolder, name);
    await fs.writeFile(targetPath, buffer);
    await writeLog({ action: 'SAVE_FILE', source: 'Chat', destination: targetPath, status: 'SUCCESS' });
    return { success: true, path: targetPath };
  } catch (error) {
    await writeLog({ action: 'SAVE_FILE', source: 'Chat', destination: name, status: 'FAILED', error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('desktop:get-scanned-files', async () => {
  try {
    const data = await fs.readFile(dbFilePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('desktop:get-logs', async () => {
  try {
    const data = await fs.readFile(logFilePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('desktop:open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    await writeLog({ action: 'OPEN', source: filePath, status: 'SUCCESS' });
    return { success: true };
  } catch (error) {
    await writeLog({ action: 'OPEN', source: filePath, status: 'FAILED', error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('desktop:open-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('desktop:move-file', async (event, source, destination) => {
  try {
    await fs.rename(source, destination);
    await writeLog({ action: 'MOVE', source, destination, status: 'SUCCESS' });
    return { success: true };
  } catch (error) {
    await writeLog({ action: 'MOVE', source, destination, status: 'FAILED', error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('desktop:show-item-in-folder', (event, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

// --- Telegram Bot Logic (Polling) ---
function initTelegramBot() {
  try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      if (!text) return;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: text,
          config: {
            systemInstruction: "You are an AI assistant running inside a desktop application. Keep answers concise."
          }
        });
        bot.sendMessage(chatId, response.text);
      } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "Error processing request.");
      }
    });
    console.log("Telegram bot started in polling mode.");
  } catch (e) {
    console.error("Failed to start Telegram bot:", e);
  }
}
