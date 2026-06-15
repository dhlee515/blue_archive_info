# PLAN — 브라우저 기반 OCR 인벤토리 자동 입력 (통합본)

**작성일**: 2026-06-08
**상태**: Phase 1 (인덱스 빌드) 완료 · Phase 2 (셀 검출 자기상관 방식) 진행 중
**대체 대상**:
- `PLAN_ocr_visual_matching.md` (시각 매칭 알고리즘 / Python 구현 전제)
- `PLAN_ocr_runtime_distribution.md` (Python 런타임 ~750MB 자동 다운로드 배포)

## 갱신 이력
- **2026-06-08 #3** (시각 매칭 본질 한계 발견 + C 옵션 채택): testImage 76장(모바일) 검증에서 셀 검출은 자기상관 기반으로 동작하지만 시각 매칭 NCC ≥ 0.85 = 0%. 원인은 PLAN_ocr_visual_matching.md §1.3 이 예언한 본질 미스매치 — **셀 안에는 hex 프레임 + 보라색 배경 + 작은 아이콘 + 카운트 텍스트, SchaleDB 는 깨끗한 정면 아이콘**. 해결 방향: **셀에서 hex 프레임 + 배경을 자동 제거 후 깨끗한 아이콘만 추출** (= visual_matching §3.3.1 의 원래 의도) + 자동 적용 임계값을 0.85 → 0.7 로 완화 + top-5 후보 UI 활용. §3.5 신설.
- **2026-06-08 #2** (셀 검출 알고리즘 재설계): `extract_inventory.py` 의 adaptiveThreshold + findContours 알고리즘이 모바일 인벤토리(3120×1440, 셀들이 거의 붙어있는 그리드)에 적용 불가로 검증됨. testImage 1번 이미지에서 셀 1/20 검출. 더 일반화된 **자기상관(autocorrelation) 기반 그리드 주기 검출** 로 §3.3.1 교체 — PC/모바일 무관 검출 목표.
- **2026-06-08 #1** (초안): Python → JS/WASM 이전, 로컬(Tauri) 전용으로 결정.

---

## 0. 핵심 결정 — 한 줄

> **"수량 OCR + 아이템 시각 매칭"** 을 **Python → JS/WASM 으로 옮긴다**.
> 결과: 정확도(visual matching) + 일반 사용자 배포(runtime) 두 문제 동시에 해결. **Tauri desktop 앱 한정 노출**, 웹 SPA 는 미노출.

---

## 1. 배경 — 왜 통합인가

### 1.1 두 기존 PLAN 의 한계

| | 푸는 문제 | 남는 문제 |
|---|---|---|
| **visual_matching** | 매칭 정확도 (현재 ~0% → 목표 90%) | 일반 사용자 배포 ✗ (Python 셋업 필요) |
| **runtime_distribution** | 일반 사용자 배포 (~750MB 자동 DL) | 매칭 정확도 ✗ |

**직교 문제**. 따로 진행하면 둘 다 끝나야 사용자가 쓸 수 있음.

### 1.2 인사이트 — OCR 부담이 줄어들면 환경 자체가 바뀐다

visual_matching 의 핵심:
- 이름 OCR 의존을 버리고 **시각 매칭만으로** 아이템 식별
- OCR 은 `x278` 같은 **숫자 추출** 만 담당

→ **PaddleOCR 같은 거대 엔진이 더 이상 필요 없다**. 숫자 OCR 만 가능하면 충분.

### 1.3 JS/WASM 실행이 가능해지는 이유

| 작업 | 도구 | 크기 |
|---|---|---|
| 시각 매칭 (`matchTemplate`, 색 히스토그램, pHash) | **OpenCV.js** | ~10MB (WASM) |
| 숫자 OCR (`x\d+` 패턴) | **Tesseract.js** | ~3MB (WASM + eng traineddata) |
| 인덱스 (아이콘 atlas + hist + phash) | 빌드 산출물 | ~12MB |
| 합계 | | **~25MB (Tauri 번들 동봉)** |

- 데스크탑 .dmg : 6MB → ~31MB (vs runtime_distribution 의 6MB → +750MB 별도 다운로드)
- Tauri WebView 안의 JS 가 동일하게 동작 → 별도 Python 프로세스 불필요
- 노출 범위는 **Tauri desktop 전용** (`isTauri()` 가드 유지). 웹 SPA 에는 메뉴 미노출

