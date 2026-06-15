# PLAN: OCR 런타임 분리 배포 + 앱 내 자동 다운로드

## 배경

현재 OCR (`my-site/tools/ocr/` + `src-tauri/src/ocr.rs`) 은 Python + PaddleOCR 직접 셋업이 필요해 일반 사용자가 사용 불가능한 상태. v0.1.2 .dmg 만 설치한 사용자는 OCR 메뉴 클릭 시 "Python spawn 실패" 에러를 보게 됨.

대안 검토 결과:
- 서버 OCR (HF Spaces, Modal 등) → 무료 플랜 한계 + 운영 부담 + 콜드 스타트
- 설명서 안내 → 사용자 진입장벽 너무 높음 (한국 게임 유저 타깃)
- **로컬 설치 + 앱 내 자동 다운로드** ← 채택

OCR 의 대안이 "수작업 인벤토리 입력" 이라는 점에서, 사용자 입장에서 800MB 1회 다운로드는 합리적 거래.

## 목표 (Goals)

- 일반 사용자가 추가 셋업 (Python, pip) 없이 OCR 사용
- 기본 .dmg 크기 유지 (현 6MB)
- 1회 다운로드 후 영구 오프라인 작동
- 무결성 검증 (SHA256 + minisign 서명)
- 다운로드 실패/중단에 안전 (atomic install)

## 비목표 (Non-goals)

- 웹/모바일 OCR 지원 → 수동 입력 유지
- 다중 OCR 엔진 지원 → PaddleOCR 단일
- 모델 단독 자동 업데이트 → 앱 업데이트와 동반
- iOS/Android 지원

## 사용자 경험 (UX Flow)

1. 인벤토리 페이지 → "이미지로 가져오기" 클릭
2. 앱: OCR 런타임 설치 여부 확인 (~10ms)
3. **미설치 경로**:
   - 안내 다이얼로그
     ```
     OCR 엔진을 다운로드합니다
     • 용량: 약 750MB (1회만)
     • 예상 시간: 3-5분 (100Mbps 기준)
     • 디스크 여유 확인: 2GB
     [다운로드 시작]  [나중에]
     ```
   - 디스크 공간 사전 체크 → 부족 시 에러
   - 다운로드 진행 UI (취소 / 일시정지 가능)
   - SHA256 검증 → minisign 검증 → 압축 해제 (atomic move)
4. **설치 완료 후**: 기존 OCR 다이얼로그로 자동 진행
5. **다음 사용부터**: 즉시 OCR 사용 가능

## 기술 아키텍처

### 컴포넌트 맵

```
[Cloudflare R2]
  ├─ manifest.json                      ← 버전/체크섬
  ├─ v1.0.0/runtime-darwin-aarch64.tar.gz
  ├─ v1.0.0/runtime-darwin-x86_64.tar.gz
  ├─ v1.0.0/runtime-windows-x86_64.tar.gz
  └─ v1.0.0/runtime-linux-x86_64.tar.gz

[Tauri 앱]
  ├─ Rust: ocr_runtime.rs (다운로드/검증/설치/탐색)
  ├─ Rust: ocr.rs (resolve_python 수정)
  └─ TS: OcrRuntimeInstallDialog.tsx + ocrRuntime.ts

[사용자 디스크]
  ~/Library/Application Support/io.github.dhlee515.bluearchive-info/
    ocr-runtime/
      version.json
      python/bin/python              # python-build-standalone
      python/lib/...
      site-packages/                 # paddleocr, paddlepaddle, ...
      models/                        # PaddleOCR 한국어/영어 모델
      extract_inventory.py
      remap.json                     # (선택: 번들에 포함하거나 앱에서 복사)
```

### Manifest 스키마

`https://<R2-public-domain>/manifest.json`:
```json
{
  "schema": 1,
  "runtime_version": "1.0.0",
  "min_app_version": "0.2.0",
  "released_at": "2026-05-XX",
  "notes": "초기 릴리즈",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://.../v1.0.0/runtime-darwin-aarch64.tar.gz",
      "sha256": "abc123...",
      "size_bytes": 754000000,
      "signature": "minisign signature"
    },
    "darwin-x86_64": { ... },
    "windows-x86_64": { ... },
    "linux-x86_64": { ... }
  }
}
```

