# PLAN — OCR 인벤토리 자동 입력 v2: 이미지 매칭 우선 전략

**작성일**: 2026-05-07
**대상 단계**: Phase 3 (OCR 인벤토리 자동 입력) 의 매칭 알고리즘 재설계
**전제**: Phase 1, 2 완료. Phase 3 의 cell detection / count OCR / pHash visual 까지 구현됨.

---

## 1. 배경 / 동기

### 1.1 현재 Phase 3 구현의 동작

```
이미지 → 적응적 그리드 검출 → 셀 단위 분리
  ↓
각 셀:
  ├─ OCR (PaddleOCR 한국어)        → 이름 텍스트 + 수량
  └─ pHash (64-bit perceptual hash) → top-K 시각 후보

  ↓
TS 매칭:
  ├─ 영문→한글 alias 적용 후
  ├─ 자모 분해 N-gram + Levenshtein → 텍스트 매칭
  ├─ pHash 후보 top-K
  └─ 결합 로직 (visual+text / text-only / visual-only / 임계값)
```

### 1.2 실제 동작 분석 (테스트 이미지 1686×1188, 4×5 BD 인벤토리)

| 신호 | 정확도 |
|---|---|
| 셀 검출 | 20/20 ✓ |
| **수량 OCR** | **20/20 정확** ✓ (`x278`, `x188`, ..., `x633`) |
| 이름 OCR | "EX REDNNWNTER", "EX TRTY", "EX DEHERAA" 등 — **거의 모든 케이스 왜곡** |
| pHash 시각 매칭 | 정답 d=28-30, 무관한 항목 d=20 — **노이즈와 시그널 구분 불가** |
| 텍스트 매칭 (alias 적용 후) | 영문 학교명 9/12 한글 변환 성공, 그러나 BD 항목명 구조 ("기초 전술 교육 BD\n(트리니티)") 불일치로 최종 매칭 여전히 실패 |

### 1.3 근본 원인 진단

OCR 텍스트로 매칭이 안 되는 이유:
- **카드 디자인이 스타일화된 아이콘 + 영문 학교명** — SchaleDB 의 한글 항목명 구조와 완전히 다름
- 게임 화면의 "EX" 라벨 ↔ SchaleDB 의 "전술 교육 BD" 라벨 — 구조적 미스매치

pHash 가 안 되는 이유:
- **64-bit 압축으로 미세 차이 손실** — 학교 로고 형태, 등급 색조 같은 특징이 사라짐
- **셀(280×280) vs SchaleDB(96×96) 레이아웃 미스매치** — 셀에는 흰 테두리 + 카운트 텍스트 + 아이콘 ~50% 영역, SchaleDB 는 아이콘이 프레임 꽉 채움. 둘을 32×32 로 압축하면 정렬이 깨짐

### 1.4 해결 방향

> **"OCR 은 텍스트 인식이 강하니 수량만 맡기고, 아이템 식별은 시각적으로"**

VArchiveMacro 가 보여준 통찰: **OCR 자체를 정확하게** 만들거나 **OCR 의존 자체를 줄이자**. 우리 케이스는 후자.

---

## 2. 새 접근의 핵심 원칙

| 원칙 | 이유 |
|---|---|
| OCR 은 카운트 추출에만 사용 | 이미 100% 정확. `x278` 같은 깨끗한 텍스트는 일반 OCR 의 강점 |
| 아이템 식별은 픽셀 단위 비교 | 게임 아이콘 ↔ SchaleDB 아이콘 은 본질적으로 같은 그림 — 직접 비교가 가장 정확 |
| 다단계 매칭 (coarse → fine) | 1245개 후보 전수 검사는 비용 큼. 빠른 필터 → 정밀 매칭으로 성능 + 정확도 균형 |
| TS 매칭 로직 단순화 | 현재의 alias / jamo / Levenshtein / 임계값 결합 — 모두 OCR 부정확함 보완용. 이미지 매칭이 정확하면 불필요 |
| 모든 동작 오프라인 가능 | 첫 실행 시 인덱스 빌드 후 인터넷 불필요 |

---

## 3. 아키텍처 설계

### 3.1 전체 데이터 흐름

```
입력 이미지
   ↓
[적응적 그리드 검출] ─── 기존 그대로 유지
   ↓
각 셀:
   ├─ [수량 OCR] ─────────── 기존 로직 유지 (PaddleOCR)
   └─ [아이콘 식별 파이프라인] ── 새 구현
        │
        ├─ ① 아이콘 영역 자동 검출
        ├─ ② 정규화 (96×96 등 표준 크기)
        ├─ ③ 색상 히스토그램 → 1차 필터 (1245 → ~200)
        ├─ ④ pHash → 2차 필터 (200 → ~50)
        └─ ⑤ matchTemplate (NCC) → 정밀 매칭 (50 → top-5)
   ↓
JSON 출력
   ↓
[TS] top-1 점수 ≥ 0.85 → 자동 체크 / 미만 → 사용자 선택
```

### 3.2 다단계 매칭 파이프라인 — 이유

전수 검사 비용:
- 1245 후보 × 20 셀 × matchTemplate(96×96) ≈ 5ms × 24,900 = ~125초 — 너무 느림

다단계 narrow:
| 단계 | 후보 수 변화 | 셀당 비용 | 단계 누적 |
|---|---|---|---|
| 색상 히스토그램 | 1245 → 200 | 10ms (벡터화) | 10ms |
| pHash | 200 → 50 | 1ms × 200 = 0.2ms (이미 구현됨) | 10.2ms |
| matchTemplate | 50 → top-5 | 5ms × 50 = 250ms | 260ms |

20 셀 총 ~5초. 실용적.

### 3.3 단계별 알고리즘 상세

#### 3.3.1 ① 아이콘 영역 자동 검출

게임 카드 셀 = `흰 테두리 + 그라디언트 배경 + 중앙 아이콘 + 하단 카운트`

```python
def extract_icon_from_cell(cell: np.ndarray) -> np.ndarray:
    """셀에서 아이콘 영역만 추출해 정사각형으로 패딩."""
    h, w = cell.shape[:2]

    # 1. 카운트 텍스트 영역 마스킹 (하단 25% 보통 'x123')
    work = cell[: int(h * 0.75)].copy()

    # 2. 배경(밝은 색) 임계값 처리 → 아이콘 영역 마스크
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    # Otsu 자동 임계값 — 다양한 배경 색상 대응
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    # 3. 가장 큰 connected component → bbox
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        # fallback: 중앙 60% 정사각형
        return _center_crop(cell, ratio=0.6)

    # 가장 큰 영역
    largest = max(contours, key=cv2.contourArea)
    x, y, cw, ch = cv2.boundingRect(largest)

    # 4. 정사각형 패딩 (가로/세로 짧은 쪽에 맞춤)
    side = max(cw, ch)
    pad_x = (side - cw) // 2
    pad_y = (side - ch) // 2
    cropped = work[max(0, y - pad_y) : y + ch + pad_y, max(0, x - pad_x) : x + cw + pad_x]

    # 5. 96×96 으로 리사이즈 (SchaleDB 표준 크기)
    return cv2.resize(cropped, (96, 96), interpolation=cv2.INTER_AREA)
```

