
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
      <div className="flex items-center justify-center min-h-screen bg-white">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-brand-orange border-t-transparent rounded-full shadow-[0_4px_10px_rgba(255,92,0,0.1)]"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4 text-center relative overflow-hidden transition-colors duration-300">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] bg-brand-orange/5 rounded-full blur-[120px]" />
          <div className="absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] bg-brand-purple/5 rounded-full blur-[120px]" />
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full saathi-card p-10 sm:p-14 shadow-2xl relative z-10 border-zinc-100"
        >
          <div className="w-24 h-24 bg-brand-orange flex items-center justify-center mx-auto mb-10 shadow-[0_10px_40px_rgba(255,92,0,0.2)]">
            <Zap className="w-12 h-12 text-white fill-white" />
          </div>
          <h1 className="text-72px font-serif text-black mb-4 italic uppercase tracking-tighter font-black">SAATHI<span className="text-brand-orange">.</span></h1>
          <p className="text-[10px] text-zinc-400 mb-12 font-black uppercase tracking-[0.5em] italic">High Performance Life Operating System</p>
          <button
            onClick={handleSignIn}
            className="btn-accent w-full py-6 flex items-center justify-center gap-4"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" />
            INITIALIZE SESSION
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white relative font-sans selection:bg-brand-orange selection:text-white">
      {/* Background Mesh - Deeper & More Vibrant */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-white overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-brand-orange/5 blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-brand-purple/5 blur-[180px]" />
      </div>

      <main className="flex-1 overflow-y-auto pb-40">
        <header className="max-w-7xl mx-auto px-8 pt-10 pb-10 border-b border-zinc-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 group">
              <motion.div 
                whileHover={{ rotate: 90 }}
                className="w-12 h-12 bg-brand-orange flex items-center justify-center shadow-[0_10px_30px_rgba(255,92,0,0.1)] group-hover:shadow-[0_15px_40px_rgba(255,92,0,0.2)] transition-all"
              >
                <Zap className="w-7 h-7 text-white fill-white" />
              </motion.div>
              <h1 className="text-36px font-serif text-black font-black italic uppercase tracking-tighter leading-none">SAATHI<span className="text-brand-orange">.</span></h1>
            </div>
            <div className="flex items-center gap-8">
              <button onClick={logOut} className="group flex items-center gap-4 py-2 text-[10px] font-black text-zinc-400 uppercase tracking-[0.5em] hover:text-black transition-all">
                TERMINATE_SESSION <div className="w-1.5 h-1.5 bg-zinc-200 group-hover:bg-brand-orange transition-all" />
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto mt-16">
          <PulseDashboard user={user} googleToken={accessToken} view={currentView} />
        </div>
      </main>

      {/* Bottom Text Menu */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-zinc-100 px-8 py-10 pb-12 flex items-center justify-center gap-24 z-50">
        {[
          { id: 'today', label: 'Telemetry' },
          { id: 'routine', label: 'Ritual' },
          { id: 'goals', label: 'Mission' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setCurrentView(tab.id as any)}
            className="relative"
          >
            <span className={`text-[11px] font-black uppercase tracking-[0.3em] transition-all duration-500 ${
              currentView === tab.id 
                ? 'text-brand-orange scale-110' 
                : 'text-zinc-300 hover:text-zinc-500'
            }`}>
              {tab.label}
            </span>
            {currentView === tab.id && (
              <motion.div
                layoutId="activeTabUnderline"
                className="absolute -bottom-2 left-0 right-0 h-[2px] bg-brand-orange rounded-full shadow-[0_4px_10px_rgba(255,92,0,0.2)]"
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

// Helper icons
const UserIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
