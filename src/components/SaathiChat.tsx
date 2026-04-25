import React, { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { startSaathiChat } from '../services/gemini';
import { Habit, Task } from '../types';
import { createGoogleTask } from '../services/tasks';
import { MessageCircle, X, Send, User as UserIcon, Bot, Loader2, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

interface SaathiChatProps {
  user: User;
  googleToken: string | null;
  habits: Habit[];
  tasks: Task[];
  energyLevel: number;
}

interface ChatMessage {
  role: 'user' | 'model' | 'tool';
  parts: { text?: string; functionCall?: any; functionResponse?: any }[];
}

export default function SaathiChat({ user, googleToken, habits, tasks, energyLevel }: SaathiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const executeFunction = async (name: string, args: any) => {
    try {
      if (name === 'create_habit') {
        const path = 'habits';
        await addDoc(collection(db, path), {
          userId: user.uid,
          name: args.name,
          frequency: args.frequency || 'daily',
          targetTime: args.targetTime || '',
          streak: 0,
          createdAt: serverTimestamp(),
        });
        return { success: true, message: `Habit "${args.name}" created.` };
      }

      if (name === 'create_goal') {
        const path = 'tasks';
        await addDoc(collection(db, path), {
          userId: user.uid,
          title: args.title,
          energyRequired: args.energyRequired || 3,
          isCompleted: false,
          createdAt: serverTimestamp(),
        });

        let syncStatus = '';
        if (args.syncToGoogleTasks && googleToken) {
          const googleTask = await createGoogleTask(googleToken, args.title);
          if (googleTask) {
            syncStatus = ' (Synced to Google Tasks)';
          } else {
            syncStatus = ' (Google Tasks sync failed)';
          }
        }

        return { success: true, message: `Goal "${args.title}" set.${syncStatus}` };
      }

      if (name === 'add_calendar_event') {
        if (!googleToken) {
          return { 
            success: false, 
            error: 'Google Calendar is not connected. Please sign in again and ensure permissions are granted.' 
          };
        }
        
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: args.summary,
            description: args.description || 'Added by Saathi',
            start: { dateTime: args.startDateTime },
            end: { dateTime: args.endDateTime },
          }),
        });

        if (res.ok) {
          return { success: true, message: `Event "${args.summary}" scheduled.` };
        } else {
          const err = await res.json();
          return { success: false, error: err.error?.message || 'Failed to schedule event.' };
        }
      }

      return { success: false, error: 'Unknown tool.' };
    } catch (e: any) {
      console.error("Tool execution failed:", e);
      return { success: false, error: e.message };
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: textToSend }] };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!overrideInput) setInput('');
    setIsLoading(true);

    try {
      const currentContext = { habits, tasks, energyLevel };
      let response = await startSaathiChat(newMessages, currentContext);
      
      let nextMessages: ChatMessage[] = [...newMessages, { role: 'model', parts: response.candidates[0].content.parts as any }];

      // Handle function calls
      const functionCalls = response.functionCalls;
      if (functionCalls) {
        for (const fc of functionCalls) {
          const result = await executeFunction(fc.name, fc.args);
          nextMessages.push({
            role: 'tool' as const,
            parts: [{
              functionResponse: {
                name: fc.name,
                response: result
              }
            }] as any
          });
        }
        
        // Final response after tools
        const finalResponse = await startSaathiChat(nextMessages, currentContext);
        nextMessages.push({ role: 'model' as const, parts: finalResponse.candidates[0].content.parts as any });
      }

      setMessages(nextMessages);
    } catch (error) {
      setMessages([...newMessages, { role: 'model', parts: [{ text: "I'm having a little trouble connecting right now, friend. Can we try again?" }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Chat Toggle */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg hover:shadow-indigo-500/40 transition-all flex items-center justify-center group z-50 overflow-hidden"
      >
         <div className="absolute inset-0 bg-indigo-400/20 scale-0 group-hover:scale-150 transition-transform duration-500 rounded-full" />
         <MessageCircle className="w-6 h-6 relative z-10" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-[400px] max-w-[calc(100vw-48px)] h-[600px] max-h-[calc(100vh-120px)] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">Saathi</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Always Here</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
            >
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-8 space-y-6">
                  <Bot className="w-12 h-12 text-zinc-200 dark:text-zinc-800" />
                  <p className="text-sm text-zinc-400 font-medium">
                    "I'm Saathi, your life companion. I can help you set habits, goals, or schedule your calendar. Just ask me."
                  </p>
                  <div className="grid grid-cols-2 gap-2 w-full">
                    {[
                      { label: "New Habit", icon: "🌱", prompt: "I want to start a new habit" },
                      { label: "Set Goal", icon: "🎯", prompt: "I have a new goal to set" },
                      { label: "Schedule", icon: "📅", prompt: "I need to schedule something" },
                      { label: "Status", icon: "✨", prompt: "How's my day looking?" }
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={() => handleSend(item.prompt)}
                        className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/10 rounded-2xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all text-left"
                      >
                        <span className="text-sm">{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => {
                if (msg.role === 'tool') return null; // Don't show technical tool messages
                const isModel = msg.role === 'model';
                const text = msg.parts.find(p => p.text)?.text;
                if (!text) return null;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: isModel ? -10 : 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex gap-3 ${isModel ? 'flex-row' : 'flex-row-reverse'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isModel ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-zinc-100 dark:bg-zinc-800'
                    }`}>
                      {isModel ? <Bot className="w-4 h-4 text-indigo-600" /> : <UserIcon className="w-4 h-4 text-zinc-600" />}
                    </div>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      isModel 
                        ? 'bg-zinc-100 dark:bg-white/5 text-zinc-800 dark:text-zinc-200 rounded-tl-none' 
                        : 'bg-indigo-600 text-white rounded-tr-none'
                    }`}>
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed">
                        <ReactMarkdown>
                          {text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  </div>
                  <div className="bg-zinc-100 dark:bg-white/5 p-3 rounded-2xl rounded-tl-none">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Tell Saathi anything..."
                  className="w-full pl-4 pr-12 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-white"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 text-center mt-3 font-medium">
                "I'm here to companion you in your intentions, not replace them."
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