---

## 2. 목표 / 비목표

### 2.1 목표

- Tauri desktop 앱 사용자가 추가 셋업 (Python, pip) 없이 OCR 사용 — 앱 설치 후 즉시 사용
- 매칭 정확도: top-1 ≥ 90%, 자동 적용 임계값 통과율 ≥ 80%
- 영구 오프라인 작동 (Tauri 앱 번들에 모든 리소스 동봉)

### 2.2 비목표

- **웹 SPA 노출** — `isTauri()` 가드 유지, 웹에서는 OCR 메뉴 미노출
- 한국어 텍스트 OCR (시각 매칭이 대체)
- 다중 OCR 엔진 (Tesseract 단일)
- iOS/Android
- 모델/리소스 자동 업데이트 (앱 빌드와 동반)

---

## 3. 아키텍처

### 3.1 데이터 흐름 (Tauri WebView 내 단일 경로)

```
[사용자] 인벤토리 스크린샷 선택
   ↓
[OpenCV.js] 자기상관(autocorrelation) 기반 그리드 주기 검출 + 색 분산 셀 검증
   ↓
각 셀:
   ├─ [Tesseract.js] 숫자 영역만 자르고 `x?\d+` 추출 → 수량
   └─ [시각 매칭 파이프라인 — OpenCV.js]
        ├─ ① 아이콘 영역 자동 검출 (Otsu + 최대 contour, fallback 중앙 60% crop)
        ├─ ② 96×96 정규화
        ├─ ③ 색상 히스토그램 (1245 → ~200)
        ├─ ④ pHash 64-bit (200 → ~50)
        └─ ⑤ matchTemplate NCC (50 → top-5)
   ↓
[TS] top-1 score ≥ 0.85 → 자동 체크 / 미만 → 수동 선택
   ↓
인벤토리 자동 기입
```

### 3.2 빌드 타임 — 아이콘 인덱스

| 데이터 | 소스 | 빌드 결과 | 배포 위치 |
|---|---|---|---|
| 아이콘 PNG (1245개, 96×96) | SchaleDB | `src-tauri/resources/ocr/icons.bin` (Atlas 합본) | Tauri `bundle.resources` |
| 색 히스토그램 (1245개 × 64bin) | OpenCV.js 빌드 스크립트 | `src-tauri/resources/ocr/hist.bin` (Float32Array) | Tauri `bundle.resources` |
| pHash (1245개 × 64-bit) | OpenCV.js | `src-tauri/resources/ocr/phash.bin` (BigUint64Array) | Tauri `bundle.resources` |
| 메타 (id, name, category) | SchaleDB items.json | `src-tauri/resources/ocr/items.json` | Tauri `bundle.resources` |

**빌드 스크립트**: `tools/ocr_build_index.ts` (Node, SchaleDB fetch → OpenCV.js로 인덱스 계산 → 바이너리 저장). 게임 패치 후 재실행 → 앱 새 빌드에 동봉.

### 3.3 런타임 — 로드 전략

```ts
// 인벤토리 페이지 진입 시 lazy load — 모두 Tauri 번들 내부에서 즉시 로드
const [cv, Tesseract, atlas, hist, phash, meta] = await Promise.all([
  import('@techstark/opencv-js'),
  import('tesseract.js'),
  fetch('/ocr/icons.bin').then(r => r.arrayBuffer()),
  fetch('/ocr/hist.bin').then(r => r.arrayBuffer()),
  fetch('/ocr/phash.bin').then(r => r.arrayBuffer()),
  fetch('/ocr/items.json').then(r => r.json()),
]);
```

- 모든 리소스가 Tauri 앱 번들에 동봉 → **네트워크 다운로드 다이얼로그 자체가 없음**
- Web Worker 안에서 실행 → 메인 스레드 블록 없음
- `isTauri()` 가드 유지 → 웹 SPA 에서는 이 경로 자체에 진입 불가

### 3.4 셀 검출 — 자기상관 기반 그리드 주기 검출 (§3.3.1 대체)

기존 `extract_inventory.py` 의 detect_cells (adaptiveThreshold + findContours) 는 셀들이 거의 붙어있는 모바일 인벤토리에서 contour 분리가 안 됨. PC/모바일/다양한 인벤토리 화면을 모두 처리하기 위해 **자기상관(autocorrelation) 기반 그리드 주기 검출** 로 교체.

