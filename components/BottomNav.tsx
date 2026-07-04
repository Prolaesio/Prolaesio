'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PlusCircle, Calendar as CalendarIcon, BarChart2, User, Bot } from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Log', path: '/log', icon: PlusCircle },
    { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
    { name: 'AI', path: '/ai', icon: Bot },
    { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-4 pointer-events-none">
      <nav className="max-w-md mx-auto pointer-events-auto">
        <ul className="flex items-center justify-around bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full backdrop-blur-xl px-2 py-3 shadow-2xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            
            return (
              <li key={item.name} className="relative">
                <Link 
                  href={item.path}
                  className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${
                    isActive ? 'text-[var(--accent-primary)]' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Icon size={isActive ? 24 : 22} strokeWidth={isActive ? 2.5 : 2} className="transition-all duration-300" />
                  {isActive && (
                    <span className="absolute -bottom-1 w-1 h-1 bg-[var(--accent-primary)] rounded-full animate-fade-in" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
