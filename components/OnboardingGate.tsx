'use client';

import React from 'react';
import { useData } from '@/lib/DataContext';
import { Shield } from 'lucide-react';
import { OnboardingFlow } from './OnboardingFlow';

interface OnboardingGateProps {
  children: React.ReactNode;
}

/**
 * Gates the main app behind the guided onboarding flow.
 *
 * A user is considered "onboarded" when their profile exists and
 * `onboardingCompleted` is true. Existing users were backfilled to true in
 * the migration, so this only intercepts new sign-ups.
 */
export function OnboardingGate({ children }: OnboardingGateProps) {
  const { profile, isLoading } = useData();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-[var(--accent-primary)] border-t-transparent animate-spin" />
          <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--accent-primary)]" size={24} />
        </div>
        <p className="mt-6 text-gray-400 text-sm font-medium animate-pulse">Loading your profile...</p>
      </div>
    );
  }

  // No profile row yet OR profile exists but onboarding flag is not set.
  if (!profile || !profile.onboardingCompleted) {
    return <OnboardingFlow />;
  }

  return <>{children}</>;
}
