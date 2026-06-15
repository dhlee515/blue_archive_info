# OCR 시각 매칭 — 진행 기록

> **상태 (2026-06-15): 잠정 중단.** 자동매칭 임계 조정 (0.3+0.03) 까지 통합 완료. baseline top-1 60% / top-5 80% / top-50 100% (55 라벨 기준). 추가 개선 (Step C 재학습 / Step E full fine-tune) 은 라벨 200+ 확보 후 재개. 학습 인프라 모두 보존 — 재개 시 1-shot 실행 가능.
>
> Phase 0 (NCC 1:1) → 최종 DINOv2-small + 단색 합성 (narrow 200) 까지의 모든 시도 + 결과.
> 도메인: BlueArchive 게임 인벤토리 캡처 → 그리드 셀 검출 → SchaleDB 아이콘 매칭.

## 1. 목적

게임 인벤토리 캡처 한 장을 입력 → 각 셀의 아이콘을 자동 식별 → 인벤토리 데이터로 자동 입력. **셀 검출 (grid detection)** 과 **셀 → 아이콘 매칭 (visual similarity)** 두 단계.

## 2. 시작 상태 vs 최종 상태

### 2.1 진짜 정답률 (Phase A 라벨링 35셀 진단)

| 지표 | 시작 | DINOv2 narrow 200 | **narrow 폐기 (현재)** |
|---|---|---|---|
| **Pipeline top-1 정답률** | — | **8.6%** | **68.6%** ★ (8×) |
| Pipeline top-5 정답률 | — | 14.3% | 85.7% (6×) |
| 전체 1253 embed top-1 | — | 68.6% | 68.6% (변화 없음) |
| 전체 1253 embed top-50 | — | 100% | 100% |

→ 단순 narrow 폐기로 8× 개선 — 지금까지의 모든 모델/합성 튜닝 합쳐도 못 한 큰 win. proxy metric 함정의 결정적 사례.

### 2.2 147 testImage proxy metric (참고)

| 지표 | 시작 (NCC 1:1) | DINOv2 narrow 200 | **narrow 폐기 (현재)** |
|---|---|---|---|
| 그리드 검출 | 100% | 100% | 100% |
| top-1 cosine mean | — | 0.563 | 0.591 |
| top-1 ≥ 0.70 | 0% | 7.8% | **11.3%** |
| top-1 ≥ 0.85 | 0% | 1.0% | **1.4%** |
| margin median | 0.002 | 0.021 | 0.020 |
| margin ≥ 0.05 | 2.4% | 20.4% | 15.8% |
| margin ≥ 0.10 | 0% | 4.2% | 4.8% |
| margin ≥ 0.20 | 0% | 0.7% | 1.1% |
| match 시간 (셀당) | 32ms | 100ms | 96ms |

(주: margin ≥ 0.05 가 ↓ 한 건 proxy 신호. 진짜 정답률은 ↑.)

## 3. 진짜 정답률 (Phase A 라벨링 35셀)

라벨링 데이터 35셀 (2 이미지, mobile, 학생 favor 위주 + 강화석 + 장비 설계도) 기준:

### 3.1 narrow scenario 별 pipeline 정답률 (시뮬레이션)

| Scenario | 통과 | top-1 정답 | top-5 정답 |
|---|---|---|---|
| 이전 (500/300/200) | 5/35 | 3/35 (8.6%) | 5/35 (14.3%) |
| phash 폐기 (500/-/200) | 15/35 | 12/35 (34.3%) | 15/35 (42.9%) |
| **phash+hog 폐기 (500/-/-) ★ 채택** | **35/35** | **24/35 (68.6%)** | **30/35 (85.7%)** |
| hist 만 (1253/-/-) | 35/35 | 24/35 (68.6%) | 30/35 (85.7%) |

### 3.2 정답이 잘리는 stage

| Stage | 정답 잘림 | 원인 |
|---|---|---|
| hist (500 narrow) | 0/35 | 색 정보 robust |
| **phash (300 narrow)** | **27/35** ★ | hash hamming 이 광택/프레임 노이즈에 약함 |
| hog (200 narrow) | 3/35 | 일부 도메인 갭 영향 |
| embed (top-5) | 0/35 | DINOv2 embedding 자체는 강력 |

→ phash 가 정답 77% 자르는 게 가장 큰 병목. hash 기반 비교가 우리 도메인에 부적합.

### 3.3 인덱스 cover