**왜 자동 검출이 필요한가**: 셀 크기 / 아이콘 위치는 인벤토리 종류 / 화면 비율마다 다름. 하드코딩된 비율(15-65% × 15-85%) 은 우리 테스트 이미지에만 fit. 자동 검출이 일반화 가능.

#### 3.3.2 ② 색상 히스토그램 매칭 (1차 필터)

```python
def color_hist_distance(icon_a: np.ndarray, icon_b: np.ndarray) -> float:
    """HSV 색상 히스토그램 비교 — 학교/등급 색상 추론."""
    hsv_a = cv2.cvtColor(icon_a, cv2.COLOR_BGR2HSV)
    hsv_b = cv2.cvtColor(icon_b, cv2.COLOR_BGR2HSV)

    # H, S 채널만 (V 는 조명 차이 영향 큼) — 32×32 빈
    hist_a = cv2.calcHist([hsv_a], [0, 1], None, [32, 32], [0, 180, 0, 256])
    hist_b = cv2.calcHist([hsv_b], [0, 1], None, [32, 32], [0, 180, 0, 256])
    cv2.normalize(hist_a, hist_a)
    cv2.normalize(hist_b, hist_b)

    # Bhattacharyya distance → 0 (완전 일치) ~ 1 (완전 불일치)
    return cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_BHATTACHARYYA)
```

각 후보 아이콘의 색상 히스토그램은 미리 계산해 인덱스에 저장 (`color_hist` 필드). 셀의 색상 히스토그램과 비교 → 거리 가까운 200개 통과.

**왜 색상이 첫 단계인가**: 매우 빠르고 (10ms 안에 1245 비교 가능), 학교/등급 같은 카테고리 정보를 잘 캡처.

#### 3.3.3 ③ pHash (2차 필터, 기존 로직 활용)

이미 구현된 `compute_cell_phash` 와 `find_visual_candidates`. 입력만 정규화된 96×96 아이콘으로 변경. top-50 통과.

#### 3.3.4 ④ matchTemplate NCC (3차 정밀)

```python
def template_match_score(cell_icon: np.ndarray, candidate_icon: np.ndarray) -> float:
    """정규화 cross-correlation. 1.0 = 완벽 일치, 0 ≈ 무관, -1 = 음의 상관."""
    # 동일 크기 가정 (96×96 으로 사전 정규화)
    if cell_icon.shape != candidate_icon.shape:
        candidate_icon = cv2.resize(candidate_icon, cell_icon.shape[1::-1])

    # 그레이스케일에서 비교 — 색상 변동 (게임 ↔ SchaleDB 렌더 차이) 영향 ↓
    gray_cell = cv2.cvtColor(cell_icon, cv2.COLOR_BGR2GRAY)
    gray_cand = cv2.cvtColor(candidate_icon, cv2.COLOR_BGR2GRAY)

    res = cv2.matchTemplate(gray_cell, gray_cand, cv2.TM_CCOEFF_NORMED)
    # 같은 크기일 때 res 는 1×1 행렬
    return float(res.max())
```

**점수 해석**:
- 0.95-1.0: 완전 일치 (이상적)
- 0.85-0.95: 매우 유사, 자동 적용 권장
- 0.7-0.85: 비슷, 사용자 검토 권장
- < 0.7: 불일치 가능성 큼

**색상 매칭과의 결합** (선택): 그레이 NCC 점수 + 색상 거리 가중 평균 → 최종 점수.

### 3.4 인덱스 구조 변경

기존 `icon_hashes.json`:
```json
{ "items": [{ "key": "item:3030", "name": "...", "phash": "abc...", "category": "item" }] }
```

새 구조 — `icon_index.json`:
```json
{
  "version": 2,
  "size": 96,
  "items": [
    {
      "key": "item:3030",
      "name": "기초 전술 교육 BD (게헨나)",
      "category": "item",
      "phash": "abc...",
      "color_hist": "<base64 압축 32×32 hist>",
      "icon_path": "icons/item_3030.png"
    }
  ]
}
```

별도 디렉토리에 아이콘 파일 저장:
```
tools/ocr/
├── build_icon_index.py
├── icon_index.json          (~500KB — 메타+히스토그램)
└── icons/                    (~7-8MB — 96×96 PNG 파일들)
    ├── item_3030.png
    ├── item_3031.png
    ├── ...
    └── equipment_8005.png
```

### 3.5 JSON 출력 포맷 변경

```json
{
  "items": [
    {
      "count": 278,
      "bbox": [20, 41, 352, 275],
      "candidates": [
        {
          "key": "item:3013",
          "name": "최상급 전술 교육 BD (붉은겨울)",
          "score": 0.92,
          "scores": {
            "color": 0.91,
            "phash": 0.71,
            "template": 0.92
          }
        },
        ...
      ]
    }
  ],
  "warnings": []
}
```

**OCR 텍스트 필드 (`name`, `confidence`) 제거** — 더 이상 사용 안 함.

---

## 4. 구현 단계

### Phase A — 로컬 아이콘 저장 (1h)

#### A.1 `build_icon_index.py` 개정
- 다운로드한 webp 를 96×96 PNG 로 정규화 후 `tools/ocr/icons/<key>.png` 저장
- 색상 히스토그램 사전 계산 (HSV 32×32) → JSON 에 base64 인코딩으로 포함
- 출력 파일명을 `icon_hashes.json` → `icon_index.json` (v2 표시)

#### A.2 검증
- `icons/` 디렉토리 1245개 파일 생성됨
- 디스크 사용 ~7-8MB
- `icon_index.json` ~500KB (히스토그램 포함)

### Phase B — 아이콘 영역 자동 검출 (2h)

#### B.1 `extract_icon_from_cell` 함수 구현
- Otsu 임계값 + 컨투어 → bbox
- 정사각형 패딩 + 96×96 리사이즈
- fallback: 중앙 60% (검출 실패 시)

#### B.2 디버그 도구 — 셀별 추출 결과 시각화
- `--debug-output <dir>` 옵션 추가
- 각 셀의 (원본 / 검출된 아이콘) 저장 → 사람이 검수

#### B.3 검증
- 테스트 이미지 20셀 → 20개 아이콘 영역 정확 추출
- 다른 인벤토리 타입 캡처 (보고서/장비) 으로 일반화 확인

### Phase C — 다단계 매칭 엔진 (3-4h)

#### C.1 색상 히스토그램 매칭
- `color_hist_distance` 함수
- 인덱스의 `color_hist` 디코딩 → 모든 후보와 거리 계산 → 정렬 top-200

#### C.2 pHash 통합 (기존 활용)
- 입력만 정규화된 96×96 으로 변경
- 200 후보 → top-50

#### C.3 matchTemplate NCC
- `template_match_score` 함수
- 50 후보 → top-5

#### C.4 점수 통합 정책
- 옵션 1: template 점수만 사용 (가장 정확)
- 옵션 2: color × 0.3 + template × 0.7 가중 평균
- 추천: 옵션 1 부터 시작, 실측 후 결합 여부 결정

### Phase D — JSON 포맷 변경 + extract_inventory.py 통합 (0.5-1h)

#### D.1 OCR 이름 추출 코드 제거
- `parse_text_to_item` → `parse_count_only` 로 단순화
- name / confidence 필드 출력에서 제거

