// Tauri 자동 업데이트 클라이언트.
//
// 호출 흐름:
//   1. 앱 마운트 후 checkForUpdates() — 조용히 백그라운드 체크
//   2. 결과 있으면 헤더에 배지 표시
//   3. 사용자가 confirm 후 applyUpdate(update, onProgress)
//   4. 다운로드 + 설치 + 자동 재시작
//
// 비-Tauri (웹) 환경에선 모두 no-op.

import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from './runtime';

/**
 * 새 버전 체크. 비-Tauri 환경 또는 실패 시 null.
 *
 * v2: check() 가 이미 `Update | null` 반환하므로 추가 .available 체크 불필요.
 */
export async function checkForUpdates(): Promise<Update | null> {
  if (!isTauri()) return null;
  try {
    return await check();
  } catch (e) {
    console.error('업데이트 확인 실패:', e);
    return null;
  }
}

/**
 * 업데이트 다운로드 + 설치 + 재시작.
 * 진행률 콜백은 contentLength 가 null 일 수 있어 (총 크기 불명) signature 에 반영.
 */
export async function applyUpdate(
  update: Update,
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? null;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
        break;
      case 'Finished':
        break;
    }
  });

  await relaunch();
}