| 지표 | 값 |
|---|---|
| 라벨 = "none" (인덱스에 없음) | 0/35 |
| **embed rank ≤ 50** | **35/35 (100%)** |

→ **인덱스 cover 완벽**. Phase B (SchaleDB 외 데이터 보강) 불필요.

### 3.4 남은 오답 (31.4%) 패턴 — fine-grained recognition

DINOv2 가 semantic clustering 이라 비슷한 외형 학생/장비 confusion:
- 에이미의 엘레프 → 아스나의 엘레프 (비슷한 헤어)
- 하루나의 엘레프 → 미유(수영복)의 엘레프
- 호시노의 엘레프 → 레이사의 엘레프
- 네루의 엘레프 → 카즈사(밴드)의 엘레프
- 도그택 설계도면 → 니콜라이 로켓 설계도면
- 비의서 조각 → 안내 팸플릿

이건 fine-tune / 렌더링 역산 영역 — semantic 모델로는 한계.

### 3.5 sample 편향 주의

35 sample 의 분포:
- 학생 엘레프 14개 (40%)
- 비의서 2개
- 강화석 4개
- 장비 설계도면 (목걸이/시계 등) 15개

mobile 캡처만, 카테고리 일부만. 다양한 sample 추가 필요 (다음 액션).

## 4. 채택한 변경 (현재 baseline)

| 컴포넌트 | 설정 |
|---|---|
| 셀 추출 | `extractIconFromCellRgba` — 4-corner BG 추정 + foreground bbox crop + 96×96 정규화. COUNT_RATIO 0.25 (하단 25% 카운트 영역 제외). |
| Grid 검출 | 자기상관 기반, `cellStartFromCenter` shift 로 P/2 어긋남 보정, alignment cut (inner_S > outer_S). |
| 인덱스 합성 | SchaleDB transparent 아이콘 → 게임 배경 단색 alpha 합성 (RGB 215, 225, 229). testImage 3810 셀 4-corner 평균. |
| Stage 1 (hist) | HSV 16×4×4 = 256 bins, top-500 narrow (통과율 100% 확인됨) |
| ~~Stage 2 (pHash)~~ | ~~64-bit DCT pHash, top-300 narrow~~ **폐기** (정답 77% 자름) |
| ~~Stage 3 (HOG)~~ | ~~cell 12, bins 9, dim 1764 fine-grained, top-200 narrow~~ **폐기** (정답 일부 자름) |
| **Stage 2 (embedding)** | **DINOv2-small CLS token 384-dim**, L2 정규화 → cosine. hist 500 → 최종 top-5 |

phash / hog 코드는 디버그 / 진단용으로만 남김. 매칭 pipeline 에서는 사용 안 함.

핵심 파일:
- `lib/ocr/multiStageMatch.ts` — 4 stage pipeline
- `lib/ocr/embedding.ts` — DINOv2 via @huggingface/transformers
- `lib/ocr/hog.ts` — pure TS HOG descriptor
- `lib/ocr/gridDetection.ts` — autocorrelation 기반 grid + alignment cut
- `lib/ocr/iconExtraction.ts` — 셀 → 96×96 정규화
- `tools/ocr_build_index.ts` — 인덱스 빌드 + 단색 합성

## 5. 시도 후 폐기한 방향 (regression 또는 효과 없음)

### 5.1 매칭 알고리즘 자체

| 시도 | margin ≥ 0.05 | 폐기 이유 |
|---|---|---|
| NCC 1:1 matchTemplate (시작) | 2.4% | baseline |
| Multi-scale sliding NCC (80/84/88/92) | 2.9% | margin 변화 없음 + 시간 4× |
| HOG cell 16 (V1) | 4.4% | cell 12 보다 약함 |
| **HOG cell 12 (현재 narrow 단계)** | **10.5%** | 채택 |
| HOG cell 8 (dim 4356) | 7.1% | 너무 fine → 평탄화 |
| HOG bins 12 | 8.6% | 미세 trade-off, 폐기 |
| DINOv2-small (현재) | 20.4% | 채택 |
| **DINOv2-base** (768-dim, 340MB) | 9.5% | 큰 feature space 가 distractor 평탄화 |
| **CLIP ViT-B/32** (512-dim, 150MB) | **1.2%** | catastrophic — 모든 icon 0.8+ 묶임 |

### 5.2 합성 (인덱스 측 변형)

