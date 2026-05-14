# 데스크탑 앱 — 육성 플래너 로컬 클라이언트

> 작성일: 2026-05-07
>
> **목적** : 웹 사이트의 육성 플래너 / 재화 인벤토리를 데스크탑 환경에서도 사용 가능하게 하고, 향후 인벤토리 OCR(스크린샷 자동 입력) 같은 로컬 기능 확장의 기반을 마련.
>
> **요점** : **Tauri 2.x** + 기존 React 앱 재사용. 로그인 / 클라우드(supabase) ↔ 로컬(파일시스템) 모드 양방향 지원. 명시적 동기화 (자동 sync 없음).
>
> **버전 고정**: Tauri 2.x (2024년 정식 릴리스). plugin / capability 시스템 / 명령어 모두 v2 기준. v1 가이드를 참고하지 말 것.

---

## 1. 배경 / 동기

현 웹앱(`my-site`) 의 육성 플래너는 다음을 제공:
- 학생별 목표치 설정 (레벨 / 장비 / 무기 / 잠재력 / 스킬)
- 재화 인벤토리 입력 + 부족분 계산
- 클라우드 (Supabase) 또는 게스트 (localStorage) 저장
- JSON 백업 / 복원

발생한 새 요구:
1. **인벤토리 자동 입력 (OCR)** — 게임 캡처 이미지에서 아이템 + 수량 인식. 웹 환경에선 [LLM Vision API 비용/인프라](#) 또는 [Tesseract.js 의 한글 한계](#) 가 걸림.
2. **로컬에서도 로그인 + 동기화** — 사용자가 로컬 클라이언트에서 로그인 시 원격 데이터를 끌어오고, 비로그인 시 로컬에 저장.

데스크탑 앱은 두 요구를 자연스럽게 합칠 수 있는 환경:
- 파일시스템 직접 접근 → 캡처 이미지 일괄 처리
- 네이티브 OCR / Python 등 외부 도구 호출 가능
- 비용 0 (전부 로컬)
- 웹앱 코드 90%+ 재사용

---

## 2. 목표 / 비목표

### 목표 (in-scope)
- [x] 데스크탑 (Win / Mac / Linux) 에서 동작하는 네이티브 앱
- [x] 현 웹앱과 동일한 UI / UX (그대로 포팅)
- [x] Supabase 인증 (이메일+패스워드 또는 매직링크) 사용
- [x] 로그인 시 클라우드 모드 (Supabase 직접 read/write)
- [x] 비로그인 시 로컬 모드 (파일시스템 JSON)
- [x] 명시적 동기화 — "클라우드 → 로컬" / "로컬 → 클라우드" 단방향 push/pull 버튼
- [x] 기존 backup JSON 형식 그대로 호환 (웹↔데스크탑 양방향 import/export)
- [x] (Phase 3) 인벤토리 화면 캡처 이미지 OCR → 자동 입력

### 비목표 (out-of-scope)
- ❌ 자동 양방향 sync (충돌 처리 복잡, MVP 에선 수동)
- ❌ 모바일 (iOS/Android) — Tauri Mobile 은 미성숙. 현재는 데스크탑만
- ❌ 오프라인 큐 / 변경사항 누적 후 일괄 동기화
- ❌ 멀티 계정 동시 로그인
- ❌ 클라우드 데이터 실시간 watch (Supabase Realtime)
- ❌ 게임 클라이언트와 직접 통신 (메모리 읽기 등)

---

## 3. 현재 상태와 재사용 자산

### 활용 가능한 기존 코드
| 자산 | 위치 | 재사용도 |
|---|---|---|
| React UI 컴포넌트 (전체) | `my-site/src/service/planner/` | 100% |
| 계산기 / 유틸 | `my-site/src/service/planner/utils/` | 100% |
| `PlannerRepo` 팩토리 인터페이스 | `my-site/src/service/planner/utils/plannerRepoFactory.ts` | 100% |
| `LocalPlannerRepository` (localStorage) | `my-site/src/repositories/localPlannerRepository.ts` | **인터페이스 유지, 백엔드만 교체** |
| `PlannerRepository` (Supabase) | `my-site/src/repositories/plannerRepository.ts` | 100% |
| Supabase 클라이언트 | `my-site/src/lib/supabase.ts` | 100% |
| 인증 store | `my-site/src/stores/authStore.ts` | 100% |
| 백업 import/export | `my-site/src/service/planner/utils/plannerBackup.ts` | 100% |
| TypeScript 타입 | `my-site/src/types/` | 100% |
| Tailwind 스타일 | `my-site/src/styles/` | 100% |

### 새로 작성할 부분
| 컴포넌트 | 역할 |
|---|---|
| Tauri 셸 (`src-tauri/`) | Rust 진입점, 윈도우 설정, 명령 정의 |
| 파일시스템 백엔드 어댑터 | `LocalPlannerRepository` 의 백엔드를 localStorage → 파일시스템으로 교체 |
| 동기화 UI | 클라우드 ↔ 로컬 push/pull 버튼 + 진행/충돌 안내 |
| 모드 표시 헤더 배지 | 현재 모드 (클라우드 / 로컬) 시각 표시 |
| (Phase 3) OCR 명령 | Rust → Python 외부 호출, 결과 JSON 파싱 |
| (Phase 3) OCR 결과 미리보기 / 적용 UI | React 컴포넌트 |

---

## 4. 아키텍처

### 4.1 스택
```
┌─────────────────────────────────────────────┐
│ Tauri 2.x WebView (OS 네이티브 webview)     │
│  ├─ React 19 (현 웹앱 그대로)               │
│  ├─ TypeScript / Tailwind / Vite            │
│  └─ Supabase JS SDK (인증 + REST)           │
│         ↑ ↓ Tauri IPC (invoke)              │
└─────────────────────────────────────────────┘
       ↓ Tauri command 호출 시
┌─────────────────────────────────────────────┐
│ Tauri 2 Backend (Rust)                      │
│  ├─ tauri-plugin-store v2 (JSON 영속화)     │
│  ├─ tauri-plugin-fs v2 (파일 R/W, Phase 3)  │
│  ├─ tauri-plugin-shell v2 (외부 프로세스)   │
│  └─ 사용자 정의 commands                    │
│      └─ ocr_import(images) -> JSON          │
│         (Phase 3에서 PaddleOCR Python 호출) │
└─────────────────────────────────────────────┘
       ↓ WebView native fetch (CSP connect-src 에 등록된 도메인만)
┌─────────────────────────────────────────────┐
│ Supabase (변경 없음)                        │
│  ├─ Auth                                    │
│  ├─ planner_students (RLS by user_id)       │
│  └─ planner_inventory (RLS by user_id)      │
└─────────────────────────────────────────────┘
```

**참고**: Supabase 호출은 WebView 의 native `fetch()` 사용 (Supabase JS SDK). CSP `connect-src` 로 제어. `tauri-plugin-http` 는 별도 API 로, 현 계획에선 미사용.

### 4.2 레이어 분리
- **Presentation (React)** — 변경 없음 (분기 1~2곳 제외)
- **Repository 추상 (`PlannerRepo` 인터페이스)** — 변경 없음
- **Repository 구현**
  - 클라우드: `PlannerRepository` (Supabase) — 변경 없음
  - 로컬: `LocalPlannerRepository` 의 백엔드 교체
    - 현재 (웹): `localStorage`
    - 데스크탑: Tauri Store API (`@tauri-apps/plugin-store`)
- **인증** — Supabase JS SDK (변경 없음)
- **데스크탑 전용 기능** — Tauri commands (`invoke()`) 로 호출

### 4.3 환경 분기
```ts
// src/lib/runtime.ts (신규)
import { isTauri as isTauriOfficial } from '@tauri-apps/api/core';

/**
 * 함수 형태로 export — top-level 즉시 평가 시 __TAURI_INTERNALS__ 가
 * 아직 주입되지 않은 시점에 false 가 캡처될 수 있어, 호출 시점에 평가.
 */
export const isTauri = (): boolean => isTauriOfficial();
```

빌드 시 동일 코드, 런타임에 환경 감지. 호출:
- `if (isTauri())` → Tauri APIs 사용
- 그 외 → 브라우저 APIs (localStorage 등)

**왜 함수 형태**: Tauri injection 이 약간의 지연 후 발생할 수 있음. 모듈 top-level 에서 `const isTauri = ...` 로 즉시 평가하면 false 캡처 위험. 함수로 감싸서 사용 시점에 평가하면 안전.

---

## 5. 데이터 흐름

### 5.1 시작 흐름
```
앱 부팅
  ↓
Supabase 세션 토큰 검증 (localStorage 또는 Tauri store)
  ↓
[유효함] → 클라우드 모드 진입 (현 웹과 동일)
[없음/만료] → 로컬 모드 진입
  ↓
모드 표시 배지 (헤더 영역)
```

### 5.2 모드별 동작
| 사용자 동작 | 클라우드 모드 | 로컬 모드 |
|---|---|---|
| 학생 추가 | Supabase INSERT | 파일시스템 JSON 갱신 |
| 목표 변경 | Supabase UPDATE (디바운스 1.5s) | 파일시스템 JSON 갱신 (디바운스) |
| 인벤토리 입력 | Supabase UPSERT | 파일시스템 JSON 갱신 |
| 백업 다운로드 | repo → JSON 파일 다운 | 동일 |
| 백업 업로드 | JSON → repo | 동일 |

### 5.3 동기화 (명시적, 사용자 트리거)
**다이얼로그 메뉴 (예: 헤더의 "동기화" 버튼)**:
```
┌─ 동기화 ─────────────────────────┐
│  ↓ 클라우드 → 로컬 (다운로드)      │
│  ↑ 로컬 → 클라우드 (업로드)        │
│  ✗ 로컬 데이터 초기화             │
└──────────────────────────────────┘
```

**다운로드** (`pullFromCloud`):
1. 로그인 확인
2. `repo.cloud.getStudents()` + `repo.cloud.getInventory()` 호출
3. 사용자 confirm: "로컬의 학생 N명 + 재화 M종을 클라우드 데이터로 덮어씁니다"
4. `repo.local.replaceStudents(...)` + `repo.local.updateInventory(...)`
5. UI 새로고침

**업로드** (`pushToCloud`):
1. 로그인 확인
2. `repo.local.getStudents()` + `repo.local.getInventory()` 호출
3. 사용자 confirm: "클라우드의 학생 N명 + 재화 M종을 로컬 데이터로 덮어씁니다"
4. `repo.cloud.replaceStudents(...)` + `repo.cloud.updateInventory(...)`
5. UI 새로고침

**충돌 처리**: 자동 머지 안 함. last-write-wins. 사용자가 어느 쪽이 권위적인지 선택.

### 5.4 모드 전환 시 (단순 전환 정책 + 안내 배너)

**비로그인 → 로그인** (사용자가 로그인 클릭):
1. 로그인 폼 → Supabase auth 호출
2. 성공 시 단순히 클라우드 모드로 전환 (로컬 데이터는 그대로 보존, 머지 안 함)
3. **로컬에 데이터가 있으면 non-modal 배너 표시**:
   ```
   ┌───────────────────────────────────────────────┐
   │ ℹ 로컬에 학생 N명, 재화 M종이 있습니다.        │
   │   동기화 메뉴에서 클라우드로 업로드할 수 있어요. │
   │                                    [동기화] [×] │
   └───────────────────────────────────────────────┘
   ```
4. 데이터를 옮기려면 사용자가 직접 §5.3 의 동기화 메뉴에서 push/pull 호출

**왜 배너 필수**: 게스트로 입력 → 로그인 → 빈 화면 = "내 데이터 어디갔지?" 패닉. 명시적 안내로 방지.

**로그인 → 비로그인** (로그아웃):
1. confirm: "로그아웃합니다. 로컬 모드로 전환됩니다."
2. Supabase signOut → 모드 전환
3. 로컬 데이터는 그대로 유지

**근거**: 로그인/로그아웃 시 자동 머지 다이얼로그는 의도하지 않은 데이터 손실을 일으키기 쉬움. 데이터 이동은 항상 명시적인 동기화 버튼으로만. 단, 사용자에게 "로컬에 데이터 있음" 사실은 알려야 패닉 방지.

---

## 6. 구현 단계

### Phase 1 — Tauri 셸 + 기본 포팅 (예상 12-20시간)

#### 1.1 Tauri 프로젝트 초기화
```bash
# 프로젝트 루트에서
cd my-site
npm install -D @tauri-apps/cli@latest
npx tauri init
```

대화형 프롬프트:
- App name: `bluearchive-info-desktop`
- Window title: `Blue Archive Info`
- Web assets: `../dist` (vite 의 build outDir 기준)
- Dev URL: `http://localhost:5173`
- Frontend dev: `npm run dev`
- Frontend build: `npm run build`

**`package.json` 에 스크립트 추가**:
```json
"scripts": {
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

**`vite.config.ts` 에 strictPort 추가** (필수):
```ts
export default defineConfig({
  // ...
  server: {
    strictPort: true,
    port: 5173,
  },
});
```
이유: 5173 점유 시 Vite 가 5174 등으로 fallback → Tauri 는 여전히 5173 시도 → dev 모드 실패. `strictPort: true` 로 충돌 시 명확한 에러 발생.

생성되는 디렉토리:
```
my-site/
├── src/             (기존 React)
├── src-tauri/       (신규 Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   └── main.rs
│   └── icons/
├── package.json
└── ...
```

#### 1.2 CSP — Supabase 도메인 허용 (capability 가 아닌 CSP 가 핵심)

**중요한 사실 정리**:
- **Supabase JS SDK** 는 표준 `fetch()` 사용 → WebView 의 native fetch → **CSP `connect-src` 로 제어**
- **`tauri-plugin-http`** 는 `import { fetch } from '@tauri-apps/plugin-http'` 로 명시적 호출할 때만 적용. CORS 우회가 필요한 외부 API 용도. **Supabase 호출엔 불필요**
- **capability** 는 Tauri Rust 측 권한 (FS / Shell / Plugin 명령) 제어. 외부 HTTP 도메인 화이트리스트가 아님

→ **결론**: Supabase / SchaleDB 호출은 **`tauri.conf.json` 의 CSP 만 잘 잡으면 동작**. http capability 불필요.

**`src-tauri/tauri.conf.json` CSP 설정**:
```json
"app": {
  "security": {
    "csp": "default-src 'self'; connect-src 'self' https://*.supabase.co https://schaledb.com; img-src 'self' https://schaledb.com data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
  }
}
```

CSP 의 의미:
- `connect-src` → fetch / WebSocket 호출 가능한 origin (Supabase + SchaleDB 만 허용)
- `img-src` → SchaleDB 학생/아이템 이미지 로드 허용
- `style-src 'unsafe-inline'` → Tailwind / styled CSS 인라인 허용

**`src-tauri/capabilities/default.json` 기본 capability**:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "store:default"
  ]
}
```

→ store / shell / fs 같은 plugin 명령에 한정. 외부 HTTP 도메인은 capability 가 아닌 CSP 가 책임.

**plugin-http 가 필요해질 때** (참고): Supabase 가 아닌 CORS 비허용 외부 API 호출 시. 현 계획상 Supabase + SchaleDB 만 쓰니 미사용.

**검증**:
- CSP 미설정 시 Supabase fetch 가 "Refused to connect" 에러
- WebView 콘솔에서 에러 메시지 확인 → 누락된 origin 추가

#### 1.3 빌드/실행 검증
```bash
npm run tauri:dev      # 개발 모드 (hot reload)
npm run tauri:build    # 릴리스 바이너리 생성
```

이 시점에서 이미 "데스크탑 앱으로 띄움 + Supabase 인증 + 클라우드 모드 동작" 까지 무료로 따라옴.

#### 1.4 환경 감지 유틸
```ts
// src/lib/runtime.ts
import { isTauri as isTauriOfficial } from '@tauri-apps/api/core';

// 함수 형태 — Tauri injection 타이밍 안전 (top-level 즉시 평가는 false 캡처 위험)
export const isTauri = (): boolean => isTauriOfficial();
```
사용: `if (isTauri()) { ... }`

#### 1.5 LocalPlannerRepository 백엔드 분기

**(a) Tauri Store plugin 추가 — 의존성 + Rust 등록 + JS API 사용 3단계**:

1. 패키지 설치:
   ```bash
   npm install @tauri-apps/plugin-store
   cd src-tauri && cargo add tauri-plugin-store
   ```

2. **Rust 측에서 plugin 등록** (cargo add 만으론 동작 안 함):
   ```rust
   // src-tauri/src/lib.rs
   #[cfg_attr(mobile, tauri::mobile_entry_point)]
   pub fn run() {
       tauri::Builder::default()
           .plugin(tauri_plugin_store::Builder::default().build())
           // 다른 plugin 도 동일 패턴: .plugin(tauri_plugin_xxx::init())
           .run(tauri::generate_context!())
           .expect("error while running tauri application");
   }
   ```
   **다른 plugin 도 같은 패턴**: `tauri-plugin-fs`, `tauri-plugin-shell` 등 모두 cargo 의존성 + builder `.plugin(...)` 호출 필수.

3. **(b) JS 측에서 환경별 분기** — `localPlannerRepository.ts`:
  ```ts
  // 현 (웹)
  localStorage.getItem(STORAGE_KEY);
  // 데스크탑
  await store.get(STORAGE_KEY);
  ```
- 또는 더 깔끔하게: `KVStore` 인터페이스 추출 + 두 구현(웹용 / Tauri용) 으로 분리. `LocalPlannerRepository` 는 인터페이스만 의존.

#### 1.6 모드 표시 배지
- 헤더 또는 사이드바에 "클라우드 / 로컬" 배지 (`Wifi` / `WifiOff` 아이콘)
- 클릭 시 동기화 메뉴 (Phase 2)

#### 1.7 검증
- [ ] 앱 실행 시 windowed 로 정상 띄움
- [ ] **Capability 적용 확인**: `core:default` + `store:default` 만 활성. 다른 plugin 명령은 차단됨
- [ ] CSP 미등록 도메인 fetch 시 "Refused to connect" 에러 — 의도적 검증
- [ ] 로그인 → 클라우드 데이터 정상 fetch
- [ ] 로그아웃 → 로컬 모드, 파일시스템에 JSON 저장 확인
- [ ] 학생 추가 / 목표 변경 / 인벤토리 입력 모두 동작
- [ ] 앱 재시작 시 데이터 유지

### Phase 2 — 명시적 동기화 UI (예상 2-3시간)

#### 2.1 동기화 컴포넌트
- `SyncDialog.tsx` 신규
- 헤더 배지 클릭 → 다이얼로그 오픈
- 두 큰 버튼 (다운로드 / 업로드) + 보조 (로컬 초기화)
- 진행 표시 + 결과 alert

#### 2.2 동기화 함수
```ts
// src/lib/sync.ts
export async function pullFromCloud(userId: string): Promise<void>;
export async function pushToCloud(userId: string): Promise<void>;
export async function clearLocal(): Promise<void>;
```

내부적으로 두 repo 를 명시적으로 호출 (팩토리 우회).

#### 2.3 모드 전환 시 동작
- 로그인 성공 시 클라우드 모드로 단순 전환 (자동 머지 다이얼로그 없음)
- 로그아웃 시 로컬 모드로 단순 전환
- 데이터 이동은 사용자가 §5.3 의 동기화 버튼을 직접 클릭해야 발생

#### 2.4 검증
- [ ] 로그인 후 "클라우드 → 로컬" 버튼 → 로컬 파일이 클라우드 데이터로 갱신
- [ ] "로컬 → 클라우드" 버튼 → 클라우드가 로컬 데이터로 덮어쓰기
- [ ] 비로그인 시 두 버튼 비활성화
- [ ] confirm 거부 시 변경 없음

### Phase 3 — OCR 인벤토리 자동 입력 (예상 12-20시간)

**입력 가정**: 어떤 해상도 / 비율의 이미지든 받음 (PC 에뮬레이터 / 모바일 / 태블릿 무관). 절대 좌표 가정 없음. 적응적 그리드 검출 + OCR.

#### 3.1 외부 OCR 도구
- **PaddleOCR (Python)** — 한글 OCR 정확도 최고. 사용자가 별도 venv 에 설치 후 도구 디렉토리에 등록.
- 선택 후보 (참고용):
  - Tesseract (Rust binding) — 가벼움, 한글 정확도 낮음
  - 윈도우 / Mac OS 네이티브 OCR API — 플랫폼 분기 필요

#### 3.2 Tauri command
```rust
// src-tauri/src/main.rs
#[tauri::command]
async fn ocr_import(image_paths: Vec<String>) -> Result<String, String> {
    // PaddleOCR 스크립트 spawn → stdout JSON
}
```

#### 3.3 Python 헬퍼 스크립트
```python
# tools/ocr/extract_inventory.py
# 입력: 이미지 경로 리스트 (argv)
# 처리:
#   1. cv2.imread → 회색조 + 노이즈 제거
#   2. cv2.findContours → 사각형 셀 검출 (그리드 자동 인식)
#      - 셀 크기 분포 분석 → 메인 그리드 셀만 통과 (외곽 노이즈 제거)
#   3. 각 셀 영역에서 텍스트 추출 (PaddleOCR)
#   4. 셀 위치(행/열) 기반 정렬
# 출력 (stdout):
#   { "items": [{ "name": str, "count": int, "confidence": float, "bbox": [x,y,w,h] }, ...],
#     "warnings": [str, ...] }
```

#### 3.4 적응적 그리드 검출 (입력 크기 무관)
- 이미지 해상도 / 비율 가정 안 함
- contour 기반: 전체 이미지에서 사각형 영역 찾기 → 크기/비율로 필터링 → 그리드 추정
- 이미지 일부만 캡처해도 검출된 셀만 처리
- 너무 작은 이미지 (예: 폭 < 720px) → 경고 메시지: "해상도가 낮아 인식률이 떨어질 수 있습니다"

#### 3.5 매칭 로직 (TypeScript 사이드)

**우선순위 적용 (높은 → 낮은)**:
1. **정확 일치** — `norm(ocrText) === norm(schaledbName)` (공백 제거 비교). 1순위
2. **보정 매핑 적용** (`scannedTitleRemap`) — 자주 틀리는 패턴 미리 매핑 JSON. e.g.:
   ```json
   { "최상금 활동 보고서": "최상급 활동 보고서",
     "회루": "회로",
     ... }
   ```
   매핑 적용 후 다시 정확 일치 시도.
3. **자모 분해 N-gram 유사도** — 한글은 OCR 이 자모 일부만 틀리는 경우 (예: ㅎ↔ㅏ) 가 흔함. 자모 분해 후 N-gram 비교가 Levenshtein 보다 정확.
4. **Levenshtein** — 위 셋 다 실패 시 fallback. `fast-levenshtein` npm 패키지.
5. **점수 < 임계값** → "매칭 불확실" 플래그 → 사용자 confirm 필요

**라이브러리**: `fast-levenshtein` + 자체 자모 분해 유틸 (간단한 함수, 한글 유니코드 산술).

**보정 매핑 JSON 위치**: `tools/ocr/remap.json` — 사용 중 발견한 패턴을 점진적으로 누적.

#### 3.6 미리보기 + 적용 UI
- 인벤토리 페이지에 "이미지에서 가져오기" 버튼
- 파일 선택 (다중) → 처리 진행 표시 → 결과 미리보기
- 미리보기 테이블 (이미지 썸네일, 인식된 이름, 매칭된 ID, 수량, confidence)
- 사용자 수정 가능 (수량 / 매칭 변경 / 항목 제외)
- 확인 → 인벤토리에 머지 (덮어쓰기 vs 합산 옵션)

#### 3.7 검증
- [ ] **Capability 갱신**: `shell:default` 추가 (Python spawn). 이미지 임시 파일 R/W 필요 시 `fs:default` (제한 scope) 추가
- [ ] PC 에뮬레이터 (1080p) + 모바일 (다양한 비율) + 태블릿 캡처 모두 처리 OK
- [ ] 작은 해상도 입력 시 사용자에게 경고
- [ ] 다양한 화면 (보고서 / 오파츠 / 노트 / 가구) 캡처에서 80%+ 인식
- [ ] 인식 못한 항목 명확히 플래그
- [ ] 적용 전 미리보기 / 수정 가능
- [ ] 적용 후 인벤토리 정상 갱신

### Phase 4 — 마감 / 배포 + 자동 업데이트 (예상 7-13시간)

#### 4.1 빌드 (코드사인 미적용 정책)

**결정**: 코드사인 인증서 구매 없이 미서명 바이너리 배포. 첫 실행 시 OS 보안 경고는 README 안내로 해결.

**근거**:
- hobby 규모 — 본인 + 소수 지인 사용
- 코드사인 비용 (연 $100-500) 대비 가치 낮음
- Tauri / Electron indie 앱 커뮤니티 표준 관행
- 사용자가 첫 실행 한 번만 경고 우회하면 이후 정상 동작

**산출물**:
- **Windows**: 미서명 `.exe` 또는 `.msi` 인스톨러
- **Mac**: ad-hoc 서명 `.app` 번들 (`.dmg` 으로 패키징) — **Apple Silicon (M1+) 에서 권장**
- **Linux**: AppImage (서명 불필요)

**macOS ad-hoc 서명 (비용 0, 권장)**:
- Apple Developer 계정 ($99/년) 없이도 무료로 적용 가능
- Apple Silicon Mac 에서 인터넷 다운로드 앱은 사실상 어떤 형태든 코드사인 요구 → ad-hoc 서명 시 "손상된 앱" 같은 강한 거부 회피
- Gatekeeper quarantine 우회 (우클릭 → 열기) 는 여전히 필요하지만 더 부드러운 경험
- 빌드 명령에 자동 적용:
  ```bash
  # tauri.conf.json
  "bundle": {
    "macOS": {
      "signingIdentity": "-"  // ad-hoc 서명
    }
  }
  ```
- 또는 GitHub Actions 의 macos-latest 러너에서 기본 서명 ID 활용

**README 첫 실행 안내 문구 (필수 포함)**:
```markdown
## 첫 실행 시 보안 경고

### Windows
"Windows의 PC 보호" 경고가 뜨면:
1. **추가 정보** 클릭
2. **실행** 클릭
이후 재실행 시엔 경고가 뜨지 않습니다.

### macOS
"확인되지 않은 개발자" 경고가 뜨면:
1. Finder 에서 앱 우클릭 → **열기**
2. 경고창에서 다시 **열기** 클릭
이후 재실행 시엔 정상 실행됩니다.
```

**향후 옵션 (필요 시)**: 사용자 수가 많아져 경고가 부담되면, 그 시점에 EV 코드사인 인증서 도입 검토. MVP 에선 미적용.

#### 4.2 GitHub Releases 자동 빌드
- GitHub Actions workflow: 태그 push 시 3개 OS 동시 빌드 → Release 첨부
- Tauri 의 `tauri-action` GitHub action 활용

#### 4.3 자동 업데이트 (MVP 부터 도입)

**결정**: Tauri 의 정식 updater 플러그인을 MVP 부터 활성화. 추가 작업 ~3-4시간.

**중요 사실**: Tauri updater 가 쓰는 **자체 minisign 키페어** 는 **OS-level 코드사인과 완전히 별개**. 미서명 (OS 차원) 바이너리이면서도 자동 업데이트는 정상 동작.

**선택 근거**:
- 한 번 셋업으로 영구 자동 — 매 릴리스마다 사용자에게 "새 버전 나왔어" 알릴 필요 X
- 빌드 실수 시 hotfix 즉시 전파 가능
- minisign 키로 검증 → GitHub Releases 가 탈취되어도 키 없이는 변조 update 푸시 불가 (보안 견고)
- 향후 사용자 풀 늘 때 마이그레이션 비용 0 (지금 안 하면 그 시점에 v1 사용자 모두 한 번 수동 재설치 필요)

**셋업 단계 (Phase 4 에서 수행)**:

**1. 키페어 생성 (개발자 머신, 한 번만)**:
```bash
npx tauri signer generate -w ~/.tauri/bluearchive-updater.key
# 출력: private key (.key 파일에 저장됨, 패스워드 보호) + public key (콘솔)
```
→ 출력된 public key 와 패스워드를 안전한 곳에 백업 (1Password / Bitwarden / iCloud Keychain 등).

**2. `tauri.conf.json` 갱신 — `bundle.createUpdaterArtifacts` + `plugins.updater`**:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json"
      ],
      "pubkey": "여기에_public_key_paste"
    }
  }
}
```

**중요한 두 점**:
- **`createUpdaterArtifacts: true`** 가 없으면 빌드 시 `.sig` 파일 생성 안 됨 → updater 전체 동작 불가. **필수**.
- v2 schema 에서 `active`, `dialog` 필드는 **제거됨** (v1 잔재). v2 는 plugin 블록 존재 + Rust 등록만으로 자동 활성화. dialog UI 는 사용자 직접 구현.

**endpoint URL 의 `<OWNER>/<REPO>`** 는 GitHub 저장소 경로로 치환 (예: `johypark97/VArchiveMacro`). Tauri 의 자체 변수 `{{target}}`, `{{current_version}}` 등은 이중중괄호이며 별개.

**3. plugin 설치 및 Rust 등록**:
```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
cd src-tauri && cargo add tauri-plugin-updater tauri-plugin-process
```

```rust
// src-tauri/src/lib.rs — v2 공식 권장 패턴
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // updater 는 데스크탑 전용 — 모바일 빌드에서 컴파일 실패 방지
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**왜 `#[cfg(desktop)]`**: updater plugin 은 모바일 타겟에 컴파일 안 됨. 현 계획은 데스크탑만이지만 공식 패턴을 따라 향후 모바일 확장 시 안전.