#### 동작 원리

인벤토리 셀들은 어떤 화면이든 **일정 간격으로 반복되는 격자 패턴**을 형성. 이 주기성을 1D 프로파일의 자기상관에서 강한 peak 로 검출.

```
1. 이미지 → 그레이스케일 → Sobel edge magnitude (또는 색 분산 map)
2. 가로 방향 column projection → 길이 W 의 1D 신호 (sx)
   세로 방향 row projection → 길이 H 의 1D 신호 (sy)
3. 각 신호의 normalized autocorrelation 계산
4. autocorrelation 의 peak detection:
   - lag=0 (자기 자신) 제외
   - 첫 strong peak 의 위치 = 셀 가로/세로 주기 (P_x, P_y)
5. 격자 시작점 (offset_x, offset_y) 추정:
   - 원본 신호의 peak 위치들에서 P_x 간격으로 가장 잘 fit 되는 offset 검색
6. 격자점 집합 = {(offset_x + i × P_x, offset_y + j × P_y)}
7. 셀 영역 = (격자점, P_x × P_y) 사각형
```

#### 셀 후보 검증 (False positive 제거)

격자가 화면 일부에만 있는 경우 (모바일: 우측만) 격자 외부 영역의 셀 후보를 컷:

```
각 셀 후보:
  - 색 분산 (variance of HSV) ≥ 임계값?  → 셀 안에는 다양한 색이 있어야 함
  - 평균 밝기가 극단치 (순백/순흑) 아닌지 → 빈 영역 컷
통과한 후보만 유효 셀
```

#### 강건성 옵션 (R 단계별 추가)

- **R-A**: edge map 대신 saturation map (HSV S 채널) 사용 — 셀 안의 색감 대비를 더 강하게 반영
- **R-B**: 카운트 텍스트가 셀 안 강한 edge 라서 노이즈가 되면, projection 전에 텍스트 영역 마스킹 (밝은 작은 영역 컷)
- **R-C**: autocorrelation 의 multi-peak 처리 — 여러 후보 주기 중 셀 영역 검증이 가장 많이 통과하는 주기 선택

#### 알고리즘 의존

- **OpenCV.js** — Sobel, color conversion, matchTemplate (자기상관용 sliding window)
- 자기상관 계산은 cv.matchTemplate(signal, signal, CV_TM_CCOEFF_NORMED) 로 1D 처리 가능 (또는 직접 dot product 합 — 가벼움)

#### 작업 분량 (Phase 2 안에 흡수)

- 기본 자기상관 그리드 검출: 4-6h
- 셀 후보 검증 + 강건성 옵션 (R-A/B/C 중 필요한 만큼): 2-3h
- testImage 76장으로 정확도 측정 + 임계값 튜닝: 2-3h
- **소계 1-2일**

### 3.5 셀에서 깨끗한 아이콘 추출 (게임 ↔ SchaleDB 정렬)

testImage 76장 검증에서 발견된 본질 한계 — 게임 인게임 셀 안에는 hex 프레임 + 보라색 배경 + 카운트 텍스트가 함께 있어 SchaleDB 의 깨끗한 정면 아이콘과 시각적으로 매우 다름. 셀 검출이 정확해도 matchTemplate NCC 가 0.5 이하로 머무름.

**해결: 매칭 전에 셀에서 hex 프레임 + 배경을 자동 제거하고 아이콘 영역만 추출.**

#### 알고리즘 (pure TS, Node + 브라우저 공용)

```
입력: 셀 RGBA (cellW × cellH)
1. 카운트 영역 제외 — 상단 75% 만 작업 영역 (workH = cellH × 0.75)
2. 배경 색 추정 — 4 코너 픽셀의 평균 RGB = bg
3. 전경 마스크 — 각 픽셀의 색 거리 |pixel - bg| > THRESHOLD → 아이콘 픽셀
4. 마스크의 bbox 계산 — min/max (x, y) 의 픽셀들 + safety margin
5. fallback — bbox 면적이 너무 작거나 너무 크면 중앙 60% crop
6. 정사각형 패딩 — 짧은 변을 긴 변에 맞춤 (검은 픽셀로 채움 또는 bbox 그대로 늘림)
7. 96×96 리사이즈 (bilinear 또는 nearest)
```

#### 강건성 옵션

