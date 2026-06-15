// OCR 인덱스 / 매칭 결과 공통 타입.

export type OcrCategory = 'item' | 'equipment';

/** 인덱스 빌드 결과 — items.json 의 entries 항목 */
export interface CatalogEntry {
  /** Python 호환 키 (`item:NNN` / `equipment:NNN`). 인벤토리 카탈로그 매핑은 별도 단계. */
  key: string;
  name: string;
  category: OcrCategory;
  /** SchaleDB 이미지 URL 의 파일명 (확장자 제외) */
  iconField: string;
  /** hist.bin / phash.bin / icons.bin 의 슬롯 인덱스 */
  idx: number;
}

/** items.json 의 최상위 구조 */
export interface OcrIndexMeta {
  schaledbRevision: string;
  builtAt: string;
  region: string;
  normSize: number;
  histBins: number;
  /** HOG 인덱스의 entry 당 변형 개수 (≥ 1). hog.bin = N entries × hogVariants × HOG_DIM. */
  hogVariants: number;
  /** 최종 embedding 차원. adapter 적용 시 outputDim (128), 미사용 시 384.
   * embed.bin = N entries × embeddingDim. */
  embeddingDim: number;
  /** Linear adapter 메타 (옵션) — embed.bin 이 adapter 적용 결과면 enabled=true. */
  adapter?: {
    enabled: boolean;
    /** Backbone embedding 차원 — 보통 384 (DINOv2-small CLS). */
    inputDim: number;
    /** Adapter 출력 차원 = embeddingDim. */
    outputDim: number;
    /** adapter.bin 의 public/ocr/ 내 경로. */
    weightPath: string;
  };
  entries: CatalogEntry[];
}

/** 정규화된 96×96 아이콘 단일 슬롯 */
export interface NormalizedIcon {
  /** 그레이스케일 96×96 = 9216 bytes (matchTemplate 용) */
  gray: Uint8Array;
  /** 색 히스토그램 (256 floats) */
  hist: Float32Array;
  /** 64-bit pHash */
  phash: bigint;
}