#### D.2 새 매칭 파이프라인 호출
```python
def process_image(image_path, ocr_engine, icon_index):
    for cell in cells:
        # OCR 은 카운트만
        count = extract_count_via_ocr(cell, ocr_engine)
        # 이미지 매칭
        icon = extract_icon_from_cell(cell)
        candidates = match_icon(icon, icon_index)  # 다단계 파이프라인
        items.append({...})
```

### Phase E — TS 측 단순화 (1h)

#### E.1 `ocrMatching.ts` 대폭 축소 / 제거
- `applyEnglishAliases`, `decomposeHangul`, `ngramSimilarity`, `levenshteinSimilarity`, `matchItemName`, `topMatches` — **모두 삭제**
- 이름 검색 (수동 선택 시) 은 단순 substring 매칭으로 대체

#### E.2 `OcrImportDialog.tsx` 매칭 로직 교체
- 텍스트 매칭 / 결합 로직 제거
- top candidate 점수 기준 결정:
  - score ≥ 0.85: 자동 적용 (체크박스 ON)
  - 0.7 ≤ score < 0.85: 적용 가능 (체크박스 ON, ⚠ 표시)
  - score < 0.7: 사용자 선택 필요 (체크박스 OFF)

#### E.3 `findInventoryKey` 함수는 유지
- 키 prefix 변환 로직은 여전히 필요

### Phase F — 검증 + 튜닝 (2h)

#### F.1 회귀 테스트
- 현재 테스트 이미지 (전술 교육 BD) 재실행
- 기대: 20셀 모두 학교 + 등급 정확 식별

#### F.2 일반화 테스트
- 다른 인벤토리 타입 캡처:
  - 활동 보고서 (4종)
  - 장비 강화석 (4종)
  - 모자/머리핀/장갑 등 장비
  - 학생 엘레프 (학생별)
- 각 케이스에서 자동 식별 비율 측정

#### F.3 임계값 튜닝
- 점수 분포 분석 (정답 vs 오답)
- 자동 적용 임계값 (0.85 초기값) 조정

---

## 5. 인벤토리 타입별 예상 효과

| 인벤토리 타입 | 현재 | 새 접근 | 비고 |
|---|---|---|---|
| 전술 교육 BD (스타일 아이콘) | 자동 매칭 사실상 불가 | **거의 자동** | 학교 색상 + 등급 hue + 로고 형태 결합 |
| 활동 보고서 (4종) | 한글 OCR 70-80% | **거의 100%** | 4개 후보 중 visual 로 명확 |
| 학생 엘레프 (학생별) | 학생 얼굴 distinctive 라 잘 됨 | **더 정확** | 200+ 학생 중에서도 정확 |
| 모자/머리핀/장갑 등 장비 | OCR 70-80% | **거의 100%** | 카테고리 + 티어 색상 명확 |
| 무기 부품 (4계열 × 4등급) | 60-70% | **거의 100%** | 모양 + 색상 |
| 장비 강화석 (4종) | 70-80% | **거의 100%** | |
| 오파츠 / 애착 선물 | 60-70% | **거의 100%** | |

---

## 6. 트레이드오프 / 리스크

### 6.1 트레이드오프

| 측면 | 영향 | 평가 |
|---|---|---|
| 디스크 공간 | +7-8MB (아이콘 파일들) | 무시 가능 |
| 첫 실행 시간 | 셀당 ~250ms × 20 = ~5초 (현재 ~2초의 2.5배) | 수용 가능 |
| 인덱스 빌드 시간 | 1회 1245 다운로드 = 2-3분 (현재 동일) | 변화 없음 |
| 코드 복잡도 (TS) | alias / jamo / Levenshtein 제거 → **단순화** | 개선 |
| 코드 복잡도 (Python) | 매칭 파이프라인 추가 → 약간 증가 | 보통 |
| 인터넷 의존 | 첫 인덱스 빌드 후 완전 오프라인 | 동일 |

### 6.2 리스크 / 미해결 질문

#### R1. 아이콘 영역 자동 검출 실패
**증상**: Otsu 임계값이 배경/아이콘 분리에 실패하면 잘못된 영역 추출.
**완화**: 검출 실패 fallback (중앙 60% 크롭). 디버그 옵션으로 첫 사용자가 검수.

#### R2. 게임과 SchaleDB 아이콘의 미세 차이
**증상**: 게임은 추가 효과 (글로우, 한정 효과 표식) 가 있을 수 있음.
**완화**: matchTemplate 의 그레이스케일 비교 + 0.85 임계값 (완벽 일치 요구 X).

#### R3. 다단계 필터에서 정답이 컷됨
**증상**: 색상 필터에서 200 컷오프, 그 이후 필터들이 정답을 못 봄.
**완화**:
- 1차 컷오프 넉넉히 (200 → 300 으로 조정 가능)
- 검증 단계에서 정답이 어느 단계에서 빠지는지 분석 도구 추가

#### R4. 학교가 같고 등급만 다른 BD 항목 (4개씩)
**증상**: 색상이 거의 같음 → 색상 필터로는 구분 불가
**완화**: pHash + matchTemplate 가 형태 차이를 잡아냄 (등급별로 작은 시각 차이 존재 — 별 표시, 띠 색깔 등)

#### R5. 게임 업데이트로 새 아이템 추가
**증상**: 인덱스에 없는 아이템 → 매칭 실패
**완화**: 정기 인덱스 재빌드 (사용자가 수동으로 `build_icon_index.py` 재실행). UI 에 "인덱스 갱신" 버튼 추가도 고려.

### 6.3 본 계획에서 의도적으로 제외 (out-of-scope)

- 학생 엘레프 인벤토리 그룹 catalog 추가 (현재 `inventoryCatalog.ts` 에 없음 — 별도 작업)
- 사용자가 직접 새 아이콘 / alias 등록하는 기능
- ML 기반 임베딩 (CNN feature extraction) — 인덱스 사이즈 + 의존성 증가
- 멀티 이미지 일괄 처리 시 진행률 표시 개선

---

## 7. 시간 추산

| 단계 | 예상 시간 | 누적 |
|---|---|---|
| A. 로컬 아이콘 저장 + 인덱스 v2 빌드 | 1h | 1h |
| B. 아이콘 영역 자동 검출 | 2h | 3h |
| C. 다단계 매칭 엔진 (color + pHash + template) | 3-4h | 7h |
| D. JSON 포맷 변경 + 통합 | 0.5-1h | 8h |
| E. TS 단순화 (`ocrMatching.ts` 축소, dialog 로직 교체) | 1h | 9h |
| F. 검증 + 임계값 튜닝 | 2h | 11h |
| **총** | **9-11h** | |

---

## 8. 결정 필요 항목

### 8.1 결정 완료 (이 문서로 확정)

| 항목 | 결정 | 근거 |
|---|---|---|
| 매칭 신호 | 이미지 (수량은 OCR) | OCR 이름 매칭의 한계 입증, 픽셀 매칭이 정확 |
| 매칭 알고리즘 | 다단계 (color → pHash → matchTemplate) | 전수 검사 비용 + 정확도 균형 |
| 아이콘 정규화 크기 | 96×96 | SchaleDB 원본과 비슷, 충분한 디테일 보존 |
| 인덱스 포맷 | 별도 디렉토리 + JSON 메타 | 디스크 영구 저장, 오프라인 가능 |