- **R-A**: 4 코너 평균이 hex 프레임의 보라색이라면 → 코너가 아닌 셀 외곽선의 픽셀 들 사용
- **R-B**: 마스크 노이즈 → morphology open (5×5) 적용 (pure TS 로 작성 시 ~30줄)
- **R-C**: 가장 큰 connected component 만 채택 (CC labeling 직접 구현 ~80줄) — bbox 만 쓰면 카운트 텍스트나 외곽 노이즈가 bbox 를 끌어가는 문제 회피

#### 임계값 완화

자동 적용 임계값을 0.85 → **0.7** 로 완화. 0.4~0.7 구간은 top-5 후보 UI 로 사용자에게 선택 받음. 미만은 미매칭.

| NCC 범위 | 동작 |
|---|---|
| ≥ 0.70 | 자동 매칭 |
| 0.40 ~ 0.70 | top-5 후보 보여줌, 사용자가 선택 |
| < 0.40 | 미매칭 (사용자가 manual 선택 가능) |

이 정책은 본질적 시각 차이로 NCC 0.85 가 어려운 경우 대비 + 사용자 확인 단계가 이미 미리보기 테이블에 있는 점을 활용.

#### 작업 분량

- pure TS 추출 함수 (4코너 BG + 거리 마스킹 + bbox + 정사각형 패딩 + 리사이즈): 3-4h
- iconExtraction.ts 갈아끼우기 + verify 통합: 1-2h
- 임계값 완화 (multiStageMatch.ts + OcrImportDialog.tsx): 30분
- 76장 검증 + 임계값 튜닝: 1-2h
- **소계 6-8h**

---

## 4. 단계별 작업

### Phase 0 — POC (검증, **선결**)

**목적**: OpenCV.js 의 `matchTemplate` + Tesseract.js 의 숫자 OCR 이 브라우저에서 동작 가능하며 합리적 속도인지 확인. **이 단계가 실패하면 전체 PLAN 폐기.**

- [ ] 0.1 단일 테스트 페이지 (`/dev/ocr-poc`, 개발용)
- [ ] 0.2 OpenCV.js 로드 → 테스트 셀 1장 + 정답 아이콘 1장으로 `matchTemplate` NCC 호출, 점수 출력
- [ ] 0.3 Tesseract.js 로드 → 셀의 수량 영역(하단 25%) 만 잘라 `x\d+` 추출 검증
- [ ] 0.4 셀당 비용 측정 (목표: ≤ 300ms / 셀, 20셀 ≤ 10초)
- [ ] 0.5 정확도 sanity check: 알려진 정답 5개로 top-1 매칭 일치 여부

**탈출 기준**: 0.4, 0.5 둘 다 통과. 미달 시 → 기존 PLAN_ocr_runtime_distribution.md 로 회귀 검토.

**예상 시간**: 2-3시간.

---

### Phase 1 — 인덱스 빌드 파이프라인 (1일)

- [ ] 1.1 `tools/ocr_build_index.ts` 신규
  - SchaleDB items.json fetch → 1245 아이콘 다운로드 → 96×96 정규화
  - OpenCV.js 로 색 히스토그램 + pHash 계산
  - `public/ocr/{icons.bin, hist.bin, phash.bin, items.json}` 출력
- [ ] 1.2 `package.json` 에 `npm run build:ocr-index` 추가
- [ ] 1.3 (선택) 인덱스 버전 헤더 (`schaledb_revision` 등) 포함 → 게임 패치 시 강제 재빌드 가능
- [ ] 1.4 빌드된 인덱스(~12MB)를 `src-tauri/resources/ocr/` 에 출력 → `tauri.conf.json` `bundle.resources` 에 등록. repo 에 커밋할지 git LFS 사용할지 결정

---

### Phase 2 — 코어 매칭 엔진 (3-4일)

기존 `tools/ocr/extract_inventory.py` 의 Python 로직을 TS 로 이식.

