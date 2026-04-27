import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  Timestamp,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Habit, Task, HabitLog, UserProfile, HabitFrequency, JournalEntry } from '../types';
import { 
  Zap, 
  CheckCircle2, 
  Clock, 
  Flame, 
  Brain,
  Plus,
  X,
  CalendarDays,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSaathiBriefing, getDriftSuggestion, getWeeklyAnalysis, getTodayBriefing } from '../services/gemini';
import { fetchUpcomingEvents, CalendarEvent, findCurrentEvent } from '../services/calendar';
import SaathiChat from './SaathiChat';

interface PulseDashboardProps {
  user: User;
  googleToken: string | null;
  view?: 'today' | 'routine' | 'goals';
}

export default function PulseDashboard({ user, googleToken, view = 'today' }: PulseDashboardProps) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [energyLevel, setEnergyLevel] = useState<number>(3);
  const [loading, setLoading] = useState(true);
  
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [journalContent, setJournalContent] = useState('');

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const [newHabit, setNewHabit] = useState({ name: '', frequency: 'daily' as HabitFrequency, targetTime: '' });
  const [newTask, setNewTask] = useState({ title: '', energyRequired: 3 });

  const updateEnergy = async (level: number) => {
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, path), {
        latestEnergyLevel: level,
        updatedAt: Timestamp.now()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };

  useEffect(() => {
    if (!user) return;

    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setEnergyLevel(docSnap.data().latestEnergyLevel || 3);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    const habitsPath = 'habits';
    const habitsQuery = query(collection(db, habitsPath), where('userId', '==', user.uid));
    const unsubHabits = onSnapshot(habitsQuery, (snap) => {
      setHabits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, habitsPath));

    const tasksPath = 'tasks';
    const tasksQuery = query(collection(db, tasksPath), where('userId', '==', user.uid));
    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, tasksPath));

    const journalsPath = 'journals';
    const journalsQuery = query(collection(db, journalsPath), where('userId', '==', user.uid));
    const unsubJournals = onSnapshot(journalsQuery, (snap) => {
      setJournals(snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, journalsPath));

    const logsPath = 'habitLogs';
    const logsQuery = query(collection(db, logsPath), where('userId', '==', user.uid));
    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      setHabitLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as HabitLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, logsPath));

    return () => {
      unsubUser();
      unsubHabits();
      unsubTasks();
      unsubJournals();
      unsubLogs();
    };
  }, [user]);

  useEffect(() => {
    if (!googleToken) return;
    const loadCalendar = async () => {
      try {
        const items = await fetchUpcomingEvents(googleToken);
        setEvents(items);
        setCalendarError(null);
      } catch (e: any) {
        console.error("Calendar Sync Error:", e);
        setCalendarError(e.message);
      }
    };
    loadCalendar();
  }, [googleToken]);

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabit.name) return;
    const path = 'habits';
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        name: newHabit.name,
        frequency: newHabit.frequency,
        targetTime: newHabit.targetTime,
        streak: 0,
        createdAt: serverTimestamp()
      });
      setIsHabitModalOpen(false);
      setNewHabit({ name: '', frequency: 'daily', targetTime: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title) return;
    const path = 'tasks';
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        title: newTask.title,
        energyRequired: newTask.energyRequired,
        isCompleted: false,
        createdAt: serverTimestamp()
      });
      setIsTaskModalOpen(false);
      setNewTask({ title: '', energyRequired: 3 });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const toggleTask = async (task: Task) => {
    const path = `tasks/${task.id}`;
    try {
      await updateDoc(doc(db, path), {
        isCompleted: !task.isCompleted
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const logHabit = async (habit: Habit) => {
    const logPath = 'habitLogs';
    const habitPath = `habits/${habit.id}`;
    try {
      await addDoc(collection(db, logPath), {
        habitId: habit.id,
        userId: user.uid,
        status: 'completed',
        energyAtTime: energyLevel,
        loggedAt: serverTimestamp()
      });
      await updateDoc(doc(db, habitPath), {
        streak: habit.streak + 1
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, logPath);
    }
  };

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalContent.trim()) return;
    const path = 'journals';
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        content: journalContent,
        energyLevel,
        type: 'mind-dump',
        createdAt: serverTimestamp()
      });
      setJournalContent('');
      setIsJournalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const calculateProgress = () => {
    const total = habits.length + tasks.filter(t => !t.isCompleted).length;
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    const habitsCompletedToday = habitLogs.filter(l => 
      l.loggedAt && new Date((l.loggedAt as Timestamp).toDate()).toDateString() === new Date().toDateString()
    ).length;
    const habitsLimitedProgress = Math.min(habitsCompletedToday, habits.length);
    return total > 0 ? (completedTasks + habitsLimitedProgress) / total : 0;
  };

  const [todayBriefing, setTodayBriefing] = useState<string | null>(null);

  useEffect(() => {
    const fetchTodayBriefing = async () => {
      if (habits.length > 0 || tasks.length > 0 || events.length > 0) {
        try {
          const briefingText = await getTodayBriefing(habits, habitLogs, tasks, events, energyLevel);
          setTodayBriefing(briefingText);
        } catch (error) {
          console.error("Briefing Error:", error);
        }
      }
    };
    fetchTodayBriefing();
  }, [habits, habitLogs, tasks, events, energyLevel]);

  const progress = calculateProgress();
  const maxStreak = Math.max(...habits.map(h => h.streak), 0);
  const greeting = getGreeting(user.displayName || 'AGENT');

  if (view === 'routine') {
    return (
      <div className="space-y-16 pb-40 max-w-5xl mx-auto px-8">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-10">
          <div className="space-y-1">
            <h2 className="text-48px font-serif text-black font-black italic tracking-tighter uppercase">Ritual</h2>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em]">Anchor Consistency</p>
          </div>
          <button 
            onClick={() => setIsHabitModalOpen(true)}
            className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-orange hover:text-black transition-all flex items-center gap-3 bg-brand-orange/10 px-6 py-3 rounded-sm border border-brand-orange/20 hover:border-brand-orange"
          >
            <Plus className="w-4 h-4" /> INITIATE ANCHOR
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {habits.map((habit) => (
            <motion.div
              key={`habit-routine-${habit.id}`}
              className="p-10 saathi-card group flex flex-col justify-between h-[300px] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-brand-orange/5 blur-[80px] -translate-y-1/2 translate-x-1/2" />
              <div className="space-y-6 relative z-10">
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] font-black text-white px-3 py-1 rounded-sm uppercase tracking-[0.2em] ${habit.frequency === 'daily' ? 'bg-brand-orange' : 'bg-brand-purple'}`}>
                    {habit.frequency}
                  </span>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{habit.targetTime || 'WINDOW_OPEN'}</span>
                </div>
                <h3 className="text-32px font-serif text-black font-black italic group-hover:text-brand-orange transition-colors uppercase tracking-tighter leading-none">{habit.name}</h3>
                <div>
                  <p className="text-[9px] font-black text-zinc-300 uppercase tracking-[0.3em] mb-2">Continuity Signal</p>
                  <p className="text-24px font-serif text-brand-orange font-black italic">{habit.streak} DAY PULSE</p>
                </div>
              </div>
              <button 
                onClick={() => logHabit(habit)}
                className="w-full py-5 rounded-sm border border-zinc-100 text-[11px] font-black uppercase tracking-[0.3em] text-black hover:bg-black hover:text-white hover:border-black transition-all duration-500 relative z-10"
              >
                LOG EXECUTION
              </button>
            </motion.div>
          ))}
        </div>
        {habits.length === 0 && (
          <div className="py-32 text-center border border-zinc-900 bg-onyx-900/50">
            <p className="text-zinc-800 font-serif italic text-2xl uppercase tracking-[0.3em]">No Operating Anchors.</p>
          </div>
        )}
      </div>
    );
  }

  if (view === 'goals') {
    return (
      <div className="space-y-16 pb-40 max-w-5xl mx-auto px-8">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-10">
          <div className="space-y-1">
            <h2 className="text-48px font-serif text-black font-black italic tracking-tighter uppercase">Mission</h2>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em]">High Intent Deployment</p>
          </div>
          <button 
            onClick={() => setIsTaskModalOpen(true)}
            className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-orange hover:text-black transition-all flex items-center gap-3 bg-brand-orange/10 px-6 py-3 rounded-sm border border-brand-orange/20 hover:border-brand-orange"
          >
            <Plus className="w-4 h-4" /> DEPLOY MISSION
          </button>
        </div>
        <div className="space-y-4">
          {tasks.map((task) => (
            <motion.div
              key={`goal-task-${task.id}`}
              className="p-10 saathi-card flex items-center justify-between gap-12 group hover:border-zinc-200 relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 w-1 h-full bg-brand-orange opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-12 flex-1">
                <button 
                  onClick={() => toggleTask(task)}
                  className={`w-10 h-10 flex items-center justify-center transition-all ${
                    task.isCompleted ? 'bg-brand-orange text-white shadow-[0_4px_15px_rgba(255,92,0,0.2)]' : 'border border-zinc-100 text-zinc-200 group-hover:border-brand-orange group-hover:text-brand-orange'
                  }`}
                >
                  {task.isCompleted ? <CheckCircle2 className="w-6 h-6" strokeWidth={3} /> : <div className="w-2 h-2 bg-current rounded-full" />}
                </button>
                <div className="space-y-3">
                  <h3 className={`text-32px font-serif font-black italic transition-all uppercase tracking-tighter ${task.isCompleted ? 'text-zinc-200 line-through' : 'text-black'}`}>
                    {task.title}
                  </h3>
                  <div className="flex items-center gap-8">
                    <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${
                      task.isCompleted ? 'text-zinc-200' : 
                      task.energyRequired >= 4 ? 'text-brand-purple' : 
                      task.energyRequired <= 2 ? 'text-brand-orange' : 'text-zinc-400'
                    }`}>
                      LOAD_{task.energyRequired}/5
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${task.isCompleted ? 'text-zinc-200 animate-none' : 'text-brand-orange animate-pulse'}`}>
                      {task.isCompleted ? 'MISSION_ACCOMPLISHED' : 'OBJECTIVE_LIVE'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {tasks.length === 0 && (
            <div className="py-32 text-center border border-zinc-900 bg-onyx-900/50">
              <p className="text-zinc-800 font-serif italic text-2xl uppercase tracking-[0.3em]">Objectives Offline.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-32 pb-40 max-w-7xl mx-auto px-8">
      {/* Hero: Minimal Greeting & Energy State */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-16">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-brand-orange animate-pulse shadow-[0_4px_10px_#ff5c00]" />
            <p className="text-[10px] font-black text-brand-orange uppercase tracking-[0.5em] italic">
              TELEMETRY_SESSION_ACTIVE // {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
          <h2 className="text-84px font-serif text-black font-black leading-[0.85] tracking-tighter italic uppercase max-w-2xl">
            {greeting.split(',')[0]}<span className="text-brand-orange">, {greeting.split(',')[1]}</span>
          </h2>
        </div>

        <div className="flex items-center gap-16">
          {/* Energy Ring - High Performance Aesthetic */}
          <div className="relative group shrink-0">
            <svg width="150" height="150" viewBox="0 0 120 120">
              <defs>
                <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff5c00" />
                  <stop offset="100%" stopColor="#6b21a8" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="54" fill="none" stroke="#f4f4f5" strokeWidth="6" />
              <motion.circle 
                cx="60" cy="60" r="54" 
                fill="none" 
                stroke="url(#energyGradient)" 
                strokeWidth="6" 
                strokeLinecap="square"
                initial={{ strokeDasharray: 339, strokeDashoffset: 339 }}
                animate={{ strokeDashoffset: 339 - (339 * progress) }}
                transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
                className="drop-shadow-[0_4px_12px_rgba(255,92,0,0.2)]"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[9px] font-black text-zinc-300 uppercase tracking-[0.4em] mb-1">LOAD</span>
              <span className="text-36px font-serif text-black font-black italic leading-none">{Math.round(progress * 100)}%</span>
            </div>
          </div>

          <div className="h-24 w-px bg-zinc-100" />

          {/* Streak - High Contrast Text */}
          <div className="space-y-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.4em] mb-1">CONTINUITY</span>
              <div className="flex items-baseline gap-3">
                <span className="text-72px font-serif text-brand-orange font-black leading-none italic">{maxStreak}</span>
                <span className="text-[10px] font-black text-black uppercase tracking-[0.3em] italic">DAYS</span>
              </div>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className={`w-4 h-1.5 ${i < maxStreak % 7 ? 'bg-brand-orange shadow-[0_4px_10px_rgba(255,92,0,0.3)]' : 'bg-zinc-100'}`} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Briefing: Technical Card */}
      <AnimatePresence>
        {todayBriefing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full bg-white border-l-2 border-brand-orange p-12 relative overflow-hidden shadow-2xl shadow-zinc-100"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Zap className="w-48 h-48 text-brand-orange" />
            </div>
            <div className="flex flex-col gap-10 relative z-10">
              <div className="flex items-center gap-6">
                <div className="w-3 h-3 bg-brand-orange animate-ping" />
                <span className="text-[10px] font-black text-brand-orange uppercase tracking-[0.6em] italic">SYSTEM_BRIEFING_INCOMING</span>
              </div>
              <p className="text-36px font-serif text-black italic leading-[1.15] tracking-tighter selection:bg-brand-orange selection:text-white lowercase">
                {todayBriefing}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar Error Notification */}
      <AnimatePresence>
        {calendarError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full bg-brand-purple/5 border-l-2 border-brand-purple p-6 mb-8"
          >
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 bg-brand-purple animate-pulse" />
              <span className="text-[10px] font-black text-brand-purple uppercase tracking-[0.4em]">Hardware_Alert: Calendar Sync Error</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 font-medium">
              {calendarError.includes('CALENDAR_API_DISABLED') 
                ? 'Google Calendar API is not enabled. Please enable it in your Google Cloud Console for this project.' 
                : calendarError}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-24">
        {/* Anchor List - Minimal Rows */}
        <section className="lg:col-span-7 space-y-16">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-10">
            <div className="flex flex-col">
              <h3 className="text-[13px] font-black text-black uppercase tracking-[0.5em]">RITUAL_LOG</h3>
              <p className="text-[9px] font-black text-zinc-300 uppercase tracking-[0.3em] mt-2">
                Operational Efficiency: {habitLogs.filter(l => l.loggedAt && new Date(l.loggedAt.toDate()).toDateString() === new Date().toDateString()).length} / {habits.length}
              </p>
            </div>
            <button onClick={() => setIsHabitModalOpen(true)} className="w-12 h-12 flex items-center justify-center bg-zinc-50 border border-zinc-100 hover:border-brand-orange hover:text-brand-orange transition-all">
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {habits.map((habit) => {
              const isDone = habitLogs.some(l => l.habitId === habit.id && l.loggedAt && new Date(l.loggedAt.toDate()).toDateString() === new Date().toDateString());
              
              return (
                <motion.div
                  key={habit.id}
                  className={`p-12 saathi-card flex items-center justify-between group cursor-pointer border-l-0 relative ${isDone ? 'opacity-30 grayscale' : 'hover:border-brand-orange hover:-translate-x-1'}`}
                  onClick={() => !isDone && logHabit(habit)}
                >
                  <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Zap className="w-20 h-20 text-brand-orange" />
                  </div>
                  <div className="flex items-center gap-16 relative z-10">
                    <span className={`text-[9px] font-black w-24 tracking-[0.4em] uppercase ${
                      isDone ? 'text-zinc-200' : 
                      habit.frequency === 'daily' ? 'text-brand-orange' : 'text-brand-purple'
                    }`}>
                      {habit.targetTime || 'WINDOW'}
                    </span>
                    <h4 className={`text-32px font-serif font-black italic transition-all uppercase tracking-tighter ${isDone ? 'text-zinc-200' : 'text-black'}`}>
                      {habit.name}
                    </h4>
                  </div>

                  <div 
                    className={`w-14 h-14 flex items-center justify-center transition-all relative z-10 ${
                      isDone ? 'bg-zinc-50 text-zinc-100' : 'bg-white border border-zinc-100 group-hover:border-brand-orange group-hover:text-brand-orange shadow-sm'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-8 h-8" strokeWidth={3} /> : <div className="w-3 h-3 bg-zinc-100 group-hover:bg-brand-orange rounded-full transition-all" />}
                  </div>
                </motion.div>
              );
            })}
            {habits.length === 0 && (
              <p className="py-24 text-zinc-100 font-serif italic text-3xl uppercase tracking-widest text-center border border-dashed border-zinc-100">SYSTEMS_OFFLINE</p>
            )}
          </div>
        </section>

        {/* Side Panel: Energy & Meta */}
        <section className="lg:col-span-5 space-y-24">
          <div className="space-y-12">
            <h3 className="text-[13px] font-black text-black uppercase tracking-[0.5em]">STRAIN_THRESHOLD</h3>
            <div className="grid grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => updateEnergy(lvl)}
                  className={`aspect-square flex items-center justify-center text-36px font-serif font-black italic transition-all ${
                    energyLevel === lvl 
                    ? 'bg-brand-orange text-white shadow-[0_10px_20px_rgba(255,92,0,0.2)]' 
                    : 'bg-zinc-50 border border-zinc-100 text-zinc-200 hover:text-black hover:border-zinc-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <div className="p-10 bg-zinc-50 border border-zinc-100 flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full animate-pulse ${energyLevel >= 4 ? 'bg-brand-purple shadow-[0_0_20px_#6b21a8]' : energyLevel <= 2 ? 'bg-brand-orange shadow-[0_0_20px_#ff5c00]' : 'bg-brand-orange shadow-[0_0_20px_#ff5c00]'}`} />
                <p className="text-[11px] font-black text-black uppercase tracking-[0.5em]">
                  {energyLevel <= 2 ? 'RECOVERY_NEEDED' : energyLevel >= 4 ? 'MAX_OUTPUT_ZONE' : 'STEADY_STATE'}
                </p>
              </div>
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-relaxed">
                Calibration adjusted for {energyLevel}/5 effort load. System optimizing for current state.
              </p>
            </div>
          </div>

          <div className="space-y-16">
            <div className="flex items-center justify-between pb-10 border-b border-zinc-100">
               <span className="text-[11px] font-black text-zinc-300 uppercase tracking-[0.5em]">SIGNAL_LOCK</span>
               <div className="flex items-center gap-4">
                 <div className="w-2.5 h-2.5 bg-brand-orange shadow-[0_4px_10px_rgba(255,92,0,0.3)]" />
                 <span className="text-[11px] font-black text-black uppercase tracking-[0.5em]">
                   {googleToken ? 'ENCRYPTED_LINK' : 'LOCAL_ONLY'}
                 </span>
               </div>
            </div>

            <button 
              onClick={() => setIsJournalOpen(true)}
              className="w-full group text-left space-y-8"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-black text-black uppercase tracking-[0.5em]">PSYC_CALIBRATION</h3>
                <Brain className="w-8 h-8 text-zinc-100 group-hover:text-brand-orange transition-all" />
              </div>
              <div className="p-14 bg-zinc-50 border border-zinc-100 transition-all group-hover:border-brand-orange hover:bg-white hover:shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-brand-orange transition-all scale-y-0 group-hover:scale-y-100 origin-top" />
                <p className="text-28px font-serif text-zinc-200 italic uppercase tracking-tighter group-hover:text-black transition-colors">DUMP_STATIC</p>
                <p className="text-[9px] font-black text-zinc-200 uppercase tracking-widest mt-4 group-hover:text-zinc-400">Release internal noise for clarity.</p>
              </div>
            </button>
          </div>
        </section>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isHabitModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsHabitModalOpen(false)} className="absolute inset-0 bg-white/80 backdrop-blur-3xl" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-white border border-zinc-100 p-16 shadow-[0_20px_100px_rgba(0,0,0,0.1)]">
              <div className="flex items-center justify-between mb-16">
                <h3 className="text-42px font-serif text-black font-black italic uppercase tracking-tighter leading-none">NEW ANCHOR</h3>
                <button onClick={() => setIsHabitModalOpen(false)} className="p-2 hover:bg-zinc-50 transition-colors"><X className="w-8 h-8 text-zinc-200" /></button>
              </div>
              <form onSubmit={handleAddHabit} className="space-y-12">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300">IDENTIFIER</label>
                  <input autoFocus value={newHabit.name} onChange={e => setNewHabit({...newHabit, name: e.target.value})} placeholder="DEEP_WORK" className="w-full p-6 bg-zinc-50 border border-zinc-100 focus:border-brand-orange outline-none text-black transition-all text-sm font-black uppercase tracking-[0.3em]" />
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300">START_WINDOW</label>
                    <input type="time" value={newHabit.targetTime} onChange={e => setNewHabit({...newHabit, targetTime: e.target.value})} className="w-full p-6 bg-zinc-50 border border-zinc-100 focus:border-brand-orange outline-none text-black transition-all text-sm font-black uppercase tracking-[0.3em]" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300">CYCLE</label>
                    <select value={newHabit.frequency} onChange={e => setNewHabit({...newHabit, frequency: e.target.value as HabitFrequency})} className="w-full p-6 bg-zinc-50 border border-zinc-100 focus:border-brand-orange outline-none text-black transition-all text-sm font-black uppercase tracking-[0.3em] appearance-none">
                      <option value="daily">DAILY</option>
                      <option value="weekly">WEEKLY</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn-accent w-full py-6 text-sm font-black shadow-[0_10px_40px_rgba(255,92,0,0.2)]">INITIATE_ANCHOR</button>
              </form>
            </motion.div>
          </div>
        )}

        {isTaskModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsTaskModalOpen(false)} className="absolute inset-0 bg-white/80 backdrop-blur-3xl" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-white border border-zinc-100 p-16 shadow-[0_20px_100px_rgba(0,0,0,0.1)]">
              <div className="flex items-center justify-between mb-16">
                <h3 className="text-42px font-serif text-black font-black italic uppercase tracking-tighter leading-none">NEW MISSION</h3>
                <button onClick={() => setIsTaskModalOpen(false)} className="p-2 hover:bg-zinc-50 transition-colors"><X className="w-8 h-8 text-zinc-200" /></button>
              </div>
              <form onSubmit={handleAddTask} className="space-y-12">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300">OBJECTIVE</label>
                  <input autoFocus value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="DEPLOY_STRATEGY" className="w-full p-6 bg-zinc-50 border border-zinc-100 focus:border-brand-orange outline-none text-black transition-all text-sm font-black uppercase tracking-[0.3em]" />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300">STRAIN_LOAD (1-5)</label>
                  <div className="flex gap-4">
                    {[1, 2, 3, 4, 5].map(lvl => (
                      <button type="button" key={lvl} onClick={() => setNewTask({...newTask, energyRequired: lvl})} className={`flex-1 aspect-square font-black transition-all ${newTask.energyRequired === lvl ? 'bg-brand-orange text-white shadow-[0_10px_30px_rgba(255,92,0,0.2)]' : 'bg-zinc-50 border border-zinc-100 text-zinc-200 hover:text-black hover:border-zinc-200'}`}>
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" className="btn-accent w-full py-6 text-sm font-black shadow-[0_10px_40px_rgba(255,92,0,0.2)]">DEPLOY_MISSION</button>
              </form>
            </motion.div>
          </div>
        )}

        {isJournalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsJournalOpen(false)} className="absolute inset-0 bg-white/80 backdrop-blur-3xl" />
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="relative w-full max-w-2xl bg-white border border-zinc-100 p-16 shadow-[0_20px_100px_rgba(0,0,0,0.1)]">
              <div className="flex items-center justify-between mb-16">
                <div>
                  <h3 className="text-42px font-serif text-black font-black italic uppercase tracking-tighter leading-none">PSYC_DUMP</h3>
                  <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.6em] mt-2 italic">Calibrate internal signals.</p>
                </div>
                <button onClick={() => setIsJournalOpen(false)} className="p-2 hover:bg-zinc-50 transition-colors"><X className="w-8 h-8 text-zinc-200" /></button>
              </div>
              <form onSubmit={handleSaveJournal} className="space-y-12">
                <textarea 
                  autoFocus
                  value={journalContent}
                  onChange={e => setJournalContent(e.target.value)}
                  placeholder="DUMP_STATIC..."
                  className="w-full h-72 p-10 bg-zinc-50 border border-zinc-100 focus:border-brand-orange outline-none text-black transition-all text-xl font-black italic tracking-tight resize-none leading-tight uppercase placeholder:text-zinc-100"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em]">
                    <Zap className="w-5 h-5 text-brand-orange fill-brand-orange" />
                    SYNC_LOAD {energyLevel}/5
                  </div>
                  <button type="submit" className="btn-primary px-12 py-6 text-[10px] font-black uppercase tracking-[0.4em]">COMMIT_LOG</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <SaathiChat 
        user={user} 
        googleToken={googleToken}
        habits={habits}
        tasks={tasks}
        energyLevel={energyLevel}
      />
    </div>
  );
}

function getGreeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `SYSTEMS_ONLINE, ${name.split(' ')[0]}.`;
  if (hour < 18) return `SIGNAL_ACTIVE, ${name.split(' ')[0]}.`;
  return `CALIBRATING, ${name.split(' ')[0]}.`;
}
