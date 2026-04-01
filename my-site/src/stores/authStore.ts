import { create } from 'zustand';
import type { AuthUser } from '@/types/auth';
import { AuthRepository } from '@/repositories/authRepository';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
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

  initialize: async () => {
    try {
      const user = await AuthRepository.getCurrentUser();
      set({ user, isLoading: false });

      AuthRepository.onAuthStateChange((user) => {
        set({ user });
      });
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