### 8.2 진행 전 추가 결정 필요

#### Q1. 점수 결합 방식
**옵션**:
- A: matchTemplate 점수만 사용
- B: color × 0.3 + template × 0.7 가중 평균
- C: 다 결합 (color + pHash + template) 가중 평균

**추천**: A 로 시작 (단순). Phase F 검증 결과 보고 B/C 로 변경 검토.

#### Q2. 자동 적용 임계값
**옵션**:
- A: 0.85 이상 자동 적용 (보수적)
- B: 0.75 이상 자동 적용 (적극적)
- C: 0.95 이상만 자동, 나머지 사용자 검토 (가장 보수적)

**추천**: A. Phase F 검증 결과로 0.80 / 0.90 으로 미세 조정.

#### Q3. OCR 텍스트 매칭 코드 보존 여부
**옵션**:
- A: 완전 삭제 (`ocrMatching.ts` 의 alias / jamo / Levenshtein 등 — Phase E 에서 제거)
- B: 주석 처리 / 별도 파일로 보관 (혹시 fallback 으로 쓸 수도)

**추천**: A. 더 이상 사용 안 하니 코드 단순성 우선.

#### Q4. 인덱스 갱신 빈도
**옵션**:
- A: 사용자 수동 재실행 (`build_icon_index.py`)
- B: 앱에서 "인덱스 갱신" 버튼 (UI 통합)
- C: 첫 실행 시 자동 + 30일마다 자동

**추천**: A 로 시작, 향후 B 로 발전 가능.

---

## 9. 검증 계획

### 9.1 단위 검증 (각 Phase 끝)

#### Phase A
- [ ] `tools/ocr/icons/` 에 1245개 PNG 생성됨
- [ ] `icon_index.json` 의 첫 항목 확인 (key/name/phash/color_hist 필드 모두 존재)

#### Phase B
- [ ] 테스트 이미지 20셀 → 20개 96×96 아이콘 추출 (디버그 출력으로 시각 확인)
- [ ] 무관한 영역 추출 시 fallback 동작 확인

#### Phase C
- [ ] 색상 히스토그램 거리 계산 정상
- [ ] 다단계 narrow 시 후보 수 변화 (1245 → 200 → 50 → 5) 확인
- [ ] 정답 항목이 각 단계 통과하는지 확인

#### Phase D
- [ ] 새 JSON 포맷으로 정상 출력
- [ ] OCR name 필드 제거 확인

#### Phase E
- [ ] TS 빌드 통과 (`ocrMatching.ts` 의존 코드 제거 후)
- [ ] OcrImportDialog 가 새 candidates 형식으로 정상 렌더

#### Phase F
- [ ] 테스트 이미지 (전술 교육 BD): 20/20 학교+등급 정확
- [ ] 다른 인벤토리 타입 (≥3종): 자동 식별 ≥80%

### 9.2 회귀 검증

- [ ] 기존 OCR 카운트 추출 정확도 동일 (20/20)
- [ ] 인벤토리 키 prefix 변환 (`findInventoryKey`) 정상 동작
- [ ] OcrImportDialog UI 표시 정상 (top-K 칩, 변경 버튼, 수동 검색)

### 9.3 성능 검증

- [ ] 셀당 매칭 시간 < 500ms
- [ ] 20셀 종단 시간 < 10초 (PaddleOCR 모델 로딩 제외)
- [ ] 인덱스 빌드 시간 < 5분

---

## 10. 후속 가능 확장 (out-of-scope, 참고)

| 확장 | 가치 | 비용 |
|---|---|---|
| 사용자가 캡처한 이미지를 인덱스 보강에 활용 | 게임 패치 / 신규 아이콘 즉시 대응 | 사용자 라벨링 UI 필요 (~3-5h) |
| ML 임베딩 (CNN feature extraction) | 더 정확한 매칭 (인쇄/렌더 차이 robust) | 모델 + 의존성 추가 (~10-20h) |
| 인덱스 자동 갱신 cron | 사용자 손길 ↓ | UI + 스케줄러 (~2h) |
| 일괄 처리 진행률 표시 개선 | UX | UI 작업 (~1h) |
| 인벤토리 카테고리 hint UI | 매칭 정확도 ↑ (BD 인벤토리만 56개로 narrow 등) | UI + 매칭 변경 (~2h) |
| OCR 이미지 전처리 사용자 옵션 | 어려운 캡처에 대한 fallback | UI + 옵션 전달 (~2h) |

---

## 11. 다음 액션

진행 결정 시:
1. Phase A (1h) — `build_icon_index.py` 개정 + 인덱스 v2 빌드
2. 빌드 결과 검증 (디스크 사용량, 파일 수, 인덱스 구조)
3. 이상 없으면 Phase B 부터 순서대로 진행
4. 각 Phase 끝마다 사용자 검토 (디버그 출력 시각 확인 등)
5. Phase F 의 검증 결과로 8.2 의 결정 항목 (Q1-Q4) 확정

미진행 시 (보존):
- 현재 OCR + alias + pHash 시스템 그대로 유지
- 사용자 수동 매핑이 빈번해 UX 가 떨어짐 — 큰 인벤토리 (전술 교육 BD 같은 20개) 캡처 시 큰 부담

---

## 12. 비교 — 현재 vs 새 접근

### 코드 측면
```
현재:
  ├─ Python: cell detection + OCR + pHash
  ├─ TS:     applyEnglishAliases (영문→한글 fuzzy)
  │         decomposeHangul + ngramSimilarity (자모 분해)
  │         levenshteinSimilarity (편집거리)
  │         matchItemName (5단 결합 매칭)
  │         topMatches (수동 선택용)
  │         OCR_REMAP, ENGLISH_KOREAN_ALIASES (사전들)
  │         findInventoryKey (prefix 변환)
  └─ OcrImportDialog: visual + text 결합 로직, 임계값 분기

새 접근:
  ├─ Python: cell detection + count-only OCR + 다단계 이미지 매칭
  ├─ TS:     findInventoryKey (유지)
  └─ OcrImportDialog: 단순 점수 기반 분기
```

**제거되는 코드 (LoC 추정)**: ~250줄 (`ocrMatching.ts` 대부분 + dialog 결합 로직)
**추가되는 코드**: ~150줄 (Python 다단계 매칭)

### 정확도 측면
- 텍스트 OCR 의존 ↓ → 게임 폰트 / 화면 비율 / 해상도 의존성 ↓
- 시각 매칭 정확도 ↑ → 자동 식별 비율 70% → 95%+

### 사용자 경험 측면
- 자동 식별 ↑ → 수동 매핑 부담 ↓
- 매칭 신뢰도 명확 (점수 0~1) → 어느 항목을 검토해야 할지 직관적

---

## 부록 A. 매칭 알고리즘 선택 근거

### A.1 왜 cv2.matchTemplate (NCC) 인가?

| 후보 | 장점 | 단점 | 선택 |
|---|---|---|---|
| pHash 64-bit | 빠름, 단순 | 해상도 압축 → 미세 차이 손실 | ✗ (1차 필터로 활용) |
| dHash / wHash | pHash 와 보완 | 본질적 한계 동일 | ✗ |
| matchTemplate (NCC) | 픽셀 단위 정확, OpenCV 내장 | 동일 크기/방향 가정 | ✓ |
| ORB + descriptor matching | 회전/스케일 invariant | 단순한 아이콘은 feature 부족 | ✗ |
| SIFT | 매우 robust | 라이선스 / 속도 / 구현 복잡도 | ✗ |
| CNN feature embedding | 가장 정확 | 의존성 + 모델 크기 + 인덱스 사이즈 | △ (후속 확장 옵션) |