### Rust 측 API (신규 Tauri 커맨드)

```rust
// my-site/src-tauri/src/ocr_runtime.rs (신규 파일)

#[tauri::command]
async fn ocr_runtime_status() -> Result<RuntimeStatus, String> {
  // { installed: bool, version: Option<String>, install_dir: PathBuf }
}

#[tauri::command]
async fn ocr_runtime_fetch_manifest() -> Result<Manifest, String> {
  // R2 에서 manifest.json fetch + 서명 검증
}

#[tauri::command]
async fn ocr_runtime_install(
  app: AppHandle,
  version: String,
) -> Result<(), String> {
  // 1. 디스크 공간 체크
  // 2. 임시 디렉토리 다운로드 (reqwest streaming + emit progress event)
  // 3. SHA256 검증
  // 4. minisign 검증
  // 5. tar.gz 압축 해제 (임시 디렉토리)
  // 6. 기존 설치 백업 → 새 설치 atomic move
  // 7. version.json 작성
}

#[tauri::command]
async fn ocr_runtime_cancel() -> Result<(), String> { ... }

#[tauri::command]
async fn ocr_runtime_uninstall() -> Result<(), String> { ... }
```

### `resolve_python()` 수정 ([ocr.rs:56-71](my-site/src-tauri/src/ocr.rs#L56-L71))

탐색 우선순위:
1. **사용자 데이터 디렉토리** (`app_data_dir/ocr-runtime/python/bin/python`) ← 신규
2. **개발자 venv** (`cwd/../tools/ocr/venv/bin/python`) ← 기존
3. **시스템 python3** ← 최후 폴백 (대부분 실패)

### 프론트엔드 통합 포인트

- `OcrImportDialog.tsx` 진입 시 `ocr_runtime_status` 호출
- 미설치면 `OcrRuntimeInstallDialog` 표시 → 설치 후 원래 다이얼로그 복귀
- 진행 이벤트 (`ocr_runtime://progress`) 구독 → 진행률 / 단계 표시
- 설정 페이지 (옵션): "OCR 엔진 관리" — 재설치 / 삭제

## 작업 단계

### Phase A — Rust 백엔드 (3-5일)

- [ ] A1. `ocr_runtime.rs` 신규 + `RuntimeStatus`, `Manifest` 타입
- [ ] A2. `app_data_dir` 기반 설치 경로 헬퍼
- [ ] A3. Manifest fetch (reqwest + serde)
- [ ] A4. 스트리밍 다운로드 + 진행 이벤트 emit
- [ ] A5. SHA256 검증 (sha2 크레이트)
- [ ] A6. minisign 검증 (minisign-verify 크레이트)
- [ ] A7. tar.gz 압축 해제 (flate2 + tar 크레이트) + atomic 디렉토리 swap
- [ ] A8. `resolve_python()` 통합 + 우선순위 적용
- [ ] A9. 권한 추가 (`capabilities/default.json`)

### Phase B — 프론트엔드 (2-3일)

- [ ] B1. `services/ocrRuntime.ts` — Tauri 커맨드 래퍼 + 이벤트 구독
- [ ] B2. `OcrRuntimeInstallDialog.tsx` — 안내 / 진행 UI / 취소
- [ ] B3. `OcrImportDialog.tsx` 통합 — 미설치 시 분기
- [ ] B4. 에러 케이스 UI (네트워크, 검증 실패, 디스크 부족)
- [ ] B5. (선택) 설정 페이지 OCR 엔진 관리

### Phase C — 런타임 번들링 (5-10일) ⚠️ 최대 리스크

- [ ] C1. 번들 구조 설계 + 빌드 스크립트 (`scripts/build-ocr-runtime.sh`)
- [ ] C2. python-build-standalone 다운로드 + 추출 자동화
- [ ] C3. PaddleOCR/paddlepaddle 설치 + Korean+English 모델만 사전 다운로드
- [ ] C4. 불필요 파일 제거 (다른 언어 모델, 테스트 코드, `.pyc` 캐시 등) → 크기 최적화
- [ ] C5. tar.gz 패키징 + SHA256 + minisign 서명
- [ ] C6. GitHub Actions 워크플로우 `release-ocr-runtime.yml`
  - 매트릭스: macOS aarch64, macOS x86_64, Windows x86_64, Linux x86_64
  - 트리거: `runtime-v*` 태그 푸시
