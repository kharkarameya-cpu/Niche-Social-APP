'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart, Map, Search, User, MessageCircle } from 'lucide-react';
import ThemeToggle from '@/app/components/ThemeToggle';
import LikeNotificationPopup from '@/app/components/LikeNotificationPopup';
import Dock from '@/components/Dock';
import Silk from '@/components/Silk';

const NAV = [
  { href: '/cards', icon: Heart, label: 'Discover' },
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/map', icon: Map, label: 'Events' },
  { href: '/search', icon: Search, label: 'Search' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [checkingSession, setCheckingSession] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  useEffect(() => {
    const validateSession = async () => {
      const token = localStorage.getItem('auth_token');

      if (!token) {
        router.replace('/auth');
        return;
      }

      // Render immediately, then validate in background to avoid blocking UI.
      setCheckingSession(false);

      const now = Date.now();
      const lastCheckRaw = sessionStorage.getItem('last_session_check_ms');
      const lastCheck = lastCheckRaw ? Number(lastCheckRaw) : 0;

      // Throttle DB validation checks to avoid performance overhead on each navigation.
      if (lastCheck && now - lastCheck < 600000) {
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);

        const response = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 200) {
          sessionStorage.setItem('last_session_check_ms', String(now));
          return;
        }

        if (response.status === 403) {
          router.replace('/auth/verify');
          return;
        }

        localStorage.removeItem('auth_token');
        document.cookie = 'auth_token=; path=/; max-age=0';
        router.replace('/auth');
      } catch {
        // Fail open for transient network issues/timeouts to keep UX responsive.
      }
    };

    validateSession();
  }, [router]);

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setIsDarkTheme(root.classList.contains('dark'));

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-zinc-50 via-white to-rose-50 dark:from-black dark:via-zinc-950 dark:to-zinc-900 overflow-hidden relative">
      <div className="fixed inset-0 z-0 opacity-60 dark:opacity-45 pointer-events-none">
        <Silk
          speed={3.4}
          scale={0.95}
          color={isDarkTheme ? '#7c3aed' : '#1e3a8a'}
          noiseIntensity={1.1}
          rotation={0.12}
        />
      </div>
      <div className="w-full relative h-full flex flex-col z-10">
        <motion.header
          initial={reduceMotion ? undefined : { y: -8, opacity: 0 }}
          animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="sticky top-0 z-40 py-4 backdrop-blur bg-white/70 dark:bg-black/40 border-b border-gray-100 dark:border-gray-800 px-4 sm:px-6 lg:px-8"
        >
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold text-black dark:text-white">Niche</p>
            <ThemeToggle />
          </div>
        </motion.header>
        <main className="flex-1 pb-20 overflow-y-auto w-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={reduceMotion ? undefined : { opacity: 0, y: 6, scale: 0.995 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -3, scale: 0.995 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <LikeNotificationPopup />
        <BottomNav />
      </div>
    </div>
  );
}

function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const dockItems = NAV.map(({ href, icon: Icon, label }) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return {
      label,
      onClick: () => router.push(href),
      className: active ? 'dock-item-active' : '',
      icon: (
        <Icon
          className={`w-5 h-5 transition-colors ${active ? 'text-rose-500' : 'text-gray-500 dark:text-gray-300'}`}
          fill={active && href === '/cards' ? 'currentColor' : 'none'}
        />
      ),
    };
  });

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-transparent backdrop-blur-sm border-t border-white/10 dark:border-white/5 z-50">
      <div className="py-1 px-2 flex justify-center overflow-x-auto no-scrollbar">
        <Dock
          items={dockItems}
          panelHeight={62}
          dockHeight={220}
          baseItemSize={46}
          magnification={64}
          distance={160}
          spring={{ mass: 0.14, stiffness: 170, damping: 14 }}
        />
      </div>
    </nav>
  );
}
