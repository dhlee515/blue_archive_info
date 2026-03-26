// API 통신 유틸리티
import type { ApiResponse } from '@/types';
import { AppError } from './AppError';

/** 기본 API 베이스 URL */
const BASE_URL = '/api';

/**
 * 제네릭 GET 요청 래퍼
 * @param endpoint - 요청 엔드포인트 경로
 */
export async function fetchData<T>(endpoint: string): Promise<ApiResponse<T>> {
  throw new AppError(`Not implemented: fetchData(${endpoint})`, 'NOT_IMPLEMENTED');
}

/**
 * 제네릭 POST 요청 래퍼
 * @param endpoint - 요청 엔드포인트 경로
 * @param body - 요청 바디 데이터
 */
export async function postData<T, B>(endpoint: string, body: B): Promise<ApiResponse<T>> {
  throw new AppError(`Not implemented: postData(${endpoint})`, 'NOT_IMPLEMENTED');
}

export { BASE_URL };