- [ ] 2.1 `src/lib/ocr/cellDetection.ts` — **자기상관 기반 그리드 주기 검출** (§3.4 참조). adaptiveThreshold+findContours 방식은 폐기 — 모바일 인벤토리에 부적합한 것으로 testImage 검증에서 확인됨
- [ ] 2.2 `src/lib/ocr/iconExtraction.ts` — 셀 → 96×96 아이콘 추출 (Otsu + contour)
- [ ] 2.3 `src/lib/ocr/colorHist.ts` — 1245 후보 → ~200 narrow
- [ ] 2.4 `src/lib/ocr/phashMatch.ts` — ~200 → ~50 narrow
- [ ] 2.5 `src/lib/ocr/templateMatch.ts` — `cv.matchTemplate` NCC 정밀
- [ ] 2.6 `src/lib/ocr/countOcr.ts` — Tesseract.js 로 셀 하단 수량만 추출
- [ ] 2.7 `src/lib/ocr/pipeline.ts` — 통합 entry point (이미지 → `OcrItem[]` 반환)
- [ ] 2.8 Web Worker 래퍼 (`src/lib/ocr/worker.ts`)

---

### Phase 3 — UI 통합 (1-2일)

- [ ] 3.1 `OcrImportDialog.tsx` — Python rpc 호출 부분 제거, Worker postMessage 로 교체
- [ ] 3.2 진행률 표시 (셀별 매칭 상황을 Worker 가 progress event 로 전송)
- [ ] 3.3 자동 적용 ≥ 0.85, 0.5~0.85 는 후보 5개 노출, < 0.5 는 수동 선택 UI
- [ ] 3.4 `lib/ocrMatching.ts` (Korean alias / jamo / Levenshtein) **삭제** — 시각 매칭이 대체
- [ ] 3.5 `isTauri()` 가드 **유지** — 웹 SPA 에는 OCR 메뉴 미노출 (현재 동작 그대로)

---

### Phase 4 — 정리 / 배포 (0.5일)

- [ ] 4.1 `my-site/tools/ocr/` 전체 디렉토리 삭제 (Python 코드, venv, icon_hashes.json, remap.json)
- [ ] 4.2 `src-tauri/src/ocr.rs` 삭제 + `lib.rs` 등록 제거
- [ ] 4.3 `tauri.conf.json` `bundle.resources` 에서 OCR Python 리소스 제거
- [ ] 4.4 `.gitignore` 의 `tools/ocr/venv/`, `__pycache__` 등 정리
- [ ] 4.5 CLAUDE.md 의 OCR 섹션 업데이트 (Python 언급 제거, Tauri WebView JS/WASM 기반으로 재작성)
- [ ] 4.6 README / PLAN_desktop_app.md 업데이트

---

## 5. 두 기존 PLAN 과의 차이

### 5.1 visual_matching 대비

| 항목 | visual_matching | 본 PLAN |
|---|---|---|
| 시각 매칭 알고리즘 | 그대로 채택 (색 히스토 + pHash + matchTemplate NCC) | 동일 |
| 구현 언어 | Python (OpenCV) | **TS + OpenCV.js (WASM)** |
| OCR 엔진 | PaddleOCR (수량만) | **Tesseract.js (숫자만)** |
| 실행 환경 | Tauri desktop only | **Tauri desktop only** (동일, Python 프로세스 제거가 핵심 차이) |
| 인덱스 빌드 | `tools/ocr/build_icon_index.py` | `tools/ocr_build_index.ts` |
| 파일 크기 | venv 600MB + 모델 200MB | OpenCV.js 10MB + Tesseract 3MB + 인덱스 12MB |

알고리즘 자체는 visual_matching 의 [§3.3](PLAN_ocr_visual_matching.md), [§14](PLAN_ocr_visual_matching.md) 를 그대로 따른다. 구현 언어만 교체.

### 5.2 runtime_distribution 대비

| 항목 | runtime_distribution | 본 PLAN |
|---|---|---|
| 배포 모델 | R2 manifest + minisign + 자동 DL ~750MB | **앱 번들 동봉 +25MB** |
| 인프라 | Cloudflare R2 호스팅 + 서명 키 관리 | 불필요 (Tauri bundle.resources) |
| 첫 사용 다이얼로그 | "OCR 엔진을 다운로드합니다" | **없음** (설치 시점에 이미 포함) |
| 무결성 검증 | SHA256 + minisign | Tauri 업데이터의 기존 minisign 으로 앱 전체 검증 (별도 검증 불필요) |
| 디스크 사용 | ~2GB | ~25MB |
| 작업 분량 | Phase A~E (2-3주) | 본 PLAN 의 Phase 0~4 (1-2주) |

→ runtime_distribution 의 모든 항목이 **불필요해진다**.

---

## 6. 리스크 / 미해결 검증 항목

