
import React, { useState, useEffect } from 'react';
import { auth, db, signIn, logOut, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User, GoogleAuthProvider } from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDoc,
} from 'firebase/firestore';
import { 
  Plus, 
  LogOut, 
  LayoutDashboard, 
  Zap,
  Flame,
  Brain,
  Menu,
  X,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components
import PulseDashboard from './components/PulseDashboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('google_access_token'));
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'today' | 'routine' | 'goals'>('today');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleSignIn = async () => {
    try {
      const result = await signIn();
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        localStorage.setItem('google_access_token', credential.accessToken);
      }
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              email: currentUser.email,
              photoURL: currentUser.photoURL,
              latestEnergyLevel: 3,
              calendarSyncEnabled: true,
              createdAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 p-4 text-center relative overflow-hidden transition-colors duration-300">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] bg-indigo-600/10 dark:bg-indigo-600/20 rounded-full blur-[120px]" />
          <div className="absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] bg-fuchsia-600/10 dark:bg-fuchsia-600/20 rounded-full blur-[120px]" />
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-zinc-50/50 dark:bg-white/5 backdrop-blur-2xl p-8 sm:p-12 rounded-[56px] shadow-2xl border border-zinc-200 dark:border-white/10 relative z-10"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-[34px] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-indigo-500/30 transform -rotate-6">
            <Brain className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold font-display text-zinc-900 dark:text-white mb-4">Saathi</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-12 text-lg leading-relaxed">Your supportive friend helping you manage your day, habits, and tasks with care.</p>
          <button
            onClick={handleSignIn}
            className="w-full py-5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-3xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-4 text-lg shadow-xl"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-6 h-6" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden transition-colors duration-300">
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed lg:static inset-y-0 left-0 w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-white/5 flex flex-col z-50 transition-all duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-8 shrink-0">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-zinc-900 dark:text-white font-display">Saathi</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
              <X className="w-6 h-6 text-zinc-500" />
            </button>
          </div>

          <nav className="space-y-2">
            <button 
              onClick={() => { setCurrentView('today'); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                currentView === 'today' 
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-indigo-500/10' 
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Today</span>
            </button>
            <button 
              onClick={() => { setCurrentView('routine'); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                currentView === 'routine' 
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-indigo-500/10' 
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5'
              }`}
            >
              <Flame className="w-5 h-5" />
              <span>Routine</span>
            </button>
            <button 
              onClick={() => { setCurrentView('goals'); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                currentView === 'goals' 
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-indigo-500/10' 
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5'
              }`}
            >
              <Zap className="w-5 h-5" />
              <span>Goals</span>
            </button>
          </nav>
        </div>

        <div className="p-6 mt-auto">
          <div className="flex items-center gap-2">
            <button onClick={logOut} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-zinc-500 hover:text-red-500 transition-all font-bold text-sm">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
            <button onClick={toggleTheme} className="p-3 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative">
        <div className="lg:hidden flex items-center justify-between p-6 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-white/5 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-zinc-900 dark:text-white font-display">Saathi</span>
          </div>
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-zinc-500" />
          </button>
        </div>

        <div className="p-6 md:p-12 max-w-7xl mx-auto">
          <PulseDashboard user={user} googleToken={accessToken} view={currentView} />
        </div>
      </main>
    </div>
  );
}
