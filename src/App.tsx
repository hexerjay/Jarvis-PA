import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Bot, CheckSquare, Command, Settings, Send, Mic, LogOut, Loader2, Play, Monitor, FileText, FolderOpen, Database, Search, Shield, Link, Paperclip, StopCircle } from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorDetails = this.state.error?.message || "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) {
          errorDetails = `Firestore Error: ${parsed.error} (Operation: ${parsed.operationType}, Path: ${parsed.path})`;
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
          <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6 max-w-2xl w-full">
            <h2 className="text-xl font-semibold text-red-400 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6" /> Application Error
            </h2>
            <p className="text-slate-300 mb-4">{errorDetails}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
      getPermissions: () => Promise<any[]>;
      removePermission: (path: string) => Promise<{success: boolean}>;
      saveFile: (name: string, data: string, folder?: string) => Promise<{success: boolean, path?: string, error?: string}>;
    }
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks' | 'desktop' | 'settings' | 'logs' | 'database' | 'admin' | 'integrations'>('chat');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4">
        <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl text-center">
          <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Executive Assistant</h1>
          <p className="text-slate-400 mb-8">Sign in to access your personal AI assistant, manage tasks, and connect your desktop.</p>
          <button
            onClick={loginWithGoogle}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-white font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-10 h-10 bg-blue-500/20 text-blue-500 rounded-xl flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Assistant</h2>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <NavItem icon={<Bot />} label="Chat" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
          <NavItem icon={<CheckSquare />} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
          <NavItem icon={<Command />} label="Desktop" active={activeTab === 'desktop'} onClick={() => setActiveTab('desktop')} />
          <NavItem icon={<Database />} label="File Database" active={activeTab === 'database'} onClick={() => setActiveTab('database')} />
          <NavItem icon={<FileText />} label="File Logs" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
          <NavItem icon={<Shield />} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />
          <NavItem icon={<Link />} label="Integrations" active={activeTab === 'integrations'} onClick={() => setActiveTab('integrations')} />
          <NavItem icon={<Settings />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 text-slate-400 hover:text-white w-full p-2 rounded-lg transition-colors"
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
        {activeTab === 'admin' && <AdminView user={user} />}
        {activeTab === 'integrations' && <IntegrationsView user={user} />}
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
        active ? 'bg-blue-500/10 text-blue-500' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
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
  const [attachment, setAttachment] = useState<{data: string, mimeType: string, name: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'messages'), where('userId', '==', user.uid), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAttachment({ data: base64, mimeType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAttachment({ data: base64, mimeType: 'audio/webm', name: 'VoiceNote.webm' });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !attachment) return;
    const userText = input.trim();
    const currentAttachment = attachment;
    setInput('');
    setAttachment(null);
    
    // 1. Save user message
    await addDoc(collection(db, 'messages'), {
      text: userText || (currentAttachment ? `[Attached: ${currentAttachment.name}]` : ''),
      hasAttachment: !!currentAttachment,
      attachmentName: currentAttachment?.name || null,
      sender: 'user',
      source: 'web',
      timestamp: new Date().toISOString(),
      userId: user.uid
    });

    setIsTyping(true);

    try {
      const parts: any[] = [];
      if (userText) parts.push({ text: userText });
      if (currentAttachment) {
        parts.push({
          inlineData: {
            data: currentAttachment.data,
            mimeType: currentAttachment.mimeType
          }
        });
      }

      const saveFileFunction: FunctionDeclaration = {
        name: "saveFile",
        description: "Save a file to the user's local machine. Use this when the user asks to store or save a file.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "The name of the file to save." },
            folder: { type: Type.STRING, description: "Optional folder path to save the file in." }
          },
          required: ["name"]
        }
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          systemInstruction: `You are an executive assistant. The user's ID is ${user.uid}. 
          If they ask you to create a task, say "I will create a task for that".
          If they ask to open a file or bookmark, say "I will queue a desktop command for that".
          If they share a file and ask you to store/save it, use the saveFile tool.`,
          tools: [{ functionDeclarations: [saveFileFunction] }]
        }
      });

      let reply = response.text || "";

      if (response.functionCalls && response.functionCalls.length > 0) {
        for (const call of response.functionCalls) {
          if (call.name === 'saveFile') {
            if (window.electronAPI && currentAttachment) {
              const args = call.args as any;
              const result = await window.electronAPI.saveFile(args.name || currentAttachment.name, currentAttachment.data, args.folder);
              if (result.success) {
                reply += `\n\nI have saved the file to ${result.path}.`;
              } else {
                reply += `\n\nFailed to save file: ${result.error}`;
              }
            } else if (!window.electronAPI) {
              reply += `\n\n(Cannot save file: Desktop mode is not active.)`;
            } else {
              reply += `\n\n(No file was attached to save.)`;
            }
          }
        }
      }

      if (!reply) reply = "I processed your request.";

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
      <div className="p-6 border-b border-slate-800 bg-slate-900/30">
        <h2 className="text-xl font-semibold">Assistant Chat</h2>
        <p className="text-sm text-slate-500">Talk to your AI executive assistant</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-10">
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-2xl p-4 ${
              msg.sender === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-slate-800 text-white rounded-bl-none'
            }`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
              {msg.hasAttachment && (
                <div className="mt-2 text-xs bg-black/20 p-2 rounded flex items-center gap-2">
                  <Paperclip className="w-3 h-3" /> {msg.attachmentName}
                </div>
              )}
              {msg.sender === 'assistant' && (
                <button 
                  onClick={() => playTTS(msg.text)}
                  className="mt-2 text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-1 text-xs"
                >
                  <Play className="w-3 h-3" /> Listen
                </button>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-slate-400 rounded-2xl rounded-bl-none p-4 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Assistant is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-slate-900/50 border-t border-slate-800">
        {attachment && (
          <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 bg-slate-800 p-2 rounded-lg text-sm text-slate-300">
            <Paperclip className="w-4 h-4" />
            <span className="truncate">{attachment.name}</span>
            <button onClick={() => setAttachment(null)} className="ml-auto text-slate-500 hover:text-red-400">
              &times;
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-3 rounded-xl transition-colors ${isRecording ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            title={isRecording ? "Stop recording" : "Record voice note"}
          >
            {isRecording ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isRecording ? "Recording..." : "Ask your assistant to do something..."}
            disabled={isRecording}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-50"
          />
          <button 
            onClick={handleSend}
            disabled={(!input.trim() && !attachment) || isTyping || isRecording}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
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
      <div className="p-6 border-b border-slate-800 bg-slate-900/30">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <p className="text-sm text-slate-500">Manage your to-dos</p>
      </div>
      <div className="p-6 max-w-3xl w-full mx-auto">
        <div className="flex gap-2 mb-8">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder="Add a new task..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
          />
          <button onClick={addTask} className="bg-slate-800 hover:bg-slate-700 px-6 rounded-xl text-sm font-medium transition-colors">
            Add
          </button>
        </div>

        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800/50 rounded-xl">
              <button 
                onClick={() => toggleTask(task.id, task.status)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  task.status === 'completed' ? 'bg-blue-500 border-blue-500' : 'border-slate-600 hover:border-blue-500'
                }`}
              >
                {task.status === 'completed' && <CheckSquare className="w-3 h-3 text-slate-950" />}
              </button>
              <span className={`text-sm ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                {task.title}
              </span>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-slate-500 text-center py-10">No tasks yet.</p>}
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
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-semibold mb-2 text-red-400">Permission Required</h3>
            <p className="text-sm text-slate-300 mb-4">
              Are you sure you want to move/rename this file?
            </p>
            <div className="bg-slate-950 p-3 rounded-lg text-xs font-mono text-slate-400 mb-6 break-all">
              <div className="mb-1"><span className="text-slate-500">From:</span> {confirmModal.source}</div>
              <div><span className="text-slate-500">To:</span> {confirmModal.dest}</div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={confirmMove} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium transition-colors">Allow & Move</button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 border-b border-slate-800 bg-slate-900/30">
        <h2 className="text-xl font-semibold">Desktop Commands</h2>
        <p className="text-sm text-slate-500">Execute commands directly on your local machine</p>
      </div>
      <div className="p-6 max-w-4xl w-full mx-auto">
        
        {isDesktop ? (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-8">
            <h3 className="text-blue-400 font-medium mb-2 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Desktop Mode Active
            </h3>
            <p className="text-sm text-blue-500/80 leading-relaxed">
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
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
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
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
            />
            <button onClick={handleActionSubmit} className="bg-blue-600 hover:bg-blue-500 px-6 rounded-xl text-sm font-medium transition-colors">
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
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
              />
              <div className="w-[88px]"></div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {commands.map(c => (
            <div key={c.id} className="p-4 bg-slate-900/50 border border-slate-800/50 rounded-xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400 uppercase">{c.action}</span>
                  <span className="text-sm font-medium text-slate-200">{c.command}</span>
                </div>
                <div className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  c.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                  c.status === 'executed' ? 'bg-blue-500/10 text-blue-500' :
                  'bg-red-500/10 text-red-500'
                }`}>
                  {c.status}
                </span>
              </div>
            </div>
          ))}
          {commands.length === 0 && <p className="text-slate-500 text-center py-10">No commands queued.</p>}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ user }: { user: User }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-800 bg-slate-900/30">
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-slate-500">Configure your assistant</p>
      </div>
      <div className="p-6 max-w-2xl w-full mx-auto space-y-8">
        
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
          <h3 className="text-lg font-medium mb-4">Server Configuration</h3>
          <p className="text-sm text-slate-400 mb-4">
            The Telegram bot runs natively inside the Desktop App. To enable it, you must add your <code>TELEGRAM_BOT_TOKEN</code> to your local <code>.env</code> file.
          </p>
          <ol className="list-decimal list-inside text-sm text-slate-500 space-y-2">
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
        <FileText className="w-12 h-12 text-slate-700 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Desktop Only Feature</h2>
        <p className="text-slate-500 max-w-md">File logging and management is only available when running the native Electron desktop application.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">File Operations Log</h2>
          <p className="text-sm text-slate-500">History of files accessed, scanned, and modified</p>
        </div>
        <button onClick={() => window.electronAPI!.getLogs().then(setLogs)} className="text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-3">
          {logs.map((log, i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    log.action === 'MOVE' ? 'bg-purple-500/10 text-purple-400' : 
                    log.action === 'SCAN_FOLDER' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-blue-500/10 text-blue-400'
                  }`}>
                    {log.action}
                  </span>
                  <span className={`text-xs ${log.status === 'SUCCESS' ? 'text-blue-500' : 'text-red-500'}`}>
                    {log.status}
                  </span>
                  <span className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-sm text-slate-300 truncate font-mono" title={log.source}>
                  {log.source}
                </div>
                {log.destination && (
                  <div className="text-sm text-slate-400 truncate font-mono mt-1" title={log.destination}>
                    <span className="text-slate-600">→</span> {log.destination}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                  title="Show in Folder"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Folder
                </button>
                {log.action !== 'SCAN_FOLDER' && (
                  <button 
                    onClick={() => handleOpenFile(log.destination || log.source)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-medium transition-colors"
                    title="Open File"
                  >
                    <FileText className="w-3.5 h-3.5" /> Open
                  </button>
                )}
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-center text-slate-500 py-10">No file operations logged yet.</div>
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
        <Database className="w-12 h-12 text-slate-700 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Desktop Only Feature</h2>
        <p className="text-slate-500 max-w-md">The local file database is only available when running the native Electron desktop application.</p>
      </div>
    );
  }

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) || 
    f.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Local File Database</h2>
          <p className="text-sm text-slate-500">Scan folders to index and search your local files</p>
        </div>
        <button 
          onClick={handleScan} 
          disabled={isScanning}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
          {isScanning ? 'Scanning...' : 'Scan New Folder'}
        </button>
      </div>
      
      <div className="p-6 border-b border-slate-800/50 bg-slate-900/10">
        <div className="relative max-w-2xl">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search indexed files by name or path..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-medium text-slate-500 mb-4 uppercase tracking-wider">
            {filteredFiles.length} Indexed Files
          </div>
          
          <div className="space-y-2">
            {filteredFiles.map((file, i) => (
              <div key={i} className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-3 flex items-center justify-between gap-4 hover:bg-slate-800/50 transition-colors">
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-slate-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{file.name}</div>
                    <div className="text-xs text-slate-500 truncate font-mono mt-0.5" title={file.path}>{file.path}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-xs text-slate-500 hidden md:block">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleOpenFolder(file.path)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                      title="Show in Folder"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleOpenFile(file.path)}
                      className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors"
                      title="Open File"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredFiles.length === 0 && (
              <div className="text-center text-slate-500 py-10">
                {search ? 'No files match your search.' : 'No files indexed yet. Click "Scan New Folder" to begin.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminView({ user }: { user: User }) {
  const [permissions, setPermissions] = useState<any[]>([]);
  const isDesktop = !!window.electronAPI;

  useEffect(() => {
    if (isDesktop) {
      window.electronAPI!.getPermissions().then(setPermissions);
    }
  }, [isDesktop]);

  const handleRevoke = async (path: string) => {
    if (isDesktop) {
      await window.electronAPI!.removePermission(path);
      window.electronAPI!.getPermissions().then(setPermissions);
    }
  };

  if (!isDesktop) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Shield className="w-12 h-12 text-slate-700 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Desktop Only Feature</h2>
        <p className="text-slate-500 max-w-md">Folder permissions can only be managed in the native Electron desktop application.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-800 bg-slate-900/30">
        <h2 className="text-xl font-semibold">Admin Panel</h2>
        <p className="text-sm text-slate-500">Manage folder access and permissions</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <h3 className="text-lg font-medium mb-4">Allowed Folders</h3>
          {permissions.map((perm, i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200 truncate" title={perm.path}>{perm.path}</div>
                <div className="text-xs text-slate-500 mt-1">Granted: {new Date(perm.grantedAt).toLocaleString()}</div>
              </div>
              <button 
                onClick={() => handleRevoke(perm.path)}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-medium transition-colors"
              >
                Revoke Access
              </button>
            </div>
          ))}
          {permissions.length === 0 && (
            <div className="text-center text-slate-500 py-10">No folders have been granted access yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrationsView({ user }: { user: User }) {
  const [telegramChatId, setTelegramChatId] = useState('');
  const [whatsappToken, setWhatsappToken] = useState('');
  const [slackToken, setSlackToken] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.telegramChatId) setTelegramChatId(data.telegramChatId.toString());
        if (data.whatsappToken) setWhatsappToken(data.whatsappToken);
        if (data.slackToken) setSlackToken(data.slackToken);
      }
    };
    fetchUser();
  }, [user.uid]);

  const saveIntegration = async (type: string) => {
    setSaving(type);
    const updates: any = {};
    if (type === 'telegram') updates.telegramChatId = parseInt(telegramChatId) || null;
    if (type === 'whatsapp') updates.whatsappToken = whatsappToken || null;
    if (type === 'slack') updates.slackToken = slackToken || null;
    
    await updateDoc(doc(db, 'users', user.uid), updates);
    setTimeout(() => setSaving(null), 1000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-800 bg-slate-900/30">
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="text-sm text-slate-500">Connect your assistant with other apps</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 flex flex-col">
            <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center mb-4">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium mb-2">Telegram</h3>
            <p className="text-sm text-slate-400 mb-6 flex-1">
              Control your assistant and receive notifications directly from Telegram.
            </p>
            <div className="space-y-3 mt-auto">
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="Telegram Chat ID"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50"
              />
              <button 
                onClick={() => saveIntegration('telegram')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving === 'telegram' ? <><CheckSquare className="w-4 h-4 text-emerald-500" /> Saved</> : 'Save'}
              </button>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 flex flex-col">
            <div className="w-12 h-12 bg-green-500/10 text-green-400 rounded-xl flex items-center justify-center mb-4">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium mb-2">WhatsApp</h3>
            <p className="text-sm text-slate-400 mb-6 flex-1">
              Connect your assistant to WhatsApp for seamless messaging.
            </p>
            <div className="space-y-3 mt-auto">
              <input
                type="text"
                value={whatsappToken}
                onChange={(e) => setWhatsappToken(e.target.value)}
                placeholder="WhatsApp API Token"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500/50"
              />
              <button 
                onClick={() => saveIntegration('whatsapp')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving === 'whatsapp' ? <><CheckSquare className="w-4 h-4 text-emerald-500" /> Saved</> : 'Save'}
              </button>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 flex flex-col">
            <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center mb-4">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium mb-2">Slack</h3>
            <p className="text-sm text-slate-400 mb-6 flex-1">
              Integrate with your Slack workspace to manage tasks and files.
            </p>
            <div className="space-y-3 mt-auto">
              <input
                type="text"
                value={slackToken}
                onChange={(e) => setSlackToken(e.target.value)}
                placeholder="Slack Bot Token"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
              />
              <button 
                onClick={() => saveIntegration('slack')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving === 'slack' ? <><CheckSquare className="w-4 h-4 text-emerald-500" /> Saved</> : 'Save'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