### A.2 왜 정규화된 96×96 인가?

- SchaleDB 원본 아이콘 ≈ 80-128px 범위 → 96 이 평균
- 너무 작으면 (32, 64) 디테일 손실, 너무 크면 (256+) 매칭 비용 증가
- 96 = 32 의 3배 → pHash 8×8 자연스러운 정렬

### A.3 왜 그레이스케일에서 matchTemplate 인가?

- 게임과 SchaleDB 의 색상 약간 다를 수 있음 (게임 효과, 배경 글로우 등)
- 그레이스케일 NCC 는 형태 유사도에 집중
- 색상 정보는 1차 필터 (히스토그램) 에서 이미 활용

---

## 13. 파일 수정 매니페스트

각 파일별 변경 사항을 명시. 구현 시 이 표를 체크리스트로 활용.

### 13.1 신규 생성 파일

| 경로 | 목적 | 크기 추정 |
|---|---|---|
| `my-site/tools/ocr/icons/` (디렉토리) | 96×96 PNG 정규화 아이콘 1245개 보관 | 7-8MB |
| `my-site/tools/ocr/icon_index.json` | v2 인덱스 (메타 + phash + color_hist base64) | ~500KB |

### 13.2 수정 파일

#### `my-site/tools/ocr/build_icon_index.py` (Phase A)

| 변경 영역 | 변경 내용 |
|---|---|
| 출력 경로 | `icon_hashes.json` → `icon_index.json` (v2 표시) |
| 다운로드 후 처리 | PIL.Image → 96×96 리사이즈 → `icons/<key>.png` 로 저장 |
| 신규 필드 계산 | 각 아이콘의 HSV 32×32 색상 히스토그램 → base64 인코딩 |
| 메타 필드 | `version: 2`, `size: 96`, items 별 `icon_path`, `color_hist` 추가 |
| 기존 `phash` | 96×96 정규화된 이미지로 재계산 (이전 인덱스와 호환 X) |

#### `my-site/tools/ocr/extract_inventory.py` (Phase B, C, D)

| 변경 영역 | 변경 내용 |
|---|---|
| import | `PIL.Image` 추가 사용 |
| `parse_text_to_item` | **삭제** → `parse_count_only(texts)` 로 교체 (이름 추출 제거) |
| `OCR_REMAP` 관련 | 미사용 (남겨도 무방하나 정리 권장) |
| `COUNT_PATTERNS` 사용 | `parse_count_only` 안에 inline |
| `compute_cell_phash`, `crop_icon_region` | 신규 `extract_icon_from_cell` 로 교체 |
| `find_visual_candidates` | 다단계 매칭 함수 시퀀스로 교체 (`color_filter` → `phash_filter` → `template_rerank`) |
| `OcrItem` dataclass | `name`, `confidence` 필드 제거 또는 deprecated 처리 |
| `process_image` | 새 파이프라인 호출 흐름 |
| `_extract_texts_from_result` | 그대로 유지 (수량 OCR 에 필요) |
| `_build_ocr_engine` | 그대로 유지 |
| `preprocess_for_ocr` | 수량 OCR 에만 적용. 이미지 매칭에는 raw cell 사용 |

#### `my-site/src/service/planner/components/OcrImportDialog.tsx` (Phase E)

| 변경 영역 | 변경 내용 |
|---|---|
| `OcrItem` interface | `name`, `confidence`, `phash` 필드 제거. `candidates` 만 핵심 |
| `MatchSource` 타입 | `'manual' \| 'auto' \| 'low'` 으로 단순화 (visual+text 같은 구분 제거) |
| `runOcr` 함수 | text matching 호출 (`matchItemName`) **삭제**. candidates 의 top-1 점수만 사용 |
| `findInventoryKey` | **유지** (Python 키 → 인벤토리 키 변환 여전히 필요) |
| `MatchCell` 컴포넌트 | 변경 버튼 → 단순 텍스트 substring 검색만 (`topMatches` 호출 제거) |
| 임계값 분기 | score ≥ 0.85 자동 ON / 0.70-0.85 ON+⚠ / <0.70 OFF |

#### `my-site/src/lib/ocrMatching.ts` (Phase E)

| 함수/상수 | 처리 |
|---|---|
| `OCR_REMAP` | **삭제** |
| `ENGLISH_KOREAN_ALIASES` | **삭제** |
| `applyEnglishAliases` | **삭제** |
| `normalize` | **삭제** (호출처 없어짐) |
| `CHOSEONG / JUNGSEONG / JONGSEONG` | **삭제** |
| `decomposeHangul` | **삭제** |
| `ngramSimilarity` | **삭제** |
| `levenshteinSimilarity` | **삭제** |
| `matchItemName` | **삭제** |
| `topMatches` | **유지하되 단순화** — 순수 substring/포함 매칭으로 변경 (수동 선택 UI 용) |
| `MatchCandidate`, `MatchResult` | **삭제 또는 단순화** |

또는 파일 전체를 `searchCandidates.ts` 로 이름 변경 후 단순화.

### 13.3 변경 없는 파일 (참고)

- `my-site/src-tauri/src/ocr.rs` — Rust command 자체는 변경 없음
- `my-site/src-tauri/tauri.conf.json` — `bundle.resources` 에 `icons/` 디렉토리 추가
- `my-site/tools/ocr/README.md` — 새 파이프라인 / 인덱스 빌드 설명 갱신
- `my-site/tools/ocr/requirements.txt` — `pillow`, `imagehash`, `requests` 이미 포함됨 (추가 의존성 없음)
- `my-site/src/service/planner/pages/InventoryPage.tsx` — OcrImportDialog 호출부 그대로

### 13.4 tauri.conf.json `bundle.resources` 갱신

```json
"resources": {
  "../tools/ocr/extract_inventory.py": "tools/ocr/extract_inventory.py",
  "../tools/ocr/remap.json": "tools/ocr/remap.json",
  "../tools/ocr/icon_index.json": "tools/ocr/icon_index.json",
  "../tools/ocr/icons": "tools/ocr/icons"
}
```

마지막 줄 디렉토리 추가 — Tauri 빌드 시 1245개 PNG 전체가 prod 번들에 포함.

---

## 14. 상세 코드 스켈레톤

핵심 함수의 완전한 의사 구현. 구현 시 그대로 시작점으로 활용.

### 14.1 `extract_icon_from_cell` (Phase B)

