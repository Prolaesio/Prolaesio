'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AppRole, isAppRole } from './routeRoles';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: AppRole | null;
  availableRoles: AppRole[];
  isLoading: boolean;
  signUp: (email: string, password: string, role?: AppRole) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  setUserRole: (role: AppRole) => Promise<{ error: string | null }>;
  switchRole: (role: AppRole) => Promise<{ error: string | null }>;
  refreshUserRoles: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  updateDisplayName: (fullName: string) => Promise<{ error: string | null }>;
  updateEmail: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userRole: null,
  availableRoles: [],
  isLoading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  setUserRole: async () => ({ error: null }),
  switchRole: async () => ({ error: null }),
  refreshUserRoles: async () => {},
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  updateDisplayName: async () => ({ error: null }),
  updateEmail: async () => ({ error: null }),
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRoleState] = useState<AppRole | null>(null);
  const [availableRoles, setAvailableRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const resolveUserRole = async (activeUser: User): Promise<{ active: AppRole | null; roles: AppRole[] }> => {
    const metadataRole = isAppRole(activeUser.user_metadata?.role) ? activeUser.user_metadata.role : null;
    const needsRoleSelection = activeUser.user_metadata?.needs_role_selection === true;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', activeUser.id)
      .maybeSingle();

    if (error) {
      console.error('Error resolving user role from profile:', error);
      return { active: metadataRole ?? 'player', roles: [metadataRole ?? 'player'] };
    }

    if (!profile) {
      if (metadataRole) return { active: metadataRole, roles: [metadataRole] };
      return { active: needsRoleSelection ? null : 'player', roles: needsRoleSelection ? [] : ['player'] };
    }

    const profileRole: AppRole = isAppRole(profile.role) ? profile.role : metadataRole ?? 'player';
    const { data: roleRows } = await supabase.from('user_account_roles').select('role').eq('user_id', activeUser.id).eq('status', 'active');
    const roles = Array.from(new Set([profileRole, ...(roleRows ?? []).map(row => row.role).filter(isAppRole)]));
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(`lodario-active-role:${activeUser.id}`) : null;
    return { active: isAppRole(saved) && roles.includes(saved) ? saved : profileRole, roles };
  };

  useEffect(() => {
    let isMounted = true;

    const syncSession = async (nextSession: Session | null) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setUserRoleState(null);
        setAvailableRoles([]);
        setIsLoading(false);
        return;
      }

      const resolvedRole = await resolveUserRole(nextSession.user);
      if (!isMounted) return;
      setUserRoleState(resolvedRole.active);
      setAvailableRoles(resolvedRole.roles);
      setIsLoading(false);
    };

    const getInitialSession = async () => {
      setIsLoading(true);
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      await syncSession(currentSession);
    };

    void getInitialSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setIsLoading(true);
        void syncSession(newSession);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, role?: AppRole): Promise<{ error: string | null }> => {
    const metadata: Record<string, unknown> = role
      ? { role, needs_role_selection: false }
      : { needs_role_selection: true };

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const setUserRole = async (role: AppRole): Promise<{ error: string | null }> => {
    if (!user) return { error: 'You must be signed in to choose a role.' };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          role,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      return { error: profileError.message };
    }

    const { data, error: metadataError } = await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata ?? {}),
        role,
        needs_role_selection: null,
      },
    });

    if (metadataError) {
      console.error('Error saving user role in auth metadata:', metadataError);
    }

    if (data.user) {
      setUser(data.user);
    }

    setUserRoleState(role);
    setAvailableRoles(current => Array.from(new Set([...current, role])));
    return { error: null };
  };

  const refreshUserRoles = async () => {
    if (!user) return;
    const resolved = await resolveUserRole(user);
    setAvailableRoles(resolved.roles);
    setUserRoleState(current => current && resolved.roles.includes(current) ? current : resolved.active);
  };

  const switchRole = async (role: AppRole): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Sign in to change workspace.' };
    let roles = availableRoles;
    if (!roles.includes(role)) {
      const resolved = await resolveUserRole(user);
      roles = resolved.roles;
      setAvailableRoles(roles);
    }
    if (!roles.includes(role)) return { error: 'That workspace is not available for this account.' };
    window.localStorage.setItem(`lodario-active-role:${user.id}`, role);
    setUserRoleState(role);
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRoleState(null);
    setAvailableRoles([]);
  };

  const resetPassword = async (email: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const updatePassword = async (password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const updateDisplayName = async (fullName: string): Promise<{ error: string | null }> => {
    if (!user) return { error: 'You must be signed in to update your name.' };

    const trimmedName = fullName.trim();
    if (!trimmedName) return { error: 'Name cannot be empty.' };

    const { data, error } = await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata ?? {}),
        full_name: trimmedName,
      },
    });

    if (error) return { error: error.message };
    if (data.user) setUser(data.user);
    return { error: null };
  };

  const updateEmail = async (email: string): Promise<{ error: string | null }> => {
    if (!user) return { error: 'You must be signed in to update your email.' };

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return { error: 'Email cannot be empty.' };

    const { data, error } = await supabase.auth.updateUser({ email: trimmedEmail });
    if (error) return { error: error.message };
    if (data.user) setUser(data.user);
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole,
        availableRoles,
        isLoading,
        signUp,
        signIn,
        setUserRole,
        switchRole,
        refreshUserRoles,
        signOut,
        resetPassword,
        updatePassword,
        updateDisplayName,
        updateEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
