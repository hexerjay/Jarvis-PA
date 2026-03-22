import React, { useState, useEffect, useRef } from 'react';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { GoogleGenAI, Modality } from '@google/genai';
import { Bot, CheckSquare, Command, Settings, Send, Mic, LogOut, Loader2, Play } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks' | 'desktop' | 'settings'>('chat');

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
  const [action, setAction] = useState('open_file');

  useEffect(() => {
    const q = query(collection(db, 'desktop_commands'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCommands(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user.uid]);

  const queueCommand = async () => {
    if (!cmd.trim()) return;
    await addDoc(collection(db, 'desktop_commands'), {
      command: cmd.trim(),
      action: action,
      status: 'pending',
      createdAt: new Date().toISOString(),
      userId: user.uid
    });
    setCmd('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
        <h2 className="text-xl font-semibold">Desktop Commands</h2>
        <p className="text-sm text-zinc-500">Queue commands for your local companion script</p>
      </div>
      <div className="p-6 max-w-4xl w-full mx-auto">
        
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-8">
          <h3 className="text-emerald-400 font-medium mb-2 flex items-center gap-2">
            <Command className="w-4 h-4" /> How this works
          </h3>
          <p className="text-sm text-emerald-500/80 leading-relaxed">
            Because this web app runs in a secure cloud sandbox, it cannot directly access your computer's files. 
            To execute these commands, you need to run a small Python or Node.js script on your local machine that listens to this Firestore collection and executes the pending commands.
          </p>
        </div>

        <div className="flex gap-2 mb-8">
          <select 
            value={action} 
            onChange={(e) => setAction(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
          >
            <option value="open_file">Open File</option>
            <option value="bookmark">Open Bookmark</option>
            <option value="run_script">Run Script</option>
          </select>
          <input
            type="text"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && queueCommand()}
            placeholder="e.g., C:\Documents\report.pdf or https://github.com"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
          />
          <button onClick={queueCommand} className="bg-emerald-600 hover:bg-emerald-500 px-6 rounded-xl text-sm font-medium transition-colors">
            Queue
          </button>
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
            The Telegram bot runs on the backend server. To enable it, you must add your <code>TELEGRAM_BOT_TOKEN</code> to the environment variables in AI Studio.
          </p>
          <ol className="list-decimal list-inside text-sm text-zinc-500 space-y-2">
            <li>Go to Telegram and search for <strong>BotFather</strong></li>
            <li>Create a new bot and copy the API Token</li>
            <li>Open the Secrets panel in AI Studio</li>
            <li>Add a new secret named <code>TELEGRAM_BOT_TOKEN</code> with your token</li>
            <li>Restart the dev server</li>
          </ol>
        </div>

      </div>
    </div>
  );
}