### R1. OpenCV.js `matchTemplate` 성능

브라우저 WASM 에서 96×96 NCC × 50 후보 × 20셀 = 1000회. Python 의 5ms × 1000 = 5초 기준이 브라우저에서 2-5배 느릴 가능성. 목표 ≤ 10초.

**검증**: Phase 0.4. 미달 시 → 후보 narrow 단계의 threshold 조정 또는 SIMD 빌드 사용.

### R2. Tesseract.js 숫자 OCR 정확도

PaddleOCR 한국어 모델이 수량을 100% 맞췄지만, Tesseract.js 영문 모델이 게임 폰트의 `x278` 을 동등하게 읽을지 미검증.

**검증**: Phase 0.3. `tessedit_char_whitelist=x0123456789` 로 제약 + 셀 영역 사전 처리 (이진화) 적용.

### R3. 자기상관 그리드 검출의 노이즈 강건성

셀 안의 카운트 텍스트(`x123`)가 강한 edge 라서 projection 신호에 영향 줌. 또는 그리드가 화면 일부에만 있는 경우 (모바일: 우측만) 격자 외부에 false positive peak 가능.

**대응**: §3.4 의 R-A (saturation map), R-B (텍스트 마스킹), R-C (multi-peak) 옵션을 통해 단계적 강건화. testImage 76장의 다양한 케이스로 임계값 튜닝.

### R4. OpenCV.js 의 메모리 누수

WASM heap 의 `cv.Mat` 객체는 명시적 `.delete()` 호출이 필요. 셀 20개 × 함수당 5-10 Mat 생성 → 누수 시 메모리 폭증 가능.

**검증**: Phase 2.7 통합 후 1000회 반복 호출하며 메모리 모니터링.

### R5. 앱 번들 크기

인덱스 ~12MB + OpenCV.js/Tesseract.js WASM ~13MB = 약 +25MB. 현 .dmg 6MB → ~31MB. macOS notarization, GitHub Releases 업로드 모두 정상 범위지만, **차분 업데이트** 시점에 사용자 체감 다운로드 시간 증가.

**대응**: 인덱스 변경 빈도가 낮으면 (게임 패치 시에만) 업데이트 영향 미미. Tauri 업데이터의 patch 모드 검토.

---

## 7. 견적

| Phase | 작업 | 시간 |
|---|---|---|
| 0 | POC 검증 | 2-3h |
| 1 | 인덱스 빌드 파이프라인 | 1d |
| 2 | 코어 매칭 엔진 | 3-4d |
| 3 | UI 통합 | 1-2d |
| 4 | 정리 / 배포 | 0.5d |
| **합계** | | **6-8d** |

vs visual_matching (7-10h, Python) + runtime_distribution (2-3주, 인프라) = 약 **3주 vs 1-2주** 로 단축.
또한 runtime_distribution 의 R2/서명/디스크 공간 모니터링 등 **운영 부담 모두 제거**.

---

## 8. 다음 액션

1. **Phase 0 POC 진행 여부 결정** ← 현재
2. POC 통과 시 → Phase 1 (인덱스 빌드) 진입, 기존 두 PLAN 은 본 PLAN 상단의 "대체 대상" 표기로 표시한 채 보존
3. POC 실패 시 → `PLAN_ocr_runtime_distribution.md` 로 회귀

---

## 9. 결정 필요 항목

### 9.1 본 PLAN 으로 확정 시

- [ ] OpenCV.js 패키지 선택: `@techstark/opencv-js` vs `opencv.js-node` vs 직접 빌드 (SIMD 옵션)
- [ ] Tesseract.js 버전 (v5 권장, traineddata 는 번들 동봉)
- [ ] 인덱스 repo 커밋 방식: 일반 git vs git LFS (~12MB 바이너리)

### 9.2 기존 PLAN 처리

- [ ] `PLAN_ocr_visual_matching.md` — 보존 + 상단에 "superseded by PLAN_ocr_browser_matching.md" 표시
- [ ] `PLAN_ocr_runtime_distribution.md` — 보존 (untracked 그대로) 또는 본 PLAN 확정 후 삭제

### 9.3 운영

- [ ] 인덱스 빌드 주기: 게임 패치 후 수동 vs CI cron
- [ ] 자동 적용 임계값: 0.85 vs 0.80 (Phase 0/F 결과로 조정)