```python
def extract_icon_from_cell(cell: np.ndarray, target_size: int = 96) -> np.ndarray:
    """
    셀에서 아이콘 영역만 자동 추출해 정사각형 target_size 로 정규화.

    실패 시 fallback: 셀 중앙 60% 정사각형 크롭.
    """
    h, w = cell.shape[:2]

    # 1. 카운트 텍스트 영역 (하단 25%) 마스킹 — 매칭 노이즈 방지
    work = cell[: int(h * 0.75)].copy()

    # 2. 배경 임계값 — Otsu 적응 (배경 색상 무관)
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    mask = cv2.morphologyEx(
        mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)
    )

    # 3. 가장 큰 외곽 컨투어 → bbox
    contours, _ = cv2.findContours(
        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours or all(cv2.contourArea(c) < 100 for c in contours):
        # fallback
        return _center_square_resize(cell, target_size)

    largest = max(contours, key=cv2.contourArea)
    x, y, cw, ch = cv2.boundingRect(largest)

    # 너무 작거나 (셀의 5% 미만) 너무 크면 (셀의 90% 초과) fallback
    cell_area = h * w
    bbox_area = cw * ch
    if bbox_area < cell_area * 0.05 or bbox_area > cell_area * 0.9:
        return _center_square_resize(cell, target_size)

    # 4. 정사각형 패딩
    side = max(cw, ch)
    pad_x = (side - cw) // 2
    pad_y = (side - ch) // 2
    x0 = max(0, x - pad_x)
    y0 = max(0, y - pad_y)
    x1 = min(work.shape[1], x + cw + pad_x)
    y1 = min(work.shape[0], y + ch + pad_y)
    icon = work[y0:y1, x0:x1]

    # 5. 정사각형 강제 (패딩 부족할 수 있음)
    ih, iw = icon.shape[:2]
    if ih != iw:
        s = max(ih, iw)
        canvas = np.full((s, s, 3), 255, dtype=np.uint8)
        canvas[
            (s - ih) // 2 : (s - ih) // 2 + ih,
            (s - iw) // 2 : (s - iw) // 2 + iw,
        ] = icon
        icon = canvas

    return cv2.resize(icon, (target_size, target_size), interpolation=cv2.INTER_AREA)


def _center_square_resize(cell: np.ndarray, target_size: int) -> np.ndarray:
    """Fallback: 셀 중앙 60% 정사각형 크롭 + 리사이즈."""
    h, w = cell.shape[:2]
    side = int(min(h, w) * 0.6)
    cx, cy = w // 2, int(h * 0.4)  # 카운트 영역 피해 위쪽으로
    x0 = max(0, cx - side // 2)
    y0 = max(0, cy - side // 2)
    crop = cell[y0 : y0 + side, x0 : x0 + side]
    return cv2.resize(crop, (target_size, target_size), interpolation=cv2.INTER_AREA)
```

### 14.2 색상 히스토그램 매칭 (Phase C)

```python
def compute_color_hist(icon: np.ndarray) -> np.ndarray:
    """HSV 32×32 (H×S) 히스토그램. V 채널은 조명 의존성 ↑ 라 제외."""
    hsv = cv2.cvtColor(icon, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
    cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
    return hist


def color_hist_similarity(hist_a: np.ndarray, hist_b: np.ndarray) -> float:
    """Bhattacharyya 거리 → similarity [0, 1] (1=일치)."""
    d = cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_BHATTACHARYYA)
    return max(0.0, 1.0 - d)


def color_filter_candidates(
    cell_icon: np.ndarray,
    index: list[dict],  # 각 항목에 'color_hist' (base64 인코딩) 필드 포함
    keep: int = 200,
) -> list[dict]:
    """색상 히스토그램 거리 기준 top-K 통과."""
    cell_hist = compute_color_hist(cell_icon)
    scored: list[tuple[float, dict]] = []
    for item in index:
        cand_hist = _decode_color_hist(item['color_hist'])
        score = color_hist_similarity(cell_hist, cand_hist)
        scored.append((score, item))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [item for _, item in scored[:keep]]
```

### 14.3 matchTemplate NCC 정밀 매칭 (Phase C)

```python
def template_match_score(cell_icon: np.ndarray, candidate_path: Path) -> float:
    """
    그레이스케일 NCC. 동일 크기 (96×96) 가정.
    반환: [-1, 1] — 1=완벽 일치, 0=무관, -1=음의 상관.
    """
    cand = cv2.imread(str(candidate_path))
    if cand is None:
        return 0.0
    if cand.shape != cell_icon.shape:
        cand = cv2.resize(cand, cell_icon.shape[1::-1])

    g1 = cv2.cvtColor(cell_icon, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(cand, cv2.COLOR_BGR2GRAY)
    res = cv2.matchTemplate(g1, g2, cv2.TM_CCOEFF_NORMED)
    return float(res.max())


def template_rerank(
    cell_icon: np.ndarray,
    candidates: list[dict],  # color filter 통과 항목
    icons_dir: Path,
    top_k: int = 5,
) -> list[dict]:
    """후보 각각에 NCC 적용 → top_k 반환 (점수 추가)."""
    scored: list[tuple[float, dict]] = []
    for item in candidates:
        icon_path = icons_dir / item['icon_path']
        score = template_match_score(cell_icon, icon_path)
        scored.append((score, {**item, 'template_score': score}))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [item for _, item in scored[:top_k]]
```

### 14.4 통합 매칭 파이프라인 (Phase C)

```python
def match_icon_pipeline(
    cell: np.ndarray,
    index: list[dict],
    icons_dir: Path,
) -> list[dict]:
    """
    1245 후보 → color 200 → pHash 50 → template top-5
    각 후보 dict 에 단계별 점수 누적.
    """
    icon = extract_icon_from_cell(cell, target_size=96)

    # 1차: 색상 필터
    color_filtered = color_filter_candidates(icon, index, keep=200)

    # 2차: pHash 재정렬
    icon_phash = imagehash.phash(
        Image.fromarray(cv2.cvtColor(icon, cv2.COLOR_BGR2RGB)),
        hash_size=8,
    )
    phash_scored = [
        (
            64 - (icon_phash - imagehash.hex_to_hash(item['phash'])),
            item,
        )
        for item in color_filtered
    ]
    phash_scored.sort(key=lambda t: t[0], reverse=True)
    phash_top50 = [item for _, item in phash_scored[:50]]

    # 3차: matchTemplate 정밀
    return template_rerank(icon, phash_top50, icons_dir, top_k=5)
```

### 14.5 수량 OCR 단순화 (Phase D)

```python
# 기존 parse_text_to_item 을 parse_count_only 로 교체
def parse_count_only(texts: list[tuple[str, float]]) -> tuple[int | None, float]:
    """
    OCR 결과에서 수량만 추출. 이름 추출은 제거.

    우선순위: xX× prefix 매치 → 보유 라벨 매치 → 단독 숫자 중 최대
    """
    if not texts:
        return None, 0.0

    confidences = [conf for _, conf in texts]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    x_matches: list[int] = []
    label_matches: list[int] = []
    bare_matches: list[int] = []

    pat_x = re.compile(r"[xX×]\s*([\d,]+)")
    pat_label = re.compile(r"보유\s*[:：]?\s*([\d,]+)")
    pat_bare = re.compile(r"^([\d,]+)$")

    for text, _ in texts:
        m = pat_x.search(text)
        if m:
            try:
                x_matches.append(int(m.group(1).replace(",", "")))
                continue
            except ValueError:
                pass
        m = pat_label.search(text)
        if m:
            try:
                label_matches.append(int(m.group(1).replace(",", "")))
                continue
            except ValueError:
                pass
        m = pat_bare.match(text.strip())
        if m:
            try:
                bare_matches.append(int(m.group(1).replace(",", "")))
            except ValueError:
                pass

    count = None
    if x_matches:
        count = max(x_matches)
    elif label_matches:
        count = max(label_matches)
    elif bare_matches:
        count = max(bare_matches)

    return count, avg_conf
```

