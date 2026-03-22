import React, { useState, useEffect, useRef } from 'react';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { GoogleGenAI, Modality } from '@google/genai';
import { Bot, CheckSquare, Command, Settings, Send, Mic, LogOut, Loader2, Play, Monitor, FileText, FolderOpen, Database, Search } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      openFile: (path: string) => Promise<{success: boolean, error?: string}>;
      openUrl: (url: string) => Promise<{success: boolean, error?: string}>;
      moveFile: (source: string, dest: string) => Promise<{success: boolean, error?: string}>;
      getLogs: () => Promise<any[]>;
      showItemInFolder: (path: string) => Promise<{success: boolean, error?: string}>;
      selectFolder: () => Promise<string | null>;
      scanFolder: (path: string) => Promise<{success: boolean, count?: number, error?: string}>;
      getScannedFiles: () => Promise<any[]>;
    }
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks' | 'desktop' | 'settings' | 'logs' | 'database'>('chat');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-4">
        <div className="max-w-md w-full bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-xl text-center">
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Executive Assistant</h1>
          <p className="text-zinc-400 mb-8">Sign in to access your personal AI assistant, manage tasks, and connect your desktop.</p>
          <button
            onClick={loginWithGoogle}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-xl transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-zinc-800">
          <div className="w-10 h-10 bg-emerald-500/20 text-emerald-500 rounded-xl flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Assistant</h2>
            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <NavItem icon={<Bot />} label="Chat" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
          <NavItem icon={<CheckSquare />} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
          <NavItem icon={<Command />} label="Desktop" active={activeTab === 'desktop'} onClick={() => setActiveTab('desktop')} />
          <NavItem icon={<Database />} label="File Database" active={activeTab === 'database'} onClick={() => setActiveTab('database')} />
          <NavItem icon={<FileText />} label="File Logs" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
          <NavItem icon={<Settings />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>
        
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 text-zinc-400 hover:text-zinc-100 w-full p-2 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {activeTab === 'chat' && <ChatView user={user} />}
        {activeTab === 'tasks' && <TasksView user={user} />}
        {activeTab === 'desktop' && <DesktopView user={user} />}
        {activeTab === 'database' && <FileDatabaseView user={user} />}
        {activeTab === 'logs' && <FileLogsView user={user} />}
        {activeTab === 'settings' && <SettingsView user={user} />}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors ${
        active ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100'
      }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

// --- Views ---

function ChatView({ user }: { user: User }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'messages'), where('userId', '==', user.uid), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput('');
    
    // 1. Save user message
    await addDoc(collection(db, 'messages'), {
      text: userText,
      sender: 'user',
      source: 'web',
      timestamp: new Date().toISOString(),
      userId: user.uid
    });

    setIsTyping(true);

    try {
      // 2. Call Gemini
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: userText,
        config: {
          systemInstruction: `You are an executive assistant. The user's ID is ${user.uid}. 
          If they ask you to create a task, you can say "I will create a task for that" (in a real app we'd use function calling).
          If they ask to open a file or bookmark, say "I will queue a desktop command for that".`
        }
      });

      const reply = response.text || "I'm not sure how to respond.";

      // 3. Save assistant message
      await addDoc(collection(db, 'messages'), {
        text: reply,
        sender: 'assistant',
        source: 'web',
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

    } catch (error) {
      console.error("Gemini Error:", error);
      await addDoc(collection(db, 'messages'), {
        text: "Sorry, I encountered an error processing that request.",
        sender: 'assistant',
        source: 'web',
        timestamp: new Date().toISOString(),
        userId: user.uid
      });
    } finally {
      setIsTyping(false);
    }
  };

  const playTTS = async (text: string) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
        },
      });
      
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/pcm;rate=24000;base64,${base64Audio}`);
        audio.play();
      }
    } catch (error) {
      console.error("TTS Error:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
        <h2 className="text-xl font-semibold">Assistant Chat</h2>
        <p className="text-sm text-zinc-500">Talk to your AI executive assistant</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 mt-10">
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-2xl p-4 ${
              msg.sender === 'user' 
                ? 'bg-emerald-600 text-white rounded-br-none' 
                : 'bg-zinc-800 text-zinc-100 rounded-bl-none'
            }`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
              {msg.sender === 'assistant' && (
                <button 
                  onClick={() => playTTS(msg.text)}
                  className="mt-2 text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1 text-xs"
                >
                  <Play className="w-3 h-3" /> Listen
                </button>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 text-zinc-400 rounded-2xl rounded-bl-none p-4 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Assistant is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask your assistant to do something..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TasksView({ user }: { user: User }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'tasks'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user.uid]);

  const addTask = async () => {
    if (!newTask.trim()) return;
    await addDoc(collection(db, 'tasks'), {
      title: newTask.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      userId: user.uid
    });
    setNewTask('');
  };

  const toggleTask = async (id: string, currentStatus: string) => {
    await updateDoc(doc(db, 'tasks', id), {
      status: currentStatus === 'pending' ? 'completed' : 'pending'
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <p className="text-sm text-zinc-500">Manage your to-dos</p>
      </div>
      <div className="p-6 max-w-3xl w-full mx-auto">
        <div className="flex gap-2 mb-8">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder="Add a new task..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
          />
          <button onClick={addTask} className="bg-zinc-800 hover:bg-zinc-700 px-6 rounded-xl text-sm font-medium transition-colors">
            Add
          </button>
        </div>

        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-4 p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-xl">
              <button 
                onClick={() => toggleTask(task.id, task.status)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600 hover:border-emerald-500'
                }`}
              >
                {task.status === 'completed' && <CheckSquare className="w-3 h-3 text-zinc-950" />}
              </button>
              <span className={`text-sm ${task.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                {task.title}
              </span>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-zinc-500 text-center py-10">No tasks yet.</p>}
        </div>
      </div>
    </div>
  );
}

function DesktopView({ user }: { user: User }) {
  const [commands, setCommands] = useState<any[]>([]);
  const [cmd, setCmd] = useState('');
  const [destCmd, setDestCmd] = useState('');
  const [action, setAction] = useState('open_file');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, source: string, dest: string} | null>(null);
  const isDesktop = !!window.electronAPI;

  useEffect(() => {
    if (isDesktop) return; // Don't sync from Firestore if running locally
    const q = query(collection(db, 'desktop_commands'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCommands(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user.uid, isDesktop]);

  const handleActionSubmit = () => {
    if (!cmd.trim()) return;
    if (action === 'move_file' && isDesktop) {
      if (!destCmd.trim()) return;
      setConfirmModal({ isOpen: true, source: cmd.trim(), dest: destCmd.trim() });
    } else {
      queueCommand(cmd.trim(), action);
    }
  };

  const confirmMove = async () => {
    if (!confirmModal) return;
    setConfirmModal(null);
    const { source, dest } = confirmModal;
    
    const result = await window.electronAPI!.moveFile(source, dest);
    setCommands([{
      id: Date.now().toString(),
      command: `Move: ${source} -> ${dest}`,
      action: 'move_file',
      status: result?.success ? 'executed' : 'failed',
      createdAt: new Date().toISOString()
    }, ...commands]);
    setCmd('');
    setDestCmd('');
  };

  const queueCommand = async (commandText: string, actionType: string) => {
    if (isDesktop) {
      let result;
      if (actionType === 'open_file') {
        result = await window.electronAPI!.openFile(commandText);
      } else if (actionType === 'bookmark') {
        result = await window.electronAPI!.openUrl(commandText);
      }

      setCommands([{
        id: Date.now().toString(),
        command: commandText,
        action: actionType,
        status: result?.success ? 'executed' : 'failed',
        createdAt: new Date().toISOString()
      }, ...commands]);

    } else {
      await addDoc(collection(db, 'desktop_commands'), {
        command: commandText,
        action: actionType,
        status: 'pending',
        createdAt: new Date().toISOString(),
        userId: user.uid
      });
    }
    setCmd('');
  };

  return (
    <div className="flex flex-col h-full relative">
      {confirmModal && confirmModal.isOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-semibold mb-2 text-red-400">Permission Required</h3>
            <p className="text-sm text-zinc-300 mb-4">
              Are you sure you want to move/rename this file?
            </p>
            <div className="bg-zinc-950 p-3 rounded-lg text-xs font-mono text-zinc-400 mb-6 break-all">
              <div className="mb-1"><span className="text-zinc-500">From:</span> {confirmModal.source}</div>
              <div><span className="text-zinc-500">To:</span> {confirmModal.dest}</div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={confirmMove} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium transition-colors">Allow & Move</button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
        <h2 className="text-xl font-semibold">Desktop Commands</h2>
        <p className="text-sm text-zinc-500">Execute commands directly on your local machine</p>
      </div>
      <div className="p-6 max-w-4xl w-full mx-auto">
        
        {isDesktop ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-8">
            <h3 className="text-emerald-400 font-medium mb-2 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Desktop Mode Active
            </h3>
            <p className="text-sm text-emerald-500/80 leading-relaxed">
              You are running the native desktop app! Commands will execute instantly on your machine. No Python script required.
            </p>
          </div>
        ) : (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-8">
            <h3 className="text-blue-400 font-medium mb-2 flex items-center gap-2">
              <Command className="w-4 h-4" /> Web Preview Mode
            </h3>
            <p className="text-sm text-blue-500/80 leading-relaxed">
              You are currently in the web preview. To get the plug-and-play desktop app, download this project and run the Electron build.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 mb-8">
          <div className="flex gap-2">
            <select 
              value={action} 
              onChange={(e) => setAction(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
            >
              <option value="open_file">Open File</option>
              <option value="bookmark">Open Bookmark</option>
              {isDesktop && <option value="move_file">Move/Rename File</option>}
              <option value="run_script">Run Script</option>
            </select>
            <input
              type="text"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleActionSubmit()}
              placeholder={action === 'move_file' ? "Source file path..." : "e.g., C:\\Documents\\report.pdf or https://github.com"}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
            />
            <button onClick={handleActionSubmit} className="bg-emerald-600 hover:bg-emerald-500 px-6 rounded-xl text-sm font-medium transition-colors">
              Queue
            </button>
          </div>
          {action === 'move_file' && isDesktop && (
            <div className="flex gap-2">
              <div className="w-[140px]"></div>
              <input
                type="text"
                value={destCmd}
                onChange={(e) => setDestCmd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleActionSubmit()}
                placeholder="Destination file path..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
              />
              <div className="w-[88px]"></div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {commands.map(c => (
            <div key={c.id} className="p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 uppercase">{c.action}</span>
                  <span className="text-sm font-medium text-zinc-200">{c.command}</span>
                </div>
                <div className="text-xs text-zinc-500">{new Date(c.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  c.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                  c.status === 'executed' ? 'bg-emerald-500/10 text-emerald-500' :
                  'bg-red-500/10 text-red-500'
                }`}>
                  {c.status}
                </span>
              </div>
            </div>
          ))}
          {commands.length === 0 && <p className="text-zinc-500 text-center py-10">No commands queued.</p>}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ user }: { user: User }) {
  const [chatId, setChatId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data().telegramChatId) {
        setChatId(snap.data().telegramChatId.toString());
      }
    };
    fetchUser();
  }, [user.uid]);

  const saveSettings = async () => {
    await updateDoc(doc(db, 'users', user.uid), {
      telegramChatId: parseInt(chatId) || null
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-zinc-500">Configure your assistant</p>
      </div>
      <div className="p-6 max-w-2xl w-full mx-auto space-y-8">
        
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6">
          <h3 className="text-lg font-medium mb-4">Telegram Integration</h3>
          <p className="text-sm text-zinc-400 mb-6">
            To use the Telegram bot, you need to provide your Telegram Chat ID. 
            Message your bot on Telegram with <code>/start</code> and it will reply with your Chat ID.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Telegram Chat ID</label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="e.g., 123456789"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <button 
              onClick={saveSettings}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
            >
              {saved ? <><CheckSquare className="w-4 h-4 text-emerald-500" /> Saved</> : 'Save Settings'}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6">
          <h3 className="text-lg font-medium mb-4">Server Configuration</h3>
          <p className="text-sm text-zinc-400 mb-4">
            The Telegram bot runs natively inside the Desktop App. To enable it, you must add your <code>TELEGRAM_BOT_TOKEN</code> to your local <code>.env</code> file.
          </p>
          <ol className="list-decimal list-inside text-sm text-zinc-500 space-y-2">
            <li>Go to Telegram and search for <strong>BotFather</strong></li>
            <li>Create a new bot and copy the API Token</li>
            <li>Open the <code>.env</code> file in your downloaded project folder</li>
            <li>Add <code>TELEGRAM_BOT_TOKEN=your_token_here</code></li>
            <li>Restart the desktop app</li>
          </ol>
        </div>

      </div>
    </div>
  );
}

function FileLogsView({ user }: { user: User }) {
  const [logs, setLogs] = useState<any[]>([]);
  const isDesktop = !!window.electronAPI;

  useEffect(() => {
    if (isDesktop) {
      window.electronAPI!.getLogs().then(setLogs);
    }
  }, [isDesktop]);

  const handleOpenFile = async (path: string) => {
    if (isDesktop) {
      await window.electronAPI!.openFile(path);
      window.electronAPI!.getLogs().then(setLogs);
    }
  };

  const handleOpenFolder = async (path: string) => {
    if (isDesktop) {
      await window.electronAPI!.showItemInFolder(path);
    }
  };

  if (!isDesktop) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <FileText className="w-12 h-12 text-zinc-700 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Desktop Only Feature</h2>
        <p className="text-zinc-500 max-w-md">File logging and management is only available when running the native Electron desktop application.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">File Operations Log</h2>
          <p className="text-sm text-zinc-500">History of files accessed, scanned, and modified</p>
        </div>
        <button onClick={() => window.electronAPI!.getLogs().then(setLogs)} className="text-sm bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-3">
          {logs.map((log, i) => (
            <div key={i} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    log.action === 'MOVE' ? 'bg-purple-500/10 text-purple-400' : 
                    log.action === 'SCAN_FOLDER' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-blue-500/10 text-blue-400'
                  }`}>
                    {log.action}
                  </span>
                  <span className={`text-xs ${log.status === 'SUCCESS' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {log.status}
                  </span>
                  <span className="text-xs text-zinc-500">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-sm text-zinc-300 truncate font-mono" title={log.source}>
                  {log.source}
                </div>
                {log.destination && (
                  <div className="text-sm text-zinc-400 truncate font-mono mt-1" title={log.destination}>
                    <span className="text-zinc-600">→</span> {log.destination}
                  </div>
                )}
                {log.details && (
                  <div className="text-xs text-amber-400 mt-1">{log.details}</div>
                )}
                {log.error && (
                  <div className="text-xs text-red-400 mt-1">{log.error}</div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={() => handleOpenFolder(log.destination || log.source)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
                  title="Show in Folder"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Folder
                </button>
                {log.action !== 'SCAN_FOLDER' && (
                  <button 
                    onClick={() => handleOpenFile(log.destination || log.source)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-xs font-medium transition-colors"
                    title="Open File"
                  >
                    <FileText className="w-3.5 h-3.5" /> Open
                  </button>
                )}
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-center text-zinc-500 py-10">No file operations logged yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileDatabaseView({ user }: { user: User }) {
  const [files, setFiles] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [search, setSearch] = useState('');
  const isDesktop = !!window.electronAPI;

  const loadFiles = async () => {
    if (isDesktop) {
      const data = await window.electronAPI!.getScannedFiles();
      setFiles(data);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [isDesktop]);

  const handleScan = async () => {
    if (!isDesktop) return;
    const folder = await window.electronAPI!.selectFolder();
    if (!folder) return;

    setIsScanning(true);
    const result = await window.electronAPI!.scanFolder(folder);
    setIsScanning(false);

    if (result.success) {
      loadFiles();
    } else {
      alert('Scan failed: ' + result.error);
    }
  };

  const handleOpenFile = async (path: string) => {
    if (isDesktop) {
      await window.electronAPI!.openFile(path);
    }
  };

  const handleOpenFolder = async (path: string) => {
    if (isDesktop) {
      await window.electronAPI!.showItemInFolder(path);
    }
  };

  if (!isDesktop) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Database className="w-12 h-12 text-zinc-700 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Desktop Only Feature</h2>
        <p className="text-zinc-500 max-w-md">The local file database is only available when running the native Electron desktop application.</p>
      </div>
    );
  }

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) || 
    f.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Local File Database</h2>
          <p className="text-sm text-zinc-500">Scan folders to index and search your local files</p>
        </div>
        <button 
          onClick={handleScan} 
          disabled={isScanning}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
          {isScanning ? 'Scanning...' : 'Scan New Folder'}
        </button>
      </div>
      
      <div className="p-6 border-b border-zinc-800/50 bg-zinc-900/10">
        <div className="relative max-w-2xl">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search indexed files by name or path..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-medium text-zinc-500 mb-4 uppercase tracking-wider">
            {filteredFiles.length} Indexed Files
          </div>
          
          <div className="space-y-2">
            {filteredFiles.map((file, i) => (
              <div key={i} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3 flex items-center justify-between gap-4 hover:bg-zinc-800/50 transition-colors">
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-200 truncate">{file.name}</div>
                    <div className="text-xs text-zinc-500 truncate font-mono mt-0.5" title={file.path}>{file.path}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-xs text-zinc-500 hidden md:block">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleOpenFolder(file.path)}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                      title="Show in Folder"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleOpenFile(file.path)}
                      className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors"
                      title="Open File"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredFiles.length === 0 && (
              <div className="text-center text-zinc-500 py-10">
                {search ? 'No files match your search.' : 'No files indexed yet. Click "Scan New Folder" to begin.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