- [ ] C7. macOS aarch64 / Windows / Linux 각 플랫폼 검증 (paddlepaddle wheel 호환성 ← 가장 큰 변수)

### Phase D — 호스팅 (1일)

- [ ] D1. Cloudflare R2 계정 + 버킷 생성
- [ ] D2. 커스텀 도메인 (선택) — `ocr-runtime.dhlee515.dev` 등
- [ ] D3. CORS 설정 (앱이 manifest fetch)
- [ ] D4. 업로드 자동화 — GitHub Actions → rclone 또는 aws-s3-action
- [ ] D5. 공개 URL 동작 확인

### Phase E — 테스트 & 출시 (2-3일)

- [ ] E1. 클린 macOS aarch64 환경 — 다운로드 → OCR 정상 작동
- [ ] E2. 클린 Windows 11 환경
- [ ] E3. 클린 Ubuntu 22.04 환경
- [ ] E4. 네트워크 중단 / 재시작 / 취소 케이스
- [ ] E5. 디스크 공간 부족 시 메시지
- [ ] E6. 서명 검증 실패 시 차단 확인
- [ ] E7. v0.2.0 bump + 릴리즈

## 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| paddlepaddle macOS aarch64 wheel 불안정 | **High** | python-build-standalone + 직접 wheel 빌드 검토 / 실패 시 PaddleOCR → Tesseract (한국어 정확도 ↓) 대체 |
| Windows DLL 의존성 (msvcrt 등) | Medium | vcredist 포함 또는 자체 DLL 번들 |
| R2 무료 한도 초과 | Low | 저장 10GB 무료 (번들 4개 × ~750MB = 3GB), egress 무료. 100k+ 다운로드까지 안전 |
| 다운로드 도중 네트워크 끊김 | Medium | Range requests 로 resume / 실패 시 처음부터 재시작 옵션 |
| 사용자 디스크 부족 | Low | 다운로드 전 사전 체크 |
| 매니페스트 변조 / MITM | Medium | minisign 서명 검증 필수 |
| 사용자 antivirus 가 Python 실행 차단 | Medium | 코드 서명 (별도 작업), README 안내 |
| paddlepaddle 모델 다운로드 (런타임 첫 실행 시) | Medium | 모델 사전 포함 + `PADDLE_HOME` 환경변수로 경로 고정 |

## 견적

- Phase A: 3-5일
- Phase B: 2-3일
- Phase C: **5-10일** (paddlepaddle 호환성에 따라 변동)
- Phase D: 1일
- Phase E: 2-3일

**총 2-3주** 풀타임. Phase C 실패 시 OCR 엔진 자체를 Tesseract 로 갈아끼우는 큰 변경 발생 가능.

## 착수 순서 (권장)

**Phase C 를 먼저 시작** (de-risk first):

1. 가장 큰 미지수 (paddlepaddle macOS aarch64 호환성) 를 먼저 검증
2. 번들 구조가 확정되어야 Phase A 의 압축 해제 / 경로 탐색 로직 작성 가능
3. macOS aarch64 한 번들이 동작하면 나머지는 점진적 확장

순서: **C → A → B → D → E** (A 와 C 일부는 번들 구조 합의 후 병행 가능).

## 결정 사항 (확정)

1. **OCR 엔진**: PaddleOCR 유지
2. **번들 모델**: 한국어 + 영어만 (목표 300-400MB)
3. **타깃 OS**: **macOS aarch64 먼저** → 성공 후 macOS x86_64 → Windows → Linux
4. **버전 정책**: 런타임 독립 버전 (예: runtime 1.0.0 / 앱 0.2.x)
5. **R2 도메인**: `r2.dev` 기본 URL 로 시작 → 필요 시 커스텀 도메인 전환
6. **서명**: 기존 minisign 키 재사용 (`~/.tauri/bluearchive-updater.key`)

## 후속 작업 (Out of Scope)

- 런타임 차분 업데이트 (모델만 갱신)
- OCR 정확도 개선 (별도 [PLAN_ocr_visual_matching.md](PLAN_ocr_visual_matching.md))
- 다중 이미지 배치 최적화
- 사용 통계 수집 (옵트인)
