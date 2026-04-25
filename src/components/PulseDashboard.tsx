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
  Calendar as CalendarIcon, 
  Clock, 
  Flame, 
  Brain,
  Plus,
  ArrowRight,
  X,
  Loader2,
  CalendarDays,
  AlertTriangle,
  Lightbulb,
  ArrowUpRight,
  Sparkles
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
  const [briefing, setBriefing] = useState<string>('');
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [journalContent, setJournalContent] = useState('');

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [driftSuggestion, setDriftSuggestion] = useState<string | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  
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

    // Fetch User Profile for Energy
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setEnergyLevel(docSnap.data().latestEnergyLevel || 3);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    // Fetch Habits
    const habitsPath = 'habits';
    const habitsQuery = query(collection(db, habitsPath), where('userId', '==', user.uid));
    const unsubHabits = onSnapshot(habitsQuery, (snap) => {
      setHabits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, habitsPath));

    // Fetch Tasks
    const tasksPath = 'tasks';
    const tasksQuery = query(collection(db, tasksPath), where('userId', '==', user.uid), where('isCompleted', '==', false));
    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, tasksPath));

    // Fetch Journals
    const journalsPath = 'journals';
    const journalsQuery = query(collection(db, journalsPath), where('userId', '==', user.uid));
    const unsubJournals = onSnapshot(journalsQuery, (snap) => {
      setJournals(snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, journalsPath));

    // Fetch Habit Logs
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

  // Fetch Calendar Events
  useEffect(() => {
    if (!googleToken) return;
    const loadCalendar = async () => {
      try {
        setCalendarError(null);
        const items = await fetchUpcomingEvents(googleToken);
        setEvents(items);
        
        // Logic: Check for drift
        if (items.length > 0) {
          const current = findCurrentEvent(items);
          if (current) {
            const end = new Date(current.end.dateTime);
            const now = new Date();
            const minutesLate = Math.floor((now.getTime() - end.getTime()) / 60000);
            
            if (minutesLate > 5) {
              const suggestion = await getDriftSuggestion(current.summary, minutesLate, habits);
              setDriftSuggestion(suggestion);
            }
          }
        }
      } catch (e: any) {
        console.error("Calendar Sync Error:", e);
        if (e.message === 'API_DISABLED') {
          setCalendarError('Google Calendar API is not enabled in your Google Cloud Project.');
        } else {
          setCalendarError('Failed to sync with Google Calendar.');
        }
      }
    };
    loadCalendar();
  }, [googleToken, habits.length]);

  // Weekly Analysis
  useEffect(() => {
    if (loading || habits.length === 0 || habitLogs.length === 0) return;
    
    let isMounted = true;
    const loadInsights = async () => {
      setIsInsightsLoading(true);
      try {
        const aiInsights = await getWeeklyAnalysis(habitLogs, habits);
        if (isMounted) {
          setInsights(aiInsights);
          setIsInsightsLoading(false);
        }
      } catch (err) {
        console.error("AI Insight Error:", err);
        if (isMounted) setIsInsightsLoading(false);
      }
    };
    
    const timer = setTimeout(loadInsights, 2000); // Debounce AI call
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [habits, habitLogs, loading]);

  useEffect(() => {
    if (loading || (habits.length === 0 && tasks.length === 0)) return;
    
    let isMounted = true;
    const fetchBriefing = async () => {
      setIsBriefingLoading(true);
      try {
        const text = await getSaathiBriefing(habits, tasks, energyLevel, journals);
        if (isMounted) {
          setBriefing(text);
          setIsBriefingLoading(false);
        }
      } catch (err) {
        console.error("Briefing Error:", err);
        if (isMounted) setIsBriefingLoading(false);
      }
    };

    const timer = setTimeout(fetchBriefing, 1500); // Debounce
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [habits.length, tasks.length, energyLevel, loading, journals.length]);

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
      // Simple streak increment for demo
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
    const total = habits.length + tasks.length;
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    const habitsCompletedToday = habitLogs.filter(l => 
      l.loggedAt && new Date((l.loggedAt as Timestamp).toDate()).toDateString() === new Date().toDateString()
    ).length;
    const habitsLimitedProgress = Math.min(habitsCompletedToday, habits.length);
    return total > 0 ? Math.round(((completedTasks + habitsLimitedProgress) / total) * 100) : 0;
  };

  const [todayBriefing, setTodayBriefing] = useState<string | null>(null);
  const [isTodayBriefingLoading, setIsTodayBriefingLoading] = useState(false);

  useEffect(() => {
    const fetchTodayBriefing = async () => {
      // Show report if there is some activity
      if (habits.length > 0 || tasks.length > 0 || events.length > 0) {
        setIsTodayBriefingLoading(true);
        try {
          const briefing = await getTodayBriefing(habits, habitLogs, tasks, events, energyLevel);
          setTodayBriefing(briefing);
        } catch (error) {
          console.error("Briefing Error:", error);
        } finally {
          setIsTodayBriefingLoading(false);
        }
      }
    };
    fetchTodayBriefing();
  }, [habits, habitLogs, tasks, events, energyLevel]);

  if (view === 'routine') {
    return (
      <div className="max-w-4xl mx-auto space-y-12 pb-32">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-8 h-8 text-orange-500" />
            <h1 className="text-4xl font-bold tracking-tighter text-zinc-900 dark:text-white font-display">Your Daily Habits</h1>
          </div>
          <button 
            onClick={() => setIsHabitModalOpen(true)}
            className="text-xs font-bold text-white bg-indigo-600 px-6 py-3 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
          >
            Start a new habit
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {habits.map((habit) => (
            <motion.div
              key={`habit-routine-${habit.id}`}
              className="p-8 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-[32px] group relative"
            >
              <div className="flex flex-col h-full gap-4">
                <div className="flex items-center justify-between">
                   <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center">
                     <Flame className="w-6 h-6 text-orange-500" />
                   </div>
                   <div className="text-right">
                     <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Streak</p>
                     <p className="text-2xl font-bold text-orange-500 font-display">{habit.streak}</p>
                   </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold dark:text-white mb-2">{habit.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Clock className="w-4 h-4" />
                    <span>Target: {habit.targetTime || 'Flexible'}</span>
                  </div>
                </div>
                <button 
                  onClick={() => logHabit(habit)}
                  className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-2xl text-sm font-bold shadow-lg transition-all"
                >
                  Check In
                </button>
              </div>
            </motion.div>
          ))}
        </div>
        {habits.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-zinc-200 dark:border-white/5 rounded-[48px]">
            <p className="text-zinc-500 italic">No habits in your routine yet. Define your pillars.</p>
          </div>
        )}
      </div>
    );
  }

  if (view === 'goals') {
    return (
      <div className="max-w-4xl mx-auto space-y-12 pb-32">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-8 h-8 text-indigo-500" />
            <h1 className="text-4xl font-bold tracking-tighter text-zinc-900 dark:text-white font-display">Special Goals</h1>
          </div>
          <button 
            onClick={() => setIsTaskModalOpen(true)}
            className="text-xs font-bold text-white bg-indigo-600 px-6 py-3 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
          >
            Add a goal
          </button>
        </div>
        <div className="space-y-4">
          {tasks.map((task) => (
            <motion.div
              key={`goal-task-${task.id}`}
              className="p-6 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-[32px] flex items-center justify-between gap-6"
            >
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => toggleTask(task)}
                  className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all ${
                    task.isCompleted ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-200 dark:border-white/10'
                  }`}
                >
                  <CheckCircle2 className={`w-6 h-6 ${task.isCompleted ? 'text-white' : 'text-zinc-300'}`} />
                </button>
                <div>
                  <h3 className={`text-xl font-bold ${task.isCompleted ? 'text-zinc-400 line-through' : 'dark:text-white'}`}>{task.title}</h3>
                  <p className="text-sm text-zinc-500">Energy Requirement: {task.energyRequired}/5</p>
                </div>
              </div>
              <div className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
                task.energyRequired >= 4 ? 'bg-red-500/10 text-red-500' : 
                task.energyRequired <= 2 ? 'bg-emerald-500/10 text-emerald-500' : 
                'bg-indigo-500/10 text-indigo-500'
              }`}>
                {task.energyRequired >= 4 ? 'High Energy' : task.energyRequired <= 2 ? 'Low Energy' : 'Balanced'}
              </div>
            </motion.div>
          ))}
          {tasks.length === 0 && (
            <div className="py-20 text-center border-2 border-dashed border-zinc-200 dark:border-white/5 rounded-[48px]">
              <p className="text-zinc-500 italic">No active goals. What's your next intention?</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32">
       {/* Background Aesthetics */}
       <div className="fixed inset-0 pointer-events-none -z-10 bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-500/5 blur-[120px]" />
       </div>
      {/* Anchor Drift Notif */}
      <AnimatePresence>
        {driftSuggestion && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-4 rounded-3xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 text-white p-2 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Anchor Drift Detected</p>
                  <p className="text-xs text-amber-800/80 dark:text-amber-200/60">{driftSuggestion}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDriftSuggestion(null)}
                  className="px-4 py-2 bg-amber-500 text-white text-[10px] font-bold rounded-xl hover:bg-amber-600 transition-colors"
                >
                  Push Schedule 30m
                </button>
                <button 
                  onClick={() => setDriftSuggestion(null)}
                  className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Energy Check-in */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-zinc-200 dark:border-white/5">
        <div className="space-y-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tighter text-zinc-900 dark:text-white font-display">
              Today's Journey
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex -space-x-2">
                {[1,2,3].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-950 bg-zinc-200 dark:bg-zinc-800" />
                ))}
             </div>
             <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-100 dark:bg-white/5 px-3 py-1 rounded-full">
               7 Users Pulse Shared
             </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
             <p className="text-[10px] font-bold uppercase tracking-tighter text-indigo-500 mb-1">Your Progress Today</p>
             <div className="flex items-center gap-2">
                <div className="h-2 w-32 bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden">
                   <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${calculateProgress()}%` }}
                    className="h-full bg-indigo-600" 
                   />
                </div>
                <span className="text-sm font-bold dark:text-white">{calculateProgress()}%</span>
             </div>
          </div>
          
          <div className="bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-2 rounded-2xl flex items-center gap-4 shadow-sm">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => updateEnergy(lvl)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all text-sm font-bold ${
                    energyLevel === lvl 
                      ? 'bg-indigo-600 text-white' 
                      : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Today So Far Analysis */}
      <AnimatePresence>
        {todayBriefing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 rounded-[32px] relative overflow-hidden group"
          >
            <div className="flex items-start gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20">
                {isTodayBriefingLoading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-widest">Today So Far</h3>
                  <span className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500/60 uppercase px-2 py-0.5 bg-indigo-100/50 dark:bg-white/5 rounded-full">Saathi Analysis</span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium italic">
                  "{todayBriefing}"
                </p>
              </div>
            </div>
            {/* Abstract Background Element */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-600/5 dark:bg-indigo-400/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Day Stream (Timeline) */}
      <section className="space-y-6">
         <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-display dark:text-white flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-zinc-400" />
              Your Path Today
            </h2>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">A Friend's Look Ahead</span>
         </div>
         <div className="space-y-2 relative">
            <div className="absolute left-4 top-4 bottom-4 w-px bg-zinc-100 dark:bg-white/5" />
            
            {calendarError && (
               <div className="relative pl-12 py-3">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 ring-4 ring-white dark:ring-zinc-950 shadow-sm" />
                  <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl">
                     <p className="text-xs text-red-600 dark:text-red-400 font-medium">{calendarError}</p>
                     <a 
                      href="https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview" 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-[10px] font-bold text-red-700 dark:text-red-300 underline mt-1 inline-block"
                     >
                       Enable API in Console
                     </a>
                  </div>
               </div>
            )}
            {events.length === 0 && googleToken && !calendarError && (
               <div className="relative pl-12 py-3">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-zinc-300 ring-4 ring-white dark:ring-zinc-950 shadow-sm" />
                  <div className="p-4 bg-white dark:bg-white/5 border border-zinc-100 dark:border-white/10 rounded-2xl flex items-center justify-between">
                     <span className="text-xs text-zinc-400 italic">No plan items found for today. Check your Google Calendar to add some.</span>
                  </div>
               </div>
            )}
            {events.slice(0, 5).map((event, idx) => (
              <div key={event.id || `event-idx-${idx}`} className="relative pl-12 py-3 group">
                 <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-zinc-950 shadow-sm" />
                 <div className="p-4 bg-white dark:bg-white/5 border border-zinc-100 dark:border-white/10 rounded-2xl flex items-center justify-between hover:border-indigo-500/50 transition-colors cursor-pointer">
                    <div className="flex flex-col">
                       <span className="text-xs font-bold dark:text-zinc-200">{event.summary}</span>
                       <span className="text-[10px] text-zinc-400 uppercase tracking-tighter">
                         {new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </span>
                    </div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">Calendar Item</div>
                 </div>
              </div>
            ))}

            {habits.slice(0, 5).map((habit, idx) => (
              <div key={`timeline-habit-${habit.id || `idx-${idx}`}`} className="relative pl-12 py-3 group">
                 <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-500 ring-4 ring-white dark:ring-zinc-950 shadow-sm" />
                 <div className="p-4 bg-white dark:bg-white/5 border border-zinc-100 dark:border-white/10 rounded-2xl flex items-center justify-between hover:border-orange-500/50 transition-colors">
                    <div className="flex flex-col">
                       <span className="text-xs font-bold dark:text-zinc-200">{habit.name}</span>
                       <span className="text-[10px] text-zinc-400 uppercase tracking-tighter">Anchor: {habit.targetTime || 'Flex'}</span>
                    </div>
                    <button onClick={() => logHabit(habit)} className="text-[10px] font-bold text-orange-500 hover:bg-orange-500 hover:text-white px-3 py-1 rounded-lg transition-colors border border-orange-500/20">Check In</button>
                 </div>
              </div>
            ))}
         </div>
      </section>

      {/* Activity Heatmap - Simplified GitHub style */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[40px] p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold dark:text-white">Your Consistency Map</h2>
            <p className="text-xs text-zinc-500">Every small step is a dot of progress.</p>
          </div>
          <div className="flex items-center gap-1">
             <div className="w-2 h-2 rounded-sm bg-zinc-100 dark:bg-white/5" />
             <div className="w-2 h-2 rounded-sm bg-indigo-200" />
             <div className="w-2 h-2 rounded-sm bg-indigo-400" />
             <div className="w-2 h-2 rounded-sm bg-indigo-600" />
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-none">
          {Array.from({ length: 30 }).map((_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            const logsToday = habitLogs.filter(l => 
              l.loggedAt && new Date((l.loggedAt as Timestamp).toDate()).toDateString() === date.toDateString()
            ).length;
            
            let color = 'bg-zinc-100 dark:bg-white/5';
            if (logsToday === 1) color = 'bg-indigo-300';
            if (logsToday === 2) color = 'bg-indigo-500';
            if (logsToday >= 3) color = 'bg-indigo-700';

            return (
              <div 
                key={`heatmap-day-${i}-${date.getTime()}`} 
                className={`w-4 h-4 rounded-sm shrink-0 ${color} transition-colors cursor-help`}
                title={`${date.toDateString()}: ${logsToday} habits completed`}
              />
            );
          })}
        </div>
      </section>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Habits Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <h2 className="text-xl font-bold dark:text-white">Daily Anchors</h2>
            </div>
            <button 
              onClick={() => setIsHabitModalOpen(true)}
              className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Habit
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {habits.map((habit) => (
              <motion.div
                key={`habit-card-${habit.id}`}
                whileHover={{ y: -4 }}
                className="p-5 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-[32px] group relative overflow-hidden"
              >
                 <div className="absolute top-0 right-0 p-4">
                   <div className="flex items-center gap-1 text-orange-500">
                     <Flame className="w-3 h-3" />
                     <span className="text-xs font-bold">{habit.streak}</span>
                   </div>
                 </div>
                 
                 <div className="flex flex-col h-full justify-between gap-4">
                   <div>
                    <h3 className="font-bold text-zinc-900 dark:text-white mb-1 leading-tight">{habit.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="w-3 h-3" />
                      <span>{habit.targetTime || 'Anytime'}</span>
                    </div>
                   </div>

                   <button 
                    onClick={() => logHabit(habit)}
                    className="w-full py-3 bg-zinc-50 dark:bg-white/5 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-zinc-600 dark:text-zinc-400 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 group-hover:border-indigo-600"
                   >
                     <CheckCircle2 className="w-4 h-4" /> Log Session
                   </button>
                 </div>
              </motion.div>
            ))}
            {habits.length === 0 && !loading && (
              <div className="col-span-full py-12 border-2 border-dashed border-zinc-200 dark:border-white/5 rounded-[40px] flex flex-col items-center justify-center text-zinc-400 italic text-sm">
                No habits set yet. Start by adding your first daily anchor.
              </div>
            )}
          </div>
        </div>

        {/* Tasks/Gemini Column */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-500" />
              <h2 className="text-xl font-bold dark:text-white">Smart Focus</h2>
            </div>
            <button 
              onClick={() => setIsTaskModalOpen(true)}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full text-zinc-400 hover:text-indigo-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-fuchsia-600 p-6 rounded-[40px] text-white shadow-2xl shadow-indigo-500/20 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold">Saathi Briefing</h3>
                {isBriefingLoading && <Loader2 className="w-4 h-4 animate-spin opacity-50" />}
              </div>
              <p className="text-xs opacity-90 leading-relaxed mb-4 min-h-[3em]">
                {briefing || (isBriefingLoading ? "Consulting your pulse..." : "Set a habit or task to get your first briefing.")}
              </p>
              <button 
                onClick={() => setIsJournalOpen(true)}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
              >
                Journal Reflection <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {/* Subtle background brain icon */}
            <Brain className="absolute -bottom-4 -right-4 w-24 h-24 text-white/10 rotate-12" />
          </div>

          {/* Weekly Insights */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[32px] p-6 shadow-sm overflow-hidden relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold dark:text-white">Friend's Thoughts</h3>
              </div>
              {isInsightsLoading && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
            </div>
            <div className="space-y-4">
              {insights.map((insight, i) => (
                <div key={`insight-${i}`} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed">{insight}</p>
                </div>
              ))}
              {insights.length === 0 && !isInsightsLoading && (
                <p className="text-[10px] text-zinc-400 italic">I'll have more thoughts for you as we walk together longer...</p>
              )}
            </div>
            {/* Calendar Status */}
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-white/5">
              <div className="flex items-center justify-between group cursor-help">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] font-bold dark:text-zinc-500 uppercase tracking-tighter">
                    {googleToken ? 'Calendar Synced' : 'Sync Offline'}
                  </span>
                </div>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowUpRight className="w-3 h-3 text-zinc-400" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {tasks.map((task, idx) => (
              <div key={`task-list-${task.id || `idx-${idx}`}`} className="p-4 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl flex items-center justify-between group">
                 <div className="flex items-center gap-3">
                  <button 
                    onClick={() => toggleTask(task)}
                    className="w-5 h-5 rounded-md border-2 border-zinc-200 dark:border-white/10 flex items-center justify-center hover:border-indigo-500 transition-colors"
                  >
                    <div className={`w-2.5 h-2.5 bg-indigo-500 rounded-sm transition-all ${task.isCompleted ? 'opacity-100' : 'opacity-0'}`} />
                  </button>
                  <span className={`text-sm font-medium transition-all ${task.isCompleted ? 'text-zinc-400 line-through' : 'dark:text-zinc-200'}`}>
                    {task.title}
                  </span>
                </div>
                <div className={`text-[10px] px-2 py-1 rounded-md font-bold ${
                  task.energyRequired >= 4 ? 'bg-red-100 text-red-600' : 
                  task.energyRequired <= 2 ? 'bg-emerald-100 text-emerald-600' : 
                  'bg-indigo-100 text-indigo-600'
                }`}>
                  {task.energyRequired >= 4 ? 'HIGH' : task.energyRequired <= 2 ? 'LOW' : 'MID'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isHabitModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsHabitModalOpen(false)} className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200 dark:border-white/10 p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold dark:text-white">New Daily Anchor</h3>
                <button onClick={() => setIsHabitModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-400" /></button>
              </div>
              <form onSubmit={handleAddHabit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">Habit Name</label>
                  <input autoFocus value={newHabit.name} onChange={e => setNewHabit({...newHabit, name: e.target.value})} placeholder="e.g., Early Morning Meditation" className="w-full p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">Target Time</label>
                    <input type="time" value={newHabit.targetTime} onChange={e => setNewHabit({...newHabit, targetTime: e.target.value})} className="w-full p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">Frequency</label>
                    <select value={newHabit.frequency} onChange={e => setNewHabit({...newHabit, frequency: e.target.value as HabitFrequency})} className="w-full p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white text-sm appearance-none">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all">Establish Anchor</button>
              </form>
            </motion.div>
          </div>
        )}

        {isTaskModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsTaskModalOpen(false)} className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200 dark:border-white/10 p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold dark:text-white">Smart Focus Task</h3>
                <button onClick={() => setIsTaskModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-400" /></button>
              </div>
              <form onSubmit={handleAddTask} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">Task Title</label>
                  <input autoFocus value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="e.g., Draft Launch Spec" className="w-full p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">Energy Required (1-5)</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(lvl => (
                      <button type="button" key={lvl} onClick={() => setNewTask({...newTask, energyRequired: lvl})} className={`flex-1 p-3 rounded-xl font-bold transition-all ${newTask.energyRequired === lvl ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400'}`}>
                        {lvl === 1 ? 'L' : lvl === 5 ? 'H' : lvl}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold shadow-lg shadow-zinc-900/10 dark:shadow-white/10 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all">Schedule Focus</button>
              </form>
            </motion.div>
          </div>
        )}

        {isJournalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsJournalOpen(false)} className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200 dark:border-white/10 p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold dark:text-white">Mind Dump</h3>
                  <p className="text-xs text-zinc-500">Saathi listens. Record your current state.</p>
                </div>
                <button onClick={() => setIsJournalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-400" /></button>
              </div>
              <form onSubmit={handleSaveJournal} className="space-y-6">
                <textarea 
                  autoFocus
                  value={journalContent}
                  onChange={e => setJournalContent(e.target.value)}
                  placeholder="How's the signal today? Any internal static?"
                  className="w-full h-40 p-6 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-3xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white text-sm resize-none"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <Zap className="w-3 h-3" />
                    Attaching {energyLevel}/5 Energy
                  </div>
                  <button type="submit" className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20">Reflect</button>
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