| 시도 | margin ≥ 0.05 | 폐기 이유 |
|---|---|---|
| 단색 게임 배경 (현재) | 20.4% | 채택 |
| 평균 셀 패턴 (V2) | 5.6% | 모든 인덱스에 같은 노이즈 추가 → 평탄화 |
| Frame-only texture (외곽만) | 19.7% | DINOv2 가 외곽 패턴에 무감각 |
| HOG variants (outer-stroke) | 8.8% | 정사각 박스 패턴 강제 → BD/CD 류 over-fit |
| HOG variants (highlight) | 8.3% | HOG 에 영향 거의 없음 |
| TTA 5-rotation (셀 측 변형) | 15.0% | 시간 5× + margin 미세 ↓ |

### 5.3 Narrow / Re-ranking

| 시도 | margin ≥ 0.05 | 폐기 이유 |
|---|---|---|
| narrow 200 (현재) | 20.4% | 채택 |
| narrow 30 | 29.4% | (참고: margin 자체는 높지만 cosine ≥ 0.70 = 4.5% 로 자동 매칭 비율 더 낮음) |
| narrow 100 | 22.2% | trade-off |
| narrow 폐기 (전체 1253) | 7.9% | 정답 vs 비슷한 distractor 묻힘 |
| Re-ranking (HOG·hist·phash combined 0.7/0.15/0.15) | 6.0% | hist/phash narrow 통과 후 평탄 |

### 5.4 기타 fix

| 시도 | margin ≥ 0.05 | 폐기 이유 |
|---|---|---|
| cellHasContent alignment 0.03 강화 | 9.3% | 약간 ↓ |
| Full-squash extraction (bbox crop 제거) | 5.7% | 큰 regression |
| COUNT_RATIO 0.20 | 7.2% | regression |

## 6. 진단 — 왜 더 안 오르나

### 6.1 도메인 갭

```
인덱스 (SchaleDB)            ↔   매칭 입력 (게임 셀)
─────────────────────────         ─────────────────────────
배경: transparent                 배경: 회청색 hex 프레임
광택: 없음                        광택: 대각선 흰색 highlight
추가: 없음                        추가: 카운트 "x123"
크기: 일관                        크기: 추출 변동
```

이 갭이 본질적 병목. DINOv2 의 semantic feature 가 이 갭의 일부 (색감) 를 어느 정도 흡수하지만, 형태가 미세 차이일 때 구분 못 함 (예: 갈색 가방 → "초코 시스터 상" 매칭).

### 6.2 시각 검증으로 본 실패 패턴

- **헤더 false positive** — grid 가 헤더/사이드바/UI 영역에 잘못 잡힘. DINOv2 가 그 영역의 다이아/티켓 아이콘과 매칭. cosine 0.4-0.6 정도 mid confidence.
- **색감 dominant 매칭** — 갈색 셀 → 갈색 SchaleDB 아이콘 매칭 (형태 무관). DINOv2 가 색 정보에 sensitive.
- **인덱스 cover 부족 추정** — 게임의 일부 아이콘 (favor 선물 / 한정 이벤트 / 새 카테고리) 이 SchaleDB 인덱스에 없을 가능성. 정답 자체가 인덱스에 없으면 어떤 모델로도 매칭 불가.

## 7. 결론 (Phase A 진단 후)

### Proxy metric 함정 — 입증된 사례 ★

15-35셀 라벨링 + 진단으로 명확:

- 1주일간 NCC → DINOv2 까지 모든 시도가 **margin** 만 8.5× 끌어올림 (2.4% → 20.4%)
- 진짜 pipeline 정답률은 **8.6%** 였음 (지금까지 모름)
- **단순 narrow 폐기 (1줄 변경)** 로 **68.6%** 달성 — 8× 개선
- 즉 한 주의 model/합성/튜닝 시도가 합쳐서도 narrow 폐기 1개의 절반도 못 한 것

교훈: **proxy metric (margin/cosine) 은 정답률과 약하게만 상관**. ground truth 없이 proxy 최적화는 일정 점 이후 sunk cost. 모든 의사결정은 라벨 데이터 기반.

### 진단으로 확인된 사실

