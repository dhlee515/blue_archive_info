import type { AuthUser, UserRole, UserProfile } from '@/types/auth';
import type { Subscription } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export class AuthRepository {
  /**
   * 이메일/비밀번호로 로그인합니다.
   */
  static async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    return AuthRepository.fetchAuthUser(data.user.id, data.user.email);
  }

  /**
   * 회원가입합니다. profiles 테이블에 닉네임과 pending 역할로 저장됩니다.
   */
  static async signUp(email: string, password: string, nickname: string): Promise<void> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('회원가입에 실패했습니다.');

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, nickname });

    if (profileError) throw profileError;
  }

  /**
   * 로그아웃합니다.
   */
  static async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  /**
   * 현재 로그인된 사용자를 가져옵니다.
   */
  static async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    return AuthRepository.fetchAuthUser(session.user.id, session.user.email);
  }

  /**
   * 인증 상태 변경을 구독합니다.
   */
  static onAuthStateChange(callback: (user: AuthUser | null) => void): Subscription {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }
      const authUser = await AuthRepository.fetchAuthUser(session.user.id, session.user.email);
      callback(authUser);
    });
    return subscription;
  }

  /**
   * 전체 유저 프로필 목록을 가져옵니다. (관리자용)
   */
  static async getAllUsers(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id as string,
      email: '',
      nickname: row.nickname as string,
      role: row.role as UserRole,
      createdAt: row.created_at as string,
    }));
  }

  /**
   * 유저를 비활성화합니다. (soft delete, 관리자용)
   */
  static async deactivateUser(userId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  }

  /**
   * 비활성화된 유저를 복원합니다. (관리자용)
   */
  static async reactivateUser(userId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: null })
      .eq('id', userId);

    if (error) throw error;
  }

  /**
   * 비활성화된 유저 목록을 가져옵니다. (관리자용)
   */
  static async getDeactivatedUsers(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id as string,
      email: '',
      nickname: row.nickname as string,
      role: row.role as UserRole,
      createdAt: row.created_at as string,
    }));
  }

  /**
   * 유저의 역할을 변경합니다. (관리자용)
   */
  static async updateUserRole(userId: string, role: UserRole): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) throw error;
  }

  private static async fetchAuthUser(id: string, email?: string | null): Promise<AuthUser> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, role')
      .eq('id', id)
      .single();

    return {
      id,
      email: email ?? '',
      nickname: profile?.nickname ?? '',
      role: (profile?.role as UserRole) ?? 'pending',
    };
  }
}