**4. Capability 권한 추가 — `src-tauri/capabilities/default.json`**:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "store:default",
    "updater:default",
    "process:default"
  ]
}
```

→ `updater:default` + `process:default` 누락 시 frontend 의 `check()` / `relaunch()` 호출이 "command not allowed" 로 차단됨.

**5. GitHub Secrets 등록**:
- `TAURI_SIGNING_PRIVATE_KEY` — 위 .key 파일 내용 (전체 텍스트)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — 키 패스워드

**6. GitHub Actions workflow 갱신**:

`tauri-action` 의 `includeUpdaterJson: true` 옵션으로 `.sig` + `latest.json` 자동 생성·첨부:

```yaml
# 가장 단순한 형태 — strategy.matrix 없이 단일 OS 또는 기본 bundle 만 사용
- uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  with:
    tagName: app-v__VERSION__
    releaseName: 'App v__VERSION__'
    includeUpdaterJson: true   # ← .sig + latest.json 자동 첨부

# 멀티 OS (Windows/macOS/Linux) 빌드 시: 위 step 을 strategy.matrix 안에서 실행하고
# args: ${{ matrix.args }} 로 OS 별 bundle 옵션 차별화 (예: Linux → '--bundles deb,appimage')
```

**`includeUpdaterJson: true` 가 없으면** `latest.json` 이 Release 에 첨부되지 않아 endpoint 가 404 → updater 동작 불가.

**7. 앱 코드에서 update 체크 + 사용자 동의 + 진행률**:

```ts
// src/lib/updater.ts (신규)
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from './runtime';