| 의심한 병목 | 진단 결과 |
|---|---|
| 인덱스 cover 부족 | ❌ 아님. top-50 = 100% (모든 정답이 인덱스 안) |
| narrow 가 정답 자름 | ✅ phash 77% / hog 일부. **즉시 fix** |
| Embedding 약함 | △ 부분. embed rank top-5 = 85.7% (강력하지만 top-1 ranking 부정확) |
| 도메인 갭 | △ 일부. semantic 모델이 fine-grained 차이 못 잡음 |
| Header false positive | ? sample 35 모두 ROI 잘 잡혀서 0. 더 다양한 캡처 확인 필요 |

### 남은 병목 — fine-grained recognition

DINOv2 가 의미적 클러스터링 (학생 A ↔ 학생 B 비슷한 헤어/색감) 으로 묶음. 우리 task 는 instance-level 구분. semantic 모델로 더는 못 올림.

### 진짜 다음 단계 = 라벨 추가 + 렌더링 역산 + (필요 시) Linear adapter

지금 35셀로:
- 인덱스 cover 문제 X 확인 됨
- narrow 폐기 = 큰 win 입증
- 다음 의사결정 = sample 더 (다양화) + 도메인 갭 fix

## 8. 구축한 도구

### 8.1 라벨링 도구 — `/dev/label`
- 게임 캡처 업로드 → ROI 드래그로 인벤토리 영역 선택 → grid 검출 + 매칭 → 셀별 라벨 입력
- 자동 매칭 top-5 후보 + 검색 box + "인덱스 없음" / "셀 아님" / "모름" 버튼
- "JSON 저장" 클릭 → Vite dev API 가 `my-site/data/labels/labels-XXX.json` 자동 저장
- JSON 안에 셀 PNG dataURL 포함 (self-contained, 원본 이미지 불필요)
- 학습 데이터로도 재사용 가능

핵심 파일:
- `src/service/label/pages/LabelPage.tsx`
- `vite.config.ts` — POST `/api/save-label` middleware

### 8.2 진단 도구 — `tools/_label_diag.ts`
- 라벨 JSON 입력 → 각 셀 매칭 실행 → 정답의 stage 별 rank 측정
- 출력:
  - top-1/top-5/top-10/top-50 정확도
  - 정답이 hist/phash/hog/embed 어느 stage 에서 잘렸나
  - none / header / unknown 통계

## 9. 앞으로의 계획

### 현재 위치 (2026-06-11, 55 라벨)
- Pipeline 정답률 **60.0%** (top-1) / **80.0%** (top-5) — 55셀 (mobile 다양 ROI)
- 인덱스 cover 100% (top-50 = 55/55)
- 남은 병목: fine-grained recognition (학생 엘레프 다수, 일부 설계도면)
- narrow 폐기는 옳음 (phash 가 여전히 82% 답을 자르고, hog 추가로 9%)
- Step B (잔차 평균) 시도 → mode collapse 로 폐기 — 자세히는 아래

### Step A — 라벨 sample 확장 (즉시, 사용자 노동 ~30분)

35 sample 은 학생 favor 편향. 통계 신뢰도 + 다양한 카테고리 정답률 확보 위해 추가 라벨링:

| 카테고리 | 목표 sample | 의미 |
|---|---|---|
| 학생 favor (이미 있음) | 유지 | fine-grained recognition 핵심 케이스 |
| 장비 설계도면 (이미 있음) | 유지 | 형태 명확 → 정답률 높을 예상 |
| 강화석/소재 | +10-20 | 색감 단순, baseline 정답률 확인 |
| 학생 보고서 / BD / CD | +10-15 | 형태 비슷한 grouping 의 fine-grained |
| 이벤트 아이템 | +5-10 | 인덱스 cover 검증 (none 비율) |
| 다양한 캡처 (PC 16:9, PC 4:3) | +20-30 | mobile 외 일반화 확인 |

목표 **75-100셀 추가** → 총 **110-135셀**. 카테고리별 정답률 + 일반화 통계.

### Step B — 렌더링 역산 (라벨 55셀로 시도 → **실패**)

#### 가설
게임 렌더링이 결정적이라는 점 활용:
```
게임 셀 ≈ SchaleDB 아이콘 + 잔차(광택/프레임/색조)
```
정답 (cell, icon) pair 의 픽셀별 잔차 평균이 도메인 갭. 인덱스 합성 시
이 잔차를 더해 cell 도메인으로 끌어당기면 fine-grained ↑.

#### 시도 (2026-06-11)
1. `tools/ocr_build_residual.ts` — 55쌍에서 96×96×3 잔차 평균 추출
   - 채널 평균 ΔR=-68.9 / ΔG=-71.0 / ΔB=-70.5 (cell 이 평균 70 어두움)
   - 픽셀별 max |Δ| = 244.6
