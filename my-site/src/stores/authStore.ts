import { create } from 'zustand';
import type { AuthUser } from '@/types/auth';
import type { Subscription } from '@supabase/supabase-js';
import { AuthRepository } from '@/repositories/authRepository';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  _subscription: Subscription | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nickname: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: () => boolean;
  canEdit: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  _subscription: null,

  initialize: async () => {
    // 중복 초기화 방지
    if (get()._subscription !== null) return;

    try {
      const user = await AuthRepository.getCurrentUser();
      set({ user, isLoading: false });

      const subscription = AuthRepository.onAuthStateChange((user) => {
        set({ user });
      });

      set({ _subscription: subscription });
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    const user = await AuthRepository.signIn(email, password);
    set({ user });
  },

  signUp: async (email: string, password: string, nickname: string) => {
    await AuthRepository.signUp(email, password, nickname);
  },

  signOut: async () => {
    await AuthRepository.signOut();
    set({ user: null });
  },

  isAdmin: () => get().user?.role === 'admin',
  canEdit: () => {
    const role = get().user?.role;
    return role === 'admin' || role === 'editor';
  },
}));
