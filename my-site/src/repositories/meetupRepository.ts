import type {
  MeetupLedger,
  MeetupLedgerData,
  MeetupLedgerStatus,
  MeetupPublicSettlement,
  MeetupPublicSnapshot,
} from '@/types/meetup';
import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';
import {
  buildPublicSnapshot,
  computeSettlement,
  normalizeLedgerData,
} from '@/service/meetup/utils/meetupSettlement';

const TABLE = 'meetup_ledgers';

export interface MeetupLedgerUpdate {
  title: string;
  /** 시작일 */
  meetupDate: string | null;
  /** 끝일 (null = 하루) */
  meetupEndDate: string | null;
  status: MeetupLedgerStatus;
  data: MeetupLedgerData;
  /** 총무 임명 · 해제 — 최고 관리자만 넘긴다 (비관리자가 바꾸면 DB 트리거가 거부) */
  treasurerUserIds?: string[];
}

/**
 * 오프라인 모임 회계 장부 (admin 전용, RLS) + 슬러그 공개 결산 (RPC).
 *
 * 수정 계열은 `updated_at` 낙관적 잠금 — 불러온 시점의 값이 바뀌었으면 CONFLICT.
 * SDK 사용은 비밀 노트 · 플래너와 같은 선택 (af8ff4f auth lock 교착 위험을 같은 수준으로 짐).
 * raw REST 로 전환할 경우 lib/supabaseRest.ts 의 restUpdate 는 return=minimal 이라
 * 갱신 행 수를 알 수 없으므로 return=representation 변형이 필요하다.
 */
export class MeetupRepository {
  /** 공개 결산 조회 (anon 허용, RPC 경유). 없음 / 비공개 / 삭제 → null */
  static async getSettlementBySlug(slug: string): Promise<MeetupPublicSettlement | null> {
    const { data, error } = await supabase.rpc('get_meetup_settlement_by_slug', { p_slug: slug });
    if (error) throw new AppError('결산을 불러오지 못했습니다.', 'API_ERROR', error);

    const row = (data ?? [])[0];
    if (!row) return null;

    return {
      title: row.title as string,
      meetupDate: (row.meetup_date as string | null) ?? null,
      meetupEndDate: (row.meetup_end_date as string | null) ?? null,
      status: row.status as MeetupLedgerStatus,
      snapshot: (row.public_snapshot as MeetupPublicSnapshot | null) ?? null,
      updatedAt: row.updated_at as string,
    };
  }

  /** 이 회원이 총무인 (삭제되지 않은) 모임이 있는지 — 일반 회원 사이드바 메뉴 표시용. 실패하면 false */
  static async hasTreasurerLedger(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id')
      .contains('treasurer_user_ids', [userId])
      .is('deleted_at', null)
      .limit(1);

    if (error) {
      console.error('Failed to check treasurer ledgers:', error);
      return false;
    }
    return (data ?? []).length > 0;
  }

  /** 장부 목록 (삭제 제외, 모임 날짜 최신순). RLS: admin · editor = 전체, 총무 = 자기 모임 */
  static async getLedgers(): Promise<MeetupLedger[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('meetup_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw new AppError('모임 장부 목록을 불러오지 못했습니다.', 'API_ERROR', error);

    return (data ?? []).map(MeetupRepository.toLedger);
  }

  /** 삭제된 장부 목록 */
  static async getDeletedLedgers(): Promise<MeetupLedger[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw new AppError('삭제된 모임 장부를 불러오지 못했습니다.', 'API_ERROR', error);

    return (data ?? []).map(MeetupRepository.toLedger);
  }

  /** 장부 하나 (삭제된 장부는 NOT_FOUND) */
  static async getLedgerById(id: string): Promise<MeetupLedger> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new AppError('모임 장부를 불러오지 못했습니다.', 'API_ERROR', error);
    if (!data) throw new AppError('모임 장부를 찾을 수 없습니다.', 'NOT_FOUND');

    return MeetupRepository.toLedger(data);
  }