export async function checkForUpdates(): Promise<Update | null> {
  if (!isTauri()) return null;
  try {
    // v2: check() 가 이미 Update | null 반환 — 추가 .available 체크 불필요
    return await check();
  } catch (e) {
    console.error('업데이트 확인 실패:', e);
    return null;
  }
}

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
```

UI 컴포넌트 (간단한 예시):
```tsx
// src/service/updater/UpdateBanner.tsx
const update = await checkForUpdates();
if (update) {
  // 1. 헤더에 "업데이트 가능 (v{update.version})" 배지 표시
  // 2. 클릭 → confirm: "v{update.version} 으로 업데이트할까요? (재시작됨)"
  // 3. 동의 시 applyUpdate(update, onProgress) 호출 + 진행률 표시
  // 4. 완료 시 자동 재시작
}
```

**왜 confirm 필수**: 자동 다운로드/설치는 사용자 작업 중간에 강제 재시작 → 데이터 손실 위험. 명시적 동의 후 진행.

**8. 앱 시작 시 + 헤더 메뉴에서 호출**:
- 앱 마운트 후 (`useEffect`) `checkForUpdates()` — 조용히 백그라운드 체크. 결과 있으면 헤더 배지로 표시 (작업 방해 안 함)
- 헤더의 "업데이트 확인" 메뉴 → 명시적 호출 + 결과 표시 (배지 없을 때 사용자가 강제 재확인)

**검증**:
- [ ] **Capability 갱신**: `updater:default` + `process:default` 추가 (frontend `check()` / `relaunch()` 호출 가능)
- [ ] `bundle.createUpdaterArtifacts: true` 설정됨 — 빌드 산출물에 `.sig` 파일 생성 확인
- [ ] `latest.json` 이 Release 에 첨부됨 (`includeUpdaterJson: true` 동작)
- [ ] `latest.json` 의 `signature` 필드 포함됨
- [ ] 새 버전 푸시 → 기존 설치된 앱에서 자동 감지 → confirm → 다운로드/설치/재시작 정상
- [ ] 잘못된 키로 서명한 update 는 거부됨 (의도적 검증)

**키 분실 시 대응** (위험):
- 새 키페어 발급 → 새 public key 로 빌드한 앱은 기존 사용자 검증 실패
- 모든 사용자 1회 수동 재설치 필요 (= 자동 업데이트 미적용 상태와 동일)
- → **키 백업 필수**. 1Password 같은 매니저에 저장 권장.

#### 4.4 사용자 가이드 (README)
- 설치 방법 (OS 별)
- 첫 실행 + 로그인
- OCR 사용법 (Phase 3 완료 시)
- 데이터 위치 / 백업 방법

---

## 7. 파일 구조 변경 (예상)

```
bluearchive_info/
├── my-site/
│   ├── src/                          (대부분 그대로)
│   │   ├── lib/
│   │   │   ├── supabase.ts           (그대로)
│   │   │   ├── runtime.ts            (신규 — isTauri 감지)
│   │   │   └── kvstore.ts            (신규 — 추상 KV 인터페이스)
│   │   ├── lib/storage/              (신규 디렉토리)
│   │   │   ├── webStorage.ts         (localStorage 구현)
│   │   │   └── tauriStorage.ts       (Tauri Store 구현)
│   │   ├── repositories/
│   │   │   ├── localPlannerRepository.ts  (KVStore 의존으로 수정)
│   │   │   └── ...
│   │   ├── service/planner/
│   │   │   ├── components/
│   │   │   │   └── SyncDialog.tsx    (신규)
│   │   │   └── ...
│   │   └── lib/sync.ts               (신규)
│   ├── src-tauri/                    (신규 디렉토리)
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   ├── icons/
│   │   └── src/
│   │       └── main.rs
│   ├── tools/                        (Phase 3, 신규)
│   │   └── ocr/
│   │       ├── requirements.txt
│   │       └── extract_inventory.py
│   ├── package.json                  (tauri 의존성 추가)
│   └── ...
└── PLAN_desktop_app.md               (이 문서)
```

---

## 8. 기술 결정 / 근거

| 결정 | 선택 | 근거 |
|---|---|---|
| 셸 프레임워크 | **Tauri 2.x** | 작은 바이너리 (~5-15MB vs Electron 100MB+), Rust 보안성, React/TS 그대로 재사용. v2 부터 plugin / capability 시스템 정식. v1 과 호환 X |
| 인증 | **Supabase JS SDK** | 웹과 동일 → 코드 재사용, 토큰은 WebView localStorage 또는 Tauri store 에 보관 |
| 로컬 저장 | **tauri-plugin-store** (JSON) | 사용자가 파일을 직접 보고/백업 가능. SQLite 도 옵션이지만 단순한 JSON 으로 충분 |
| 동기화 모델 | **명시적 push/pull (수동)** | 자동 양방향 sync 는 충돌 처리가 복잡. 단일 사용자 / 명확한 의도 → 단순한 수동이 합리적 |
| OCR 엔진 | **PaddleOCR (Python)** | 한글 OCR 정확도 최고. 외부 venv 로 분리해 Tauri 바이너리 size 영향 없음 |
| 매칭 알고리즘 | **Levenshtein** (`fast-levenshtein`) | OCR 부정확함 흡수 + SchaleDB 한글명 매칭. 단순 + 빠름 |
| 빌드 / 배포 | **GitHub Releases + Actions** | 무료, 자동, 다중 OS |
| OS 코드사인 | **미적용 (미서명 / Mac 은 ad-hoc)** | hobby 규모. 첫 실행 보안 경고는 README 안내로 해결. 인증서 비용 ($100-500/년) 절약. macOS 는 ad-hoc 서명 (비용 0) 적용 |
| 자동 업데이트 | **Tauri updater (minisign)** | OS 코드사인과 별개. 자체 키페어로 update bundle 검증. MVP 부터 도입 → 영구 자동 갱신. 추가 작업 ~3-4h |

---

## 9. 트레이드오프 / 리스크

### 위험
| 항목 | 영향 | 완화 |
|---|---|---|
| Tauri 학습 곡선 (Rust + 빌드 환경) | 첫 셋업 시간 ↑ | 가이드 충분, 첫 빌드까지 2-3시간 |
| OS 별 빌드 | 배포 시 OS 별 머신 필요 | GitHub Actions 의 macos/windows/ubuntu 러너 활용 |
| 미서명 바이너리 보안 경고 | 첫 실행 시 SmartScreen / Gatekeeper 경고 | **수용 결정**. README 에 우회 방법 명시 (Win: 추가정보→실행 / Mac: 우클릭→열기). 한 번만 처리하면 이후 정상 |
| 자동 업데이트 minisign private key 분실 | 모든 사용자 1회 수동 재설치 필요 | 키 + 패스워드를 비밀번호 매니저 (1Password / Bitwarden / iCloud Keychain) 에 백업. 클라우드 보안 폴더에 추가 백업. 분실해도 보안 사고는 아님 — 단지 마이그레이션 1회 부담만 발생 (§4.3 참조) |
| 로컬 ↔ 클라우드 동기화 충돌 | 데이터 덮어쓰기 사고 | 명시적 confirm 다이얼로그 + 백업 권장 안내 |
| Tauri WebView 차이 (3종 엔진) | 일부 CSS / API 차이. 엔진별 별도 빌드 + 테스트 필요 | Win: Chromium WebView2 (Edge 와 같은 엔진) — 호환성 좋음 / Mac: Safari WebKit / Linux: WebKitGTK (Mac 과 다른 빌드, 다른 버전, CSS quirk 다름) — Linux 빌드 시 별도 검증. Tailwind 는 3개 모두 호환성 양호 |
| OCR 한글 정확도 | 인식 오류 → 잘못된 입력 | 미리보기 + 사용자 confirm 의무화 |
| Python 의존성 | OCR 사용 시 별도 설치 필요 | 사용자 가이드 + 자동 venv 셋업 스크립트 |

### 트레이드오프 (수용)
- **모바일 미지원**: Tauri 데스크탑만. 모바일 BA 사용자는 PC 에뮬레이터 또는 모바일 → PC 전송 워크플로 필요.
- **자동 sync 없음**: 두 기기에서 동시 편집 시 마지막 push 가 이김. 사용자 한 명 가정.
- **OCR 정확도 < 100%**: 항상 사용자 confirm 단계. 완전 자동화 X.
- **빌드 머신 필요**: GitHub Actions 활용 권장. 로컬 빌드는 단일 OS 만 가능.

---

## 10. 검증 / 테스트 계획

### 단위 검증 (각 phase 끝)
- [ ] Phase 1: `npm run tauri:build` 후 바이너리 실행 / 인증 / CRUD 모두 OK
- [ ] Phase 2: 로컬 ↔ 클라우드 동기화 정상 동작
- [ ] Phase 3: 5종 이상 다른 인벤토리 화면 OCR 80%+ 인식
- [ ] Phase 4: 3개 OS 빌드 산출물 정상 실행

### 회귀 검증 (웹앱이 안 깨졌나)
- [ ] 기존 웹사이트 (`/planner/cultivation` 등) 정상 동작 — 환경 분기 코드가 웹 환경 영향 없는지
- [ ] 백업 JSON 형식 호환 — 웹에서 export → 데스크탑에서 import / 그 반대도 가능

### 보안 / 인증
- [ ] Supabase 토큰 저장 위치 결정 (§12 결정 항목 b)
  - MVP: WebView localStorage (Supabase JS SDK 기본). OS 격리된 데이터 디렉토리 안에 있음
  - 강화: `tauri-plugin-stronghold` 또는 `keyring-rs` 사용해 OS keychain 에 저장 (macOS Keychain / Windows Credential Manager / Linux Secret Service)
- [ ] 외부 프로세스 (Python) spawn 시 인자 escaping (Rust `Command::arg` 자동 처리됨)
- [ ] capability 권한 최소화 — phase 별 누적 추가:
  - Phase 1: `core:default`, `store:default`
  - Phase 3: `shell:allow-execute` (OCR Python 호출), 필요 시 `fs:allow-read-text-file` (스크립트/데이터)
  - Phase 4: `updater:default`, `process:default` (자동 업데이트 + 재시작)
  각 phase 시점에 `capabilities/default.json` 갱신, 그 전까지는 추가 X
- [ ] CSP `connect-src` 가 Supabase + SchaleDB 만 허용

---

## 11. 타임라인 / 예상 시간

| Phase | 작업 | 예상 시간 | 누적 |
|---|---|---|---|
| 1.1-1.7 | Tauri 셸 + capability + 포팅 | 12-20h | 20h |
| 2.1-2.4 | 동기화 UI | 2-3h | 23h |
| 3.1-3.7 | OCR | 12-20h | 43h |
| 4.1, 4.2, 4.4 | 빌드 / GitHub Actions / README | 3-5h | 48h |
| 4.3 | Tauri auto-updater 셋업 | 3-4h | 52h |

(추정치는 Tauri / Rust 미경험자 기준. 익숙해지면 단축 가능)

**최소 동작** (Phase 1만): ~12-20h — 데스크탑에서 웹앱 그대로 동작 + 로컬/클라우드 모드.
**완성도** (Phase 1+2+4, OCR 제외): ~20-32h — 동기화 UI + 자동 업데이트 + 배포까지.
**OCR 포함 풀 기능**: ~32-52h. (위 변동 폭의 큰 이유는 Tauri/Rust 익숙도 + OCR 디버깅 시간)

---

## 12. 결정 필요 항목

### 결정 완료 항목

| 항목 | 결정 | 비고 |
|---|---|---|
| 1. Phase 3 (OCR) 포함 | ✅ 포함 | 데스크탑 앱의 핵심 가치 |
| 2. OS 우선순위 | **맥 먼저, 윈도우는 GitHub Actions 로 추가** | 본인 OS 에서 개발/검증 후 점진 확장 |
| 3. 모드 전환 UX | **단순 전환 + 안내 배너** | 데이터 이동은 §5.3 의 동기화 메뉴에서 명시적. 로컬 데이터 존재 시 non-modal 배너 |
| 4. OCR 입력 가정 | **입력 이미지에 적응 (해상도/비율 무관)** | OpenCV contour 기반 적응적 그리드 검출 + PaddleOCR. 최소 해상도 안내 (예: 720p 이상 권장) 만 표시 |
| 배포 범위 / 코드사인 | 미서명 (Win/Linux) + ad-hoc (Mac) + README 안내 | EV 인증서 비용 미지불. macOS 는 ad-hoc 서명 (비용 0) 권장 (§6.4.1 참조) |
| 자동 업데이트 | **MVP 부터 도입** (Tauri updater 정식) | minisign 키페어 + GitHub Actions 자동 서명 + 앱 내 update 체크. 추가 작업 ~3-4h. 영구 자동 갱신 (§6.4.3 참조) |

### 진행 전 추가 결정 필요

| 항목 | 옵션 | 비고 |
|---|---|---|
| **OCR 번들링 방식** (Phase 3 시작 전) | **a) sidecar (PyInstaller)** — 사용자 의존성 0, 번들 +150-300MB / **b) 사용자 venv 설치** — 번들 작음, UX 부담 ↑ | Phase 3 진입 시점에 결정. 권장: a (사용자 부담 최소화) |
| **토큰 저장 위치** (Phase 1 마무리 시) | **a) WebView localStorage** (기본, Supabase JS SDK 자동) / **b) OS keychain** (`tauri-plugin-stronghold` / `keyring-rs`) — 보안 강화 | 미서명 빌드라면 b 권장. MVP 는 a 로 시작 가능 |

### 진행 가능 상태

위 결정으로 모든 차단 요소 해소. Phase 1 (Tauri 셸 + 포팅) 부터 순차 진행 가능.

총 작업량 추정: **32-52시간** (Phase 1+2+3+4 풀 코스, Tauri/Rust 미경험 기준).

---

## 13. 후속 가능 확장 (out-of-scope, 참고)

이번 계획에는 안 들어가지만 데스크탑 앱 기반에서 자연스럽게 확장 가능한 기능:

- **시스템 트레이 + 글로벌 단축키**: Ctrl+Shift+B 로 캡처 → OCR → 자동 적용
- **게임 창 watcher**: 에뮬레이터 창 자동 감지 → 캡처 영역 제안
- **인벤토리 변경 이력 / 차트**: 시간별 보유 재화 변동 그래프
- **여러 계정 프로필**: 서브 계정도 같은 앱에서 관리
- **클라우드 자동 백업**: 매일 N시에 클라우드로 자동 push
- **다른 게임 정보 사이트 통합**: 학생 위키 / 가이드 / 공략 등 한 데스크탑 앱에 통합

---

## 14. 다음 액션

이 문서 검토 후 결정 항목 답변 → 가장 먼저:

1. Tauri 프로젝트 초기화 (`npx tauri init`)
2. 첫 실행 / 빌드 확인 (Phase 1.1, 1.2)
3. 모든 게 정상이면 Phase 1 의 나머지 진행

(이 문서 자체는 PR / 커밋 대상 아님. 프로젝트 진행 가이드용.)