2. `tools/ocr_build_index.ts` — 합성 96 RGB 에 잔차 더하기 → clamp → 224 resize → DINOv2

#### 결과 — **완전한 regression**
| metric | baseline (잔차 off) | 잔차 적용 |
|---|---|---|
| top-1 | **60.0%** | 25.5% |
| top-5 | 80.0% | 45.5% |
| top-50 | **100%** | 67.3% |

#### 원인
1. **Mode collapse** — top-1 오답에 "후우카(새해)의 엘레프", "레나의 엘레프" 가
   반복 등장. 1253 아이콘 전체에 동일한 잔차 패턴이 일률 적용되니 embedding
   이 그 공통 패턴에 dominated 되어 인덱스가 서로 구별 안 됨.
2. **단순 평균의 위치 의존성** — 잔차가 픽셀별이라 위치별 노이즈가 들어감.
   1개 평균 맵을 모든 아이콘에 적용한다는 가정 자체가 너무 강함.
3. **빌드 흐름 변경 side effect** — 96→224 두 번 resize 가 224 직접 resize
   대비 embedding 분포를 약간 망가뜨림 (잔차 off 로도 49.1% 측정됨). 원래
   흐름 (224 direct + alpha flatten) 으로 완전 복원함.

#### 폐기
`residual.bin.bak` 으로 보존. 코드는 rollback. 단순 픽셀 평균 잔차는 가설이
무너졌음. 더 정교한 시도 (마스크/클러스터 별 잔차) 도 가능하지만 효과 보장 X.

#### 결론
도메인 갭 줄이기는 픽셀 평균이 아니라 **학습 기반** 으로 해야 함 → Step C 직진.

### Step C — Linear adapter 학습 (55셀 시도 → **실패**, 라벨 부족 입증)

#### 가설
Step B 실패로 학습 기반만 남음. Frozen DINOv2-small (384) 위에 **Linear(384, 128)**
metric learning. Triplet loss (cell ↔ icon positive, 인덱스 random negative).
사용자 결정: 일단 55 라벨로 시도.

#### 시도 (2026-06-12)
1. `requirements-adapter.txt` — torch 2.12 + transformers 5.11 + onnx 1.21 (~2GB)
2. `build_adapter_dataset.py` — 라벨 cell + GT icon → embedding (Python facebook/dinov2-small)
3. `train_adapter.py` — Triplet, 300 epochs, hold-out 8셀
4. **단순 학습 결과** (1번 학습, 47 train + 8 hold):
   - Train top-1: 57% → 93.6% (외움)
   - Hold top-1: 50% → 50% (변동 없음)
5. `loo_eval_adapter.py` — Leave-One-Out 으로 진짜 일반화 측정
6. **LOO Python facebook**:
   | metric | baseline | adapter | Δ |
   |---|---|---|---|
   | top-1 | 56.4% | 52.7% | -3.7p |
   | top-5 | 72.7% | 83.6% | **+10.9p** |
   | top-10 | 76.4% | 92.7% | **+16.4p** |
   | top-50 | 89.1% | 100% | +10.9p |

   부분 성공처럼 보였으나 — Python facebook ↔ TS Xenova 분포 차이 의심.
7. TS 통합 실제 측정: top-1 60→54.5%, top-5 80→76.4% (모든 metric ↓)
8. 호환성 검증 — TS Xenova embedding 으로 cell + index 모두 재구성 → 같은 분포에서 LOO:
   | metric | Xenova baseline | Xenova LOO adapter | Δ |
   |---|---|---|---|
   | top-1 | 60.0% | 47.3% | **-12.7p** |
   | top-5 | 80.0% | 76.4% | **-3.6p** |
   | top-10 | 85.5% | 89.1% | +3.6p |
   | top-50 | 100% | 98.2% | -1.8p |

#### 결론 — 라벨 부족이 본질
- **호환성 문제 가설 틀림** — Xenova 기반 학습도 baseline 못 이김
- **Python LOO 의 +10.9p 는 facebook baseline 이 낮아서 (Xenova 60% vs facebook 56.4%) 상대적 개선 여지가 컸을 뿐**
- **오답 패턴**: 거의 전부 같은 학생 다른 코스튬 (마시로↔마시로수영복, 히나↔히나수영복, 이오리↔이오리수영복, 슌↔슌어린이, 준코↔준코새해…). sample 1개씩으로 코스튬 구별 학습 불가능
- 학습 인프라는 그대로 보존 — 라벨 늘면 즉시 재실행

