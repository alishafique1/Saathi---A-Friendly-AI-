import React, { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { startSaathiChat } from '../services/gemini';
import { Habit, Task } from '../types';
import { createGoogleTask } from '../services/tasks';
import { MessageCircle, X, Send, User as UserIcon, Bot, Loader2, CheckCircle, Plus } from 'lucide-react';
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
        className="fixed bottom-32 right-8 w-16 h-16 bg-white text-brand-orange rounded-full border-2 border-zinc-100 shadow-2xl hover:border-brand-orange hover:shadow-[0_4px_20px_rgba(255,92,0,0.2)] transition-all flex items-center justify-center z-50 group"
      >
         <MessageCircle className="w-7 h-7 group-hover:scale-110 transition-transform" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 20 }}
            className="fixed bottom-32 right-8 w-[450px] max-w-[calc(100vw-64px)] h-[700px] max-h-[calc(100vh-160px)] bg-white border border-zinc-100 shadow-[0_20px_80px_rgba(0,0,0,0.1)] z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="w-12 h-12 bg-brand-orange flex items-center justify-center">
                    <Bot className="w-7 h-7 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand-purple border-2 border-white" />
                </div>
                <div>
                  <h3 className="text-[14px] font-black text-black uppercase tracking-[0.5em] leading-none">SAATHI_LINK</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-1.5 h-1.5 bg-brand-orange animate-pulse" />
                    <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest italic">NEURAL_CALIBRATION_ACTIVE</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 flex items-center justify-center hover:bg-zinc-50 transition-colors group"
              >
                <X className="w-6 h-6 text-zinc-200 group-hover:text-black" />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-10 space-y-12 scroll-smooth bg-zinc-50 relative"
            >
              {/* Scanline Effect */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0)_50%,rgba(0,0,0,0.02)_50%)] bg-[length:100%_4px] z-20 opacity-50" />

              {messages.length === 0 && (
                <div className="h-full flex flex-col justify-center space-y-16 relative z-10">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-[1px] bg-brand-orange" />
                      <span className="text-[10px] font-black text-brand-orange uppercase tracking-[0.8em] italic">READY_FOR_INPUT</span>
                    </div>
                    <p className="text-42px font-serif text-black font-black italic uppercase tracking-tighter leading-[0.9]">
                      How is the <span className="text-brand-orange">signal</span> today?
                    </p>
                  </div>
                  <div className="flex flex-col gap-4">
                    {[
                      { label: "Check status", prompt: "How's my day looking?" },
                      { label: "Focus window", prompt: "I need to focus on a difficult task" },
                      { label: "New anchor", prompt: "I want to start a new habit" }
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={() => handleSend(item.prompt)}
                        className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.4em] hover:text-black hover:bg-white hover:shadow-sm p-5 border border-zinc-100 group transition-all flex items-center justify-between"
                      >
                        {item.label}
                        <Plus className="w-4 h-4 opacity-10 group-hover:opacity-100 transition-opacity text-brand-orange" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => {
                if (msg.role === 'tool') return null;
                const isModel = msg.role === 'model';
                const text = msg.parts.find(p => p.text)?.text;
                if (!text) return null;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col relative z-30 ${isModel ? 'items-start' : 'items-end'}`}
                  >
                    <div className={`flex items-center gap-3 mb-3 ${isModel ? 'flex-row' : 'flex-row-reverse'}`}>
                       <span className={`text-[9px] font-black uppercase tracking-[0.4em] italic ${isModel ? 'text-zinc-300' : 'text-brand-purple'}`}>
                        {isModel ? 'RELAY_SAATHI' : 'UPLINK_USER'}
                       </span>
                      <div className={`w-1 h-1 rounded-full ${isModel ? 'bg-brand-orange' : 'bg-brand-purple'}`} />
                    </div>
                    
                    <div className={`max-w-[95%] p-6 ${
                      isModel 
                        ? 'bg-white border border-zinc-100 text-zinc-600 leading-relaxed font-medium shadow-sm' 
                        : 'bg-brand-orange/5 border border-brand-orange/20 text-brand-orange font-black italic uppercase tracking-tight text-xl leading-none'
                    }`}>
                      <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-100 prose-zinc prose-invert-none">
                        <ReactMarkdown>
                          {text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {isLoading && (
                <div className="flex items-center gap-4 py-4">
                  <Loader2 className="w-5 h-5 text-brand-orange animate-spin" />
                  <span className="text-[10px] font-black text-brand-orange uppercase tracking-[0.6em] animate-pulse italic">PROCESSING_BITSTREAM...</span>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-10 border-t border-zinc-100 bg-white">
              <div className="relative group">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="TRANSMIT_COMMAND..."
                  className="w-full py-6 bg-transparent border-b-2 border-zinc-100 focus:border-brand-orange outline-none text-[13px] font-black uppercase tracking-[0.5em] text-black transition-all placeholder:text-zinc-100"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-4 text-zinc-100 hover:text-brand-orange disabled:opacity-0 transition-all"
                >
                  <Send className="w-6 h-6" />
                </button>
              </div>
              <div className="pt-6 flex justify-between items-center">
                <span className="text-[8px] font-black text-zinc-100 uppercase tracking-[0.4em]">ENCRYPTION: AES-256</span>
                <span className="text-[8px] font-black text-brand-orange uppercase tracking-[0.4em]">LATENCY: 42MS</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