  /** 새 장부 (admin 전용). treasurerUserIds = 이 모임을 편집할 총무들. 슬러그는 DB 트리거가 생성 */
  static async createLedger(
    title: string,
    meetupDate: string | null,
    meetupEndDate: string | null,
    data: MeetupLedgerData,
    treasurerUserIds: string[],
    userId: string,
  ): Promise<MeetupLedger> {
    const period = { start: meetupDate, end: meetupEndDate };
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        title,
        meetup_date: meetupDate,
        meetup_end_date: meetupEndDate,
        data,
        treasurer_user_ids: treasurerUserIds,
        public_snapshot: buildPublicSnapshot(data, computeSettlement(data, period), period),
        created_by: userId,
      })
      .select()
      .single();

    if (error || !row) throw new AppError('모임 장부를 만들지 못했습니다.', 'API_ERROR', error);

    return MeetupRepository.toLedger(row);
  }

  /** 장부 저장. 공개 스냅샷은 공개 여부와 무관하게 항상 함께 갱신 */
  static async updateLedger(id: string, update: MeetupLedgerUpdate, loadedUpdatedAt: string): Promise<MeetupLedger> {
    const period = { start: update.meetupDate, end: update.meetupEndDate };
    const row = await MeetupRepository.lockedUpdate(
      id,
      {
        title: update.title,
        meetup_date: update.meetupDate,
        meetup_end_date: update.meetupEndDate,
        status: update.status,
        data: update.data,
        // 총무 목록은 넘긴 경우에만 갱신 (최고 관리자). 비관리자가 바꾸면 DB 트리거 meetup_ledgers_guard_bu 가 거부
        ...(update.treasurerUserIds ? { treasurer_user_ids: update.treasurerUserIds } : {}),
        public_snapshot: buildPublicSnapshot(update.data, computeSettlement(update.data, period), period),
      },
      loadedUpdatedAt,
      '*',
      '모임 장부 저장에 실패했습니다.',
    );
    return MeetupRepository.toLedger(row);
  }

  /** 공개 켜기 / 끄기. 트리거가 updated_at 을 바꾸므로 새 값을 돌려준다 */
  static async setShareEnabled(
    id: string,
    enabled: boolean,
    loadedUpdatedAt: string,
  ): Promise<{ shareEnabled: boolean; updatedAt: string }> {
    const row = await MeetupRepository.lockedUpdate(
      id,
      { share_enabled: enabled },
      loadedUpdatedAt,
      'share_enabled, updated_at',
      '공개 설정 변경에 실패했습니다.',
    );
    return { shareEnabled: row.share_enabled as boolean, updatedAt: row.updated_at as string };
  }

  /** 슬러그 재발급 — 기존 링크 즉시 무효. slug 를 null 로 갱신하면 트리거가 새로 채운다 */
  static async regenerateSlug(id: string, loadedUpdatedAt: string): Promise<{ slug: string; updatedAt: string }> {
    const row = await MeetupRepository.lockedUpdate(
      id,
      { slug: null },
      loadedUpdatedAt,
      'slug, updated_at',
      '링크 재발급에 실패했습니다.',
    );
    return { slug: row.slug as string, updatedAt: row.updated_at as string };
  }

  /** soft delete — 공개 링크도 함께 막힘 (RPC 가 삭제 장부 제외) */
  static async deleteLedger(id: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new AppError('모임 장부 삭제에 실패했습니다.', 'API_ERROR', error);
  }

  static async restoreLedger(id: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ deleted_at: null })
      .eq('id', id);

    if (error) throw new AppError('모임 장부 복원에 실패했습니다.', 'API_ERROR', error);
  }

  /**
   * `updated_at` 이 불러온 값과 같을 때만 갱신.
   * 0행이면 원인 구분: 행이 있음 → 다른 관리자가 먼저 수정 (CONFLICT) / 없음 · 삭제 · 권한 없음 → NOT_FOUND
   * (RLS 는 거부된 행을 오류 없이 0행으로 처리한다)
   */
  private static async lockedUpdate(
    id: string,
    patch: Record<string, unknown>,
    loadedUpdatedAt: string,
    columns: string,
    failMessage: string,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .eq('updated_at', loadedUpdatedAt)
      .select(columns);

    if (error) throw new AppError(failMessage, 'API_ERROR', error);
    const row = (data as unknown as Record<string, unknown>[] | null)?.[0];
    if (row) return row;

    const { data: current, error: checkError } = await supabase
      .from(TABLE)
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (checkError) throw new AppError(failMessage, 'API_ERROR', checkError);
    if (current) {
      throw new AppError('다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.', 'CONFLICT');
    }
    throw new AppError('장부를 찾을 수 없습니다. 삭제되었거나 권한이 없습니다.', 'NOT_FOUND');
  }

  private static toLedger(row: Record<string, unknown>): MeetupLedger {
    return {
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      meetupDate: (row.meetup_date as string | null) ?? null,
      meetupEndDate: (row.meetup_end_date as string | null) ?? null,
      status: row.status as MeetupLedgerStatus,
      shareEnabled: row.share_enabled as boolean,
      data: normalizeLedgerData(row.data),
      treasurerUserIds: (row.treasurer_user_ids as string[] | null) ?? [],
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      deletedAt: (row.deleted_at as string | null) ?? null,
    };
  }
}