#### 보존된 자산
- `tools/ocr/{build_adapter_dataset,train_adapter,loo_eval_adapter,build_pairs_from_xenova,export_adapter_for_ts}.py`
- `tools/ocr_extract_cell_embeds_ts.ts`
- `tools/ocr/requirements-adapter.txt`
- TS 측 `applyAdapter()`, `indexLoader` 의 adapter 로딩 — meta.adapter.enabled 시만 작동, 현재는 disabled

#### Rollback 완료
- `public/ocr/embed.bin` ← `embed.384.bak.bin` 복원
- `items.json` — `embeddingDim: 384`, `adapter` 메타 제거
- baseline 60.0% / 80.0% / 100% 완전 복구 확인

**라벨링 가이드** (다음 재시도 위해):
- **카테고리 다양화** — 학생 favor 외 BD/CD/이벤트 아이템/PC 캡처
- **mobile + PC 4:3, 16:9** 모두 — 일반화 (현 55 모두 mobile)
- **같은 학생 다른 코스튬 모두 라벨링** — 마시로 + 마시로(수영복) 둘 다, 히나 + 히나(수영복) 둘 다. fine-grained 학습에 필수
- **시리즈 별 여러 sample** — 강화석 4등급 × 다양한 ROI, 설계도면 → 완성품 pair

**실행 흐름** (라벨 200+ 후):
```bash
# 1. 같은 환경 재사용 (이미 설치됨)
cd my-site
# 2. Xenova 기반 pair 만들기 (TS cell embed 추출)
npx tsx tools/ocr_extract_cell_embeds_ts.ts data/labels/labels-*.json --out data/adapter/cell_embeds_ts.bin
# 3. pairs.npz 재구성
tools/ocr/venv/bin/python tools/ocr/build_pairs_from_xenova.py \
  --cell-embeds data/adapter/cell_embeds_ts.bin --cell-meta data/adapter/cell_embeds_ts.meta.json \
  --index-embeds public/ocr/embed.384.bak.bin --index-meta public/ocr/items.json --out data/adapter
# 4. LOO 평가
tools/ocr/venv/bin/python tools/ocr/loo_eval_adapter.py --data data/adapter
# 5. (효과 확인 시) train_adapter + export_adapter_for_ts → 인덱스 교체
```

**기준점**: LOO top-1 이 baseline (60%) 보다 의미있게 ↑ 이면 통합. 그렇지 않으면 라벨 더 또는 Step E (full fine-tune).

### Step D — Header validation (독립 fix, 필요 시)

라벨링 시 `header` 비율 보고 결정. 지금 sample 0 — 사용자가 ROI 잘 잡아서 false positive 없음. 실제 사용 (자동 ROI) 시 필요 가능.

매칭과 별개 grid 검출 단계에서 false positive 컷:
- 셀 후보 4-corner RGB 가 GAME_BG ± delta 안인가
- 외곽 frame 영역 expected 한지
- alignment 강화

### Step E — Full fine-tune (마지막 수단)

Linear adapter 가 부족하면 DINOv2 전체 fine-tune. 500+ pair 필요.

### 즉시 통합 (Step A 후)

진단 결과로 자동 매칭 임계 보정:
- **자동 매칭** (cosine 매우 높음 + margin 큼): 일부 셀
- **후보 표시 (top-5)**: 모든 셀. 사용자 confirm.
- **수동 입력**: 후보 다 오답 시

OcrImportDialog 의 PreviewTable 이 이미 후보 UI. 임계만 조정.

## 10. 통합 완료 — 자동매칭 임계 조정 (2026-06-12)

### 현 상태
- baseline 60% / 80% / 100% (top-1 / top-5 / top-50)
- Step B/C 모두 시도 후 폐기 (라벨 부족 + 단순 잔차 mode collapse)
- 학습 인프라는 모두 보존 — 라벨 200+ 시 1-shot 재실행 가능

### 자동매칭 임계 분석 (55 라벨)

| 시나리오 | 자동매칭률 | 자동매칭 정답률 | 미매칭 셀 top-5 정답 |
|---|---|---|---|
| (0.4 + 0.05) | 25% (14/55) | **100%** | 73% |
| **(0.3 + 0.03) ← 채택** | **36%** | **95%** (FP 1) | 71% |
| (0.5 + 0.10) | 13% | 100% | 77% |