### 14.6 새 OcrItem dataclass (Phase D)

```python
@dataclass
class MatchCandidate:
    """이미지 매칭 결과 후보 — 점수 세분화."""
    key: str          # "item:3030" 등
    name: str
    score: float      # 최종 통합 점수 (template_score 기본)
    color_score: float
    phash_score: float
    template_score: float


@dataclass
class OcrItem:
    count: int        # OCR 추출 (이름은 더 이상 없음)
    confidence: float # OCR confidence (수량 매칭용)
    bbox: list[int]
    candidates: list[MatchCandidate]
```

### 14.7 TS 측 새 데이터 모델 (Phase E)

```ts
// OcrImportDialog.tsx — 단순화된 interface
interface MatchCandidate {
  key: string;          // Python: "item:3030" / "equipment:8005"
  name: string;
  score: number;        // 최종 점수
  colorScore?: number;
  phashScore?: number;
  templateScore?: number;
}

interface OcrItem {
  count: number;
  confidence: number;
  bbox: number[];
  candidates: MatchCandidate[];
}

type Confidence = 'high' | 'medium' | 'low';

function classify(score: number): Confidence {
  if (score >= 0.85) return 'high';   // 자동 적용
  if (score >= 0.7) return 'medium';  // 적용 가능 ⚠
  return 'low';                        // 수동 선택
}
```

---

## 15. 구현 순서 체크리스트

각 항목은 독립적으로 검증 가능. 순서대로 진행 권장.

### Day 1 — 인덱스 v2 + 아이콘 검출 (3시간)

#### 1.1 Phase A — 인덱스 v2 빌드 (1h)
- [ ] `build_icon_index.py` 의 다운로드 처리 함수 갱신
  - [ ] 다운로드 후 96×96 PIL 리사이즈
  - [ ] `tools/ocr/icons/<key>.png` 으로 저장
  - [ ] HSV 32×32 색상 히스토그램 계산 + base64 인코딩
- [ ] 출력 메타 변경: `version: 2`, `size: 96`, items 별 `icon_path`, `color_hist` 추가
- [ ] 인덱스 빌드 실행 (`python build_icon_index.py`)
- [ ] **검증**: `icons/` 디렉토리에 1245개 PNG 생성 (디스크 ≈ 7-8MB)
- [ ] **검증**: `icon_index.json` 파일 크기 ≈ 500KB, 첫 항목 schema 점검

#### 1.2 Phase B — 아이콘 영역 자동 검출 (2h)
- [ ] `extract_inventory.py` 에 `extract_icon_from_cell` 함수 추가
- [ ] `_center_square_resize` fallback 함수 추가
- [ ] CLI 디버그 옵션 추가: `--debug-output <dir>` → 각 셀 + 추출된 아이콘 저장
- [ ] **검증**: 테스트 이미지로 디버그 실행 → 20개 셀 모두 96×96 아이콘 추출
- [ ] **검증**: 추출 결과 시각 검수 (아이콘 영역만 잘 잘렸는지)

### Day 2 — 매칭 엔진 + 통합 (4-5시간)

#### 2.1 Phase C — 다단계 매칭 엔진 (3-4h)
- [ ] `compute_color_hist`, `color_hist_similarity`, `color_filter_candidates` 구현
- [ ] base64 → numpy histogram 디코딩 함수 (`_decode_color_hist`)
- [ ] `template_match_score`, `template_rerank` 구현
- [ ] `match_icon_pipeline` 통합 함수
- [ ] **검증**: 셀 1개에 대해 단계별 narrow (1245 → 200 → 50 → 5) 확인
- [ ] **검증**: 단계별 정답 항목이 통과하는지 디버그 출력

#### 2.2 Phase D — JSON 출력 + 통합 (0.5-1h)
- [ ] `parse_text_to_item` → `parse_count_only` 교체
- [ ] `OcrItem`, `MatchCandidate` dataclass 갱신
- [ ] `process_image` 가 새 파이프라인 호출하도록 변경
- [ ] **검증**: 테스트 이미지로 전체 실행 → JSON 형식 확인 (`name` 필드 없음, `candidates` 풍부)

### Day 3 — TS 정리 + 검증 (3-4시간)

#### 3.1 Phase E — TS 단순화 (1h)
- [ ] `ocrMatching.ts` 의 alias/jamo/Levenshtein/normalize/decomposeHangul 등 모두 삭제
- [ ] `topMatches` 는 단순 substring 매칭으로 단순화 (또는 별도 파일 분리)
- [ ] `OcrImportDialog.tsx` 의 `runOcr` 에서 text matching 호출 삭제
- [ ] candidates 의 top-1 점수만으로 분기 (≥0.85 자동 / 0.7-0.85 ⚠ / <0.7 수동)
- [ ] `MatchCell` 컴포넌트 단순화
- [ ] **검증**: `npm run type-check` 통과
- [ ] **검증**: `npm run build` 통과

#### 3.2 Phase F — 검증 + 튜닝 (2h)
- [ ] 테스트 이미지 (전술 교육 BD) 재실행 → top-1 점수 분포 기록
- [ ] 정답 셀의 top-1 일치율 측정 (목표: 18/20 이상)
- [ ] 다른 인벤토리 타입 캡처 ≥ 2개로 일반화 검증
- [ ] 자동 적용 임계값 (0.85) 정합성 확인 — 너무 보수적이면 0.80 으로 완화
- [ ] **회귀**: 기존 카운트 추출 정확도 동일 (20/20) 유지
- [ ] **회귀**: TS 빌드 + Rust cargo check 통과

### Day 3.5 — 마무리 (1h)

- [ ] `tauri.conf.json` `bundle.resources` 에 `icons/` 추가
- [ ] `tools/ocr/README.md` 갱신 (build_icon_index.py 동작 변경 + Q&A)
- [ ] 임계값 / 단계별 후보 수 (200/50/5) 하드코딩 위치 주석 명시
- [ ] CLAUDE.md 에 새 흐름 한 줄 추가 (선택)

---

## 16. 롤백 / 호환성 전략

### 16.1 단계별 롤백 가능성

| Phase | 롤백 비용 | 방법 |
|---|---|---|
| A | 낮음 | `icon_index.json` v1 (기존 `icon_hashes.json`) 보존. v2 빌드 실패 시 v1 으로 회귀 |
| B | 낮음 | `extract_icon_from_cell` 새 함수 — 호출 안 하면 무영향 |
| C | 중 | 새 매칭 함수 별도 추가, `process_image` 가 호출 안 하면 무영향 |
| D | 높음 | OCR name 필드 제거가 breaking change — 신중 |
| E | 높음 | TS 측 함수 대량 삭제 — git 되돌리기 외 방법 없음 |
| F | — | 검증 단계, 코드 변경 없음 |

**권장**: A-C 는 기존 코드 옆에 신규 추가 (parallel implementation). D-E 에서 한 번에 전환. 문제 시 D-E commit 만 revert.

### 16.2 마이그레이션 중 호환성 유지 (선택적 — 안전 모드)

기간 한정으로 두 시스템 공존 가능:

