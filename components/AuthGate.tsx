'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, User, ClipboardList } from 'lucide-react';
import { AppRole, getDefaultRouteForRole } from '@/lib/routeRoles';

interface AuthGateProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

export function AuthGate({ children, requiredRole }: AuthGateProps) {
  const { user, userRole, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-[var(--accent-primary)] border-t-transparent animate-spin" />
          <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--accent-primary)]" size={24} />
        </div>
        <p className="mt-6 text-gray-400 text-sm font-medium animate-pulse">Loading Prolaesio...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (requiredRole && userRole !== requiredRole) {
    const fallbackRoute = getDefaultRouteForRole(userRole);
    const roleLabel = requiredRole === 'coach' ? 'coach' : 'player';

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-sm">
          <div className="glass-card p-8 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-full bg-[rgba(0,212,170,0.15)] flex items-center justify-center mx-auto mb-4">
              <Shield className="text-[var(--accent-primary)]" size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Route Access</h2>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              This section is for {roleLabel} accounts.
            </p>
            <Link
              href={fallbackRoute}
              className="w-full py-3 rounded-xl text-sm font-bold text-black bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 inline-flex items-center justify-center"
            >
              Go to your workspace
            </Link>
            <button
              onClick={signOut}
              className="w-full mt-3 py-3 rounded-xl text-sm font-bold text-[var(--accent-primary)] border border-[var(--accent-primary)] hover:bg-[rgba(0,212,170,0.1)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showRoleStep, setShowRoleStep] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'coach'>('player');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || (mode !== 'forgot' && !password.trim())) {
      setError('Please fill in all required fields.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup' && !showRoleStep) {
      setShowRoleStep(true);
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signin') {
        const result = await signIn(email, password);
        if (result.error) setError(result.error);
      } else if (mode === 'signup') {
        const result = await signUp(email, password, selectedRole);
        if (result.error) {
          setError(result.error);
        } else {
          setSignUpSuccess(true);
        }
      } else if (mode === 'forgot') {
        const result = await resetPassword(email);
        if (result.error) {
          setError(result.error);
        } else {
          setResetSuccess(true);
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setSignUpSuccess(false);
    setResetSuccess(false);
    setShowRoleStep(false);
    setConfirmPassword('');
    setSelectedRole('player');
  };

  if (signUpSuccess || resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-sm">
          <div className="glass-card p-8 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-full bg-[rgba(0,212,170,0.15)] flex items-center justify-center mx-auto mb-4">
              <Mail className="text-[var(--accent-primary)]" size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check Your Email</h2>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              We&apos;ve sent a {resetSuccess ? 'password reset link' : 'confirmation link'} to <span className="text-white font-medium">{email}</span>. 
              Click the link to {resetSuccess ? 'reset your password' : 'activate your account'}.
            </p>
            <button
              onClick={() => {
                setSignUpSuccess(false);
                setResetSuccess(false);
                setMode('signin');
              }}
              className="w-full py-3 rounded-xl text-sm font-bold text-[var(--accent-primary)] border border-[var(--accent-primary)] hover:bg-[rgba(0,212,170,0.1)] transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-900/30">
            <Shield className="text-black" size={36} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Prolaesio</h1>
          <p className="text-sm text-gray-400 mt-1">Your personal training guide</p>
        </div>

        {/* Auth Card */}
        <div className="glass-card p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-white mb-1">
            {mode === 'signin' && 'Welcome Back'}
            {mode === 'signup' && (showRoleStep ? 'Choose Role' : 'Create Account')}
            {mode === 'forgot' && 'Reset Password'}
          </h2>
          <p className="text-xs text-gray-400 mb-6">
            {mode === 'signin' && 'Sign in to access your training data'}
            {mode === 'signup' && (showRoleStep ? 'Select how you will use Prolaesio' : 'Start tracking your athletic journey')}
            {mode === 'forgot' && 'Enter your email to reset your password'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && showRoleStep ? (
              <div className="space-y-3 animate-fade-in">
                <button
                  type="button"
                  onClick={() => setSelectedRole('player')}
                  className={`w-full p-4 rounded-xl border text-left flex items-center space-x-3 transition-colors ${
                    selectedRole === 'player'
                      ? 'border-[var(--accent-primary)] bg-[rgba(0,212,170,0.12)]'
                      : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] hover:border-[rgba(0,212,170,0.45)]'
                  }`}
                >
                  <User className="text-[var(--accent-primary)] flex-shrink-0" size={22} />
                  <div>
                    <p className="text-sm font-bold text-white">Player</p>
                    <p className="text-xs text-gray-400">Continue to the current training dashboard</p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled
                  className="w-full p-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-left flex items-center space-x-3 opacity-50 cursor-not-allowed"
                >
                  <ClipboardList className="text-gray-400 flex-shrink-0" size={22} />
                  <div>
                    <p className="text-sm font-bold text-white">Coach</p>
                    <p className="text-xs text-gray-400">Coming soon</p>
                  </div>
                </button>
              </div>
            ) : (
              <>
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="athlete@example.com"
                  className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl py-3 pl-10 pr-4 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl py-3 pl-10 pr-12 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {mode === 'signin' && (
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-[var(--accent-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Confirm Password (sign-up only) */}
            {mode === 'signup' && (
              <div className="animate-fade-in">
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    id="auth-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl py-3 pl-10 pr-4 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}
              </>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start space-x-2 p-3 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.2)] animate-fade-in">
                <AlertCircle className="text-[#ff6b6b] flex-shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-[#ff6b6b] leading-relaxed">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="auth-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'signup' && (showRoleStep ? 'Continue as Player' : 'Continue')}
                  {mode === 'forgot' && 'Send Reset Link'}
                  <ArrowRight className="ml-2" size={18} />
                </>
              )}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            {mode === 'forgot' ? (
              <p className="text-xs text-gray-500">
                Remember your password?
                <button
                  id="auth-toggle-mode"
                  onClick={() => setMode('signin')}
                  className="ml-1 text-[var(--accent-secondary)] font-bold hover:underline"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                <button
                  id="auth-toggle-mode"
                  onClick={showRoleStep ? () => setShowRoleStep(false) : switchMode}
                  className="ml-1 text-[var(--accent-secondary)] font-bold hover:underline"
                >
                  {mode === 'signin' ? 'Sign Up' : showRoleStep ? 'Back' : 'Sign In'}
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-600 mt-6">
          Your data is securely stored and encrypted
        </p>
      </div>
    </div>
  );
}