**채택 (0.3 + 0.03)**: 자동매칭률 ↑ 36% 가 false positive 1셀 (사용자가 "일치도
낮음" warning 으로 확인 가능) 대가 정도. 클릭 노동 ↓.

### 통합 흐름
1. 자동 매칭 (시각 cosine ≥ 0.3 + margin ≥ 0.03) → 즉시 적용 (95% 정답)
2. 자동 매칭 안 된 셀 → top-4 후보 표시 + "변경" 검색 버튼
3. 사용자 confirm/edit → 인벤토리 반영

`OcrImportDialog.tsx:188` 임계 조정 완료.

### 다음 단계 (라벨 시점에서 다시)
- 라벨 200+ 시: Xenova embed 추출 → 학습 1-shot → 효과 측정. 인프라 모두 보존됨.
- 코스튬 fine-grained 부족 시: Step E (Full fine-tune, 500+ pair).
- 코드: `tools/ocr/{build_adapter_dataset,train_adapter,loo_eval_adapter,build_pairs_from_xenova,export_adapter_for_ts}.py`, `tools/ocr_extract_cell_embeds_ts.ts`, TS 의 `applyAdapter()` + `indexLoader` adapter 로딩 (현재 disabled).

## 11. 잠정 중단 (2026-06-15)

OCR 시스템 개발을 잠정 중단. 다른 feature 우선.

### 중단 시점 상태
- **정확도**: top-1 60% / top-5 80% / top-50 100% (55 라벨)
- **자동매칭**: 36% 셀 자동 적용 (정답률 95%)
- **사용자 흐름**: 자동매칭 + 후보 4개 표시 + 검색 → 클릭 1-2번으로 confirm
- **실용성 평가**: 55셀 인벤토리 = 사용자 30~50 클릭. 사용 가능 수준.

### 재개 시 시작점
1. **라벨 확장** — 같은 학생 코스튬 양쪽 모두 라벨링 (마시로 + 마시로수영복 둘 다). 인덱스 1253개 cover 목표.
2. **학습 1-shot** (라벨 200+):
   ```bash
   cd my-site
   npx tsx tools/ocr_extract_cell_embeds_ts.ts data/labels/labels-*.json --out data/adapter/cell_embeds_ts.bin
   tools/ocr/venv/bin/python tools/ocr/build_pairs_from_xenova.py --cell-embeds data/adapter/cell_embeds_ts.bin --cell-meta data/adapter/cell_embeds_ts.meta.json --index-embeds public/ocr/embed.384.bak.bin --index-meta public/ocr/items.json --out data/adapter
   tools/ocr/venv/bin/python tools/ocr/loo_eval_adapter.py --data data/adapter
   # 효과 확인 시:
   tools/ocr/venv/bin/python tools/ocr/train_adapter.py --data data/adapter --out data/adapter --epochs 300
   tools/ocr/venv/bin/python tools/ocr/export_adapter_for_ts.py --data data/adapter --index public/ocr
   ```
3. **효과 부족 시** — Step E (Full fine-tune, 500+ pair) 또는 합성 데이터 augmentation 검토.

### 보존된 자산
- 학습 스크립트 5개 (Python): `tools/ocr/{build_adapter_dataset, build_pairs_from_xenova, train_adapter, loo_eval_adapter, export_adapter_for_ts}.py`
- TS 스크립트: `tools/ocr_extract_cell_embeds_ts.ts`, `tools/_label_diag.ts`, `tools/_label_confidence_diag.ts`
- venv: `my-site/tools/ocr/venv/` — torch + transformers + onnx 설치됨
- TS 통합 코드: `applyAdapter()` (embedding.ts), `indexLoader` adapter 로딩 — `items.json` 의 `adapter.enabled` 만 true 면 자동 활성
- 백업 인덱스: `public/ocr/embed.384.bak.bin` (raw 384-dim Xenova)
- 라벨: `data/labels/labels-*.json` (55셀)

## 10. 부수 작업

- OpenCV.js 의존성 제거 (HOG cosine 만 쓰면 OpenCV 불필요) — 번들 더 가벼움
- 매칭 시간: 32ms (NCC) → 100ms (embedding). 30셀 이미지 = 3초.
- 인덱스 크기: 22.5 MB (icons 11 + hist 1.2 + phash 0.01 + hog 8.4 + embed 1.8)