```python
# extract_inventory.py
USE_V2_MATCHING = os.environ.get("OCR_USE_V2", "1") == "1"

def process_image(...):
    if USE_V2_MATCHING:
        return process_image_v2(...)  # 새 파이프라인
    else:
        return process_image_v1(...)  # 기존 OCR + pHash
```

장점: 즉시 ↔ 회귀 가능
단점: 코드 두 배 — Phase F 검증 후 한쪽 제거 필수

**추천**: 단순 일회 마이그레이션 — 두 시스템 동시 유지는 부담 큼. git revert 로 충분.

### 16.3 인덱스 v1/v2 호환

v1 `icon_hashes.json` 과 v2 `icon_index.json` 은 다른 파일이라 공존 가능. 코드는 v2 만 읽음. v1 은 Phase F 검증 완료 후 삭제.

```bash
# Phase F 검증 완료 후
rm tools/ocr/icon_hashes.json
```

### 16.4 게임 데이터 (인벤토리 타입) 호환

- 카운트 추출 로직은 동일 → 기존 인벤토리 데이터에 영향 없음
- 매칭 정확도 ↑ 만 변경 — 사용자가 이전에 입력한 데이터와 무관
- 새 인벤토리 캡처 시점부터 자동으로 새 파이프라인 활용

---

## 17. 알려진 OCR / 매칭 결과 사례

테스트 이미지 (`my-site/src-tauri/testImage/inventory_screenshot.png`, 1686×1188, 4×5 전술 교육 BD) 의 현 시스템 결과. 새 시스템 도입 시 비교 baseline.

### 17.1 셀별 현재 출력 (Phase 3 + alias + count fix 적용 후)

```
[ 0] count=  278  name='EX 지H보적R'        ← (실제: 기초 BD 붉은겨울 추정)
[ 1] count=  188  name='EX REDNNWNTER'   → alias: '붉은겨울'
[ 2] count=   40  name='EX REDWNTER'     → alias: '붉은겨울'
[ 3] count=  368  name='EX TRTY'         → alias: '트리니티'
[ 4] count=   87  name='EX T그'
[ 5] count=   67  name='EX TRNTY'        → alias: '트리니티'
[ 6] count=   89  name='EX TRKT'         (alias 실패 — TRINITY 거리 큼)
[ 7] count=  597  name='EX 이의일스'         (한글 왜곡)
[ 8] count=   74  name='E 이일'
[ 9] count=   33  name='EX DEHERAA'      → alias: '게헨나'
[10] count=   39  name='C EX 이HKA'
[11] count=  595  name='EX AKDOH'        → alias (0.5 임계값): '아비도스'
[12] count=  147  name='EX ABYDOS'       → alias: '아비도스'
[13] count=  114  name='E ABYDOH'        → alias: '아비도스'
[14] count=   64  name='EX ABVDOS'       → alias: '아비도스'
[15] count=  390  name='그n EX WLGAM'
[16] count=  104  name='EX MLJ'          (3글자 — alias 컷오프)
[17] count=   85  name='Tn EX MOLLEARAM' → alias: '밀레니엄'
[18] count=   77  name='Tn EX'
[19] count=  633  name='EX AWMJS'        (alias 실패)
```

### 17.2 현 시스템의 한계 정량화

| 항목 | 결과 |
|---|---|
| 카운트 정확도 | **20/20 (100%)** |
| OCR 이름 → SchaleDB 자동 매칭 성공 (현 임계값) | **0/20** (BD 항목명 구조 미스매치) |
| pHash top-1 (현 시스템): 정답 학교/등급 일치 | **2-3/20 추정** (대부분 무관한 가구/장비 매칭) |
| pHash top-5 안에 정답 포함 | **<5/20** |
| 자동 식별 비율 (전체) | **~0%** |
| 수동 매핑 부담 | **20개 모두 수동** |

### 17.3 새 시스템 목표 정량화

| 항목 | 목표 |
|---|---|
| 카운트 정확도 | 20/20 유지 |
| Template top-1 정답 일치 | **≥ 18/20 (90%)** |
| Template top-5 안에 정답 포함 | **≥ 19/20 (95%)** |
| 자동 적용 임계값 0.85 통과율 | **≥ 16/20 (80%)** |
| 수동 매핑 부담 | **≤ 2개** (가장 어려운 케이스만) |

Phase F 검증에서 이 목표 미달 시 — 임계값 조정 또는 매칭 알고리즘 보완 (예: color + template 가중 결합).

---

## 18. 운영 가이드 (구현 완료 후 사용자용)

### 18.1 인덱스 빌드 (1회 또는 게임 패치 후)

```bash
cd my-site/tools/ocr
source venv/bin/activate
python build_icon_index.py
```

소요 시간 2-3분. 인터넷 필요. 결과: `icon_index.json` + `icons/*.png`.

### 18.2 일반 사용 흐름

1. 데스크탑 앱에서 인벤토리 페이지 → "이미지에서 가져오기"
2. 캡처 파일 선택
3. OCR + 매칭 ~10초 (셀당 ~500ms)
4. 미리보기:
   - 초록 ✓ (high): 자동 체크
   - 노랑 ⚠ (medium): 체크되어 있지만 검토 권장
   - 빨강 ? (low): 체크 해제 / 사용자 선택 필요
5. 검토 후 적용

### 18.3 새 아이템 / 게임 패치 대응

게임에 새 인벤토리 아이템이 추가되면:

1. `build_icon_index.py` 재실행 → 최신 인덱스 갱신
2. 이전 캡처도 새 인덱스로 더 정확하게 매칭됨

### 18.4 문제 상황별 대응

| 증상 | 원인 후보 | 대응 |
|---|---|---|
| 모든 셀이 빨강 (low) | 새 인벤토리 타입 / 게임 UI 변경 | 인덱스 갱신 + 디버그 출력으로 아이콘 영역 검수 |
| 같은 학교/등급인데 다른 항목으로 매칭 | 등급 색상 미세 차이 / template 임계값 정합성 | 임계값 0.85 → 0.90 로 상향, 또는 color 가중치 ↑ |
| 카운트 일부 누락 | OCR 자체 실패 | 캡처 해상도 높이기 / 셀 검출 파라미터 (`MIN_CELL_AREA`) 조정 |

---

## 19. 다음 액션 (실행 흐름)

### 19.1 진행 결정 시
1. **확인**: 이 문서의 §8 결정 항목 (Q1-Q4) 추천 default 로 진행 OK
2. **Day 1 시작**: §15.1 (Phase A + B)
3. 각 Phase 끝 시점에 사용자가 검증 결과 확인
4. **Day 3 끝 시점**: Phase F 결과 보고 → §17.3 목표 달성 여부 평가
5. 미달 시 — §17.3 의 보완책 (가중 결합 등) 추가 검토

### 19.2 미진행 / 보류 시
- 현재 Phase 3 + 3개 fix (key prefix, count regex, alias) 적용된 시스템 유지
- 카운트 추출은 잘 동작, 이름 매칭은 수동 부담 ↑
- 큰 인벤토리 (전술 교육 BD 같은 20+) 캡처 시 매번 수동 매핑 발생

### 19.3 변경 결정 (계획 자체 수정 시)
- §8.2 (Q1-Q4) 항목 추천 default 변경 → 본 문서 수정
- 우선순위 / 단계 변경 → §15 체크리스트 갱신
