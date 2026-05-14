#!/usr/bin/env python3
"""
Blue Archive 인벤토리 캡처에서 항목/수량을 추출.

사용법:
    python extract_inventory.py <image_path1> <image_path2> ...

출력 (stdout, JSON):
    {
      "items": [
        { "name": str, "count": int, "confidence": float, "bbox": [x, y, w, h] },
        ...
      ],
      "warnings": [str, ...]
    }

처리 흐름:
    1. 각 이미지를 OpenCV 로 로드 → 회색조 + 노이즈 제거
    2. 적응적 그리드 검출 (cv2.findContours) — 해상도/비율 가정 안 함
    3. 각 셀 영역에서 PaddleOCR 로 텍스트 추출
    4. 텍스트를 (이름, 수량) 으로 파싱
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

# PaddleOCR / paddlex 의 verbose 로그를 stderr 로 보낸다 (stdout 은 JSON 전용 채널).
# import 시점부터 영향을 주려면 logging 환경변수를 먼저 세팅.
os.environ.setdefault("GLOG_minloglevel", "3")  # 0=INFO, 3=FATAL
os.environ.setdefault("FLAGS_logtostderr", "true")
logging.basicConfig(stream=sys.stderr, level=logging.WARNING)

import cv2
import numpy as np

# PaddleOCR 은 첫 사용 시 모델을 다운로드 (~100MB) — 시간이 걸릴 수 있음
try:
    from paddleocr import PaddleOCR
except ImportError as e:
    print(
        json.dumps(
            {
                "items": [],
                "warnings": [
                    f"PaddleOCR import 실패: {e}. tools/ocr/requirements.txt 를 설치하세요."
                ],
            }
        )
    )
    sys.exit(0)

# 시각 매칭 (선택적 — 인덱스가 없거나 라이브러리 없으면 OCR 만)
try:
    import imagehash
    from PIL import Image
    _HAS_IMAGEHASH = True
except ImportError:
    _HAS_IMAGEHASH = False


@contextmanager
def stdout_to_stderr():
    """파이썬 print() 와 OS 레벨 stdout 을 모두 stderr 로 리다이렉트.

    PaddleOCR 3.x / paddlex 가 모델 로딩 시 stdout 으로 메시지를 출력하므로,
    JSON 채널을 깨끗이 유지하기 위해 작업 구간을 감싼다.
    """
    sys.stdout.flush()
    saved_py = sys.stdout
    saved_fd = os.dup(1)
    try:
        os.dup2(2, 1)  # OS-level stdout → stderr
        sys.stdout = sys.stderr
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_fd, 1)
        os.close(saved_fd)
        sys.stdout = saved_py


# --- 설정 ---

MIN_IMAGE_WIDTH = 720  # 이 이하면 인식률 경고
MIN_CELL_AREA = 4000   # 너무 작은 contour 제외 (px²)
MAX_CELL_AREA_RATIO = 0.4  # 전체 이미지의 40% 이상이면 셀 아님

# 수량 패턴은 parse_text_to_item 내부에서 정의 (우선순위 보장)


@dataclass
class VisualCandidate:
    """시각 매칭 후보 (pHash 기반)."""
    key: str
    name: str
    distance: int  # Hamming distance (0 = identical, 64 = max)
    score: float   # 0~1 (1 - distance/64)


@dataclass
class OcrItem:
    name: str
    count: int
    confidence: float
    bbox: list[int]  # [x, y, w, h]
    phash: str | None = None
    candidates: list[VisualCandidate] | None = None


# --- 시각 매칭 인덱스 ---

ICON_INDEX_PATH = Path(__file__).parent / "icon_hashes.json"
TOP_K_VISUAL = 5  # 셀당 상위 K 개 후보 반환


def load_icon_index() -> list[dict[str, Any]] | None:
    """icon_hashes.json 로드. 없으면 None 반환 (시각 매칭 비활성)."""
    if not ICON_INDEX_PATH.exists():
        return None
    try:
        data = json.loads(ICON_INDEX_PATH.read_text(encoding="utf-8"))
        return data.get("items") or None
    except Exception:
        return None


def crop_icon_region(cell: np.ndarray) -> np.ndarray:
    """
    셀에서 아이콘 핵심 영역만 크롭. UI chrome (테두리) + 카운트 텍스트 제거.
    실측: 게임 인벤토리 카드는 중앙 60% × 60% 부근에 아이콘 위치.
    """
    h, w = cell.shape[:2]
    return cell[int(h * 0.15) : int(h * 0.65), int(w * 0.15) : int(w * 0.85)]


def preprocess_for_ocr(cell: np.ndarray) -> np.ndarray:
    """
    텍스트 인식률을 높이기 위한 전처리. VArchiveMacro 의 접근을 차용:
      1. luminance (흑백)
      2. Otsu 적응적 이진화 — 게임 UI 의 다양한 배경 색상 (그라디언트, 단색) 대응
      3. 밝은 배경 검은 텍스트로 정규화 (PaddleOCR 안정적 동작)
      4. 1픽셀 erode — 흑색 텍스트 stroke 두껍게 (작은 폰트일수록 효과 큼)
      5. 3채널 BGR 로 복원 (PaddleOCR 입력 포맷 호환)

    원본 셀은 pHash 계산에 그대로 쓰고, 이 함수의 결과는 OCR 에만 전달된다.
    """
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)

    # Otsu 자동 임계값
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # 흰 픽셀이 50% 미만이면 텍스트가 어두운 색이므로 반전 (배경 = 흰색이 되도록)
    if (binary == 255).mean() < 0.5:
        binary = cv2.bitwise_not(binary)

    # 텍스트 굵게 — erode 는 흰 영역을 줄이므로 검은 텍스트가 두꺼워짐
    binary = cv2.erode(binary, np.ones((2, 2), np.uint8), iterations=1)

    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def compute_cell_phash(cell: np.ndarray) -> str | None:
    """OpenCV BGR ndarray → PIL → pHash."""
    if not _HAS_IMAGEHASH:
        return None
    try:
        icon_region = crop_icon_region(cell)
        rgb = cv2.cvtColor(icon_region, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        return str(imagehash.phash(img, hash_size=8))
    except Exception:
        return None


def hamming_distance(hex_a: str, hex_b: str) -> int:
    """16진수 문자열로 인코딩된 pHash 두 개의 Hamming 거리."""
    if len(hex_a) != len(hex_b):
        return 64  # 같은 hash size 가정
    a = int(hex_a, 16)
    b = int(hex_b, 16)
    return bin(a ^ b).count("1")


def find_visual_candidates(
    cell_phash: str, index: list[dict[str, Any]], k: int = TOP_K_VISUAL
) -> list[VisualCandidate]:
    """인덱스 전체에 대해 Hamming 거리 계산 → top-K."""
    scored: list[tuple[int, dict[str, Any]]] = []
    for it in index:
        ph = it.get("phash")
        if not ph:
            continue
        d = hamming_distance(cell_phash, ph)
        scored.append((d, it))
    scored.sort(key=lambda t: t[0])
    out: list[VisualCandidate] = []
    for d, it in scored[:k]:
        out.append(
            VisualCandidate(
                key=it["key"],
                name=it["name"],
                distance=d,
                score=max(0.0, 1.0 - d / 64.0),
            )
        )
    return out


# --- 처리 함수 ---


def detect_cells(gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    """
    적응적 그리드 검출. 입력 해상도/비율 가정 안 함.
    반환: [(x, y, w, h), ...] 셀 bbox 리스트
    """
    h, w = gray.shape
    image_area = h * w

    # 가벼운 가우시안 블러 → 적응적 이진화
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
    )

    # 모폴로지로 닫기 (셀 경계선 강화)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

    # 외곽 contour 만 (셀 안의 내부 contour 제외)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    cells: list[tuple[int, int, int, int]] = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area = cw * ch
        if area < MIN_CELL_AREA:
            continue
        if area > image_area * MAX_CELL_AREA_RATIO:
            continue
        # 종횡비: 인벤토리 셀은 보통 정사각형 또는 약간 세로 (1:1.3 정도)
        if not (0.5 <= cw / ch <= 2.0):
            continue
        cells.append((x, y, cw, ch))

    # 셀 크기의 중앙값 기준으로 ±50% 만 통과 (외곽 노이즈 제거)
    if cells:
        areas = sorted(cw * ch for (_, _, cw, ch) in cells)
        median = areas[len(areas) // 2]
        cells = [(x, y, cw, ch) for (x, y, cw, ch) in cells if 0.5 * median <= cw * ch <= 2.0 * median]

    # 위→아래, 좌→우 순서로 정렬 (행 기준 그룹핑)
    cells.sort(key=lambda b: (b[1] // 50, b[0]))  # 50px 행 단위 묶기
    return cells


def parse_text_to_item(texts: list[tuple[str, float]]) -> tuple[str | None, int | None, float]:
    """
    OCR 결과 텍스트 리스트에서 (이름, 수량, 평균 confidence) 추출.
    `texts`: [(text, confidence), ...] — 한 셀 내의 텍스트들

    수량 검출 우선순위 (단순 first-match 가 아님):
      1. `xX×` prefix 가 있는 매치 — 인벤토리 표기 (가장 신뢰)
      2. `보유:` 라벨 매치
      3. 단독 숫자 fragment 중 가장 큰 값 — 작은 isolated 숫자가 카운트를 가리는 것 방지

    text fragment 로 분절된 OCR 출력에서 "EX D x278" 가 ["EX","D","x278"] 로 들어와도
    "x278" 의 278 을 정확히 추출 (이전 first-match 버그 수정).
    """
    if not texts:
        return None, None, 0.0

    confidences = [conf for _, conf in texts]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    # 1. xX× prefix 매치 후보 수집
    x_matches: list[int] = []
    label_matches: list[int] = []
    bare_matches: list[int] = []
    name_parts: list[str] = []

    pat_x = re.compile(r"[xX×]\s*([\d,]+)")
    pat_label = re.compile(r"보유\s*[:：]?\s*([\d,]+)")
    pat_bare = re.compile(r"^([\d,]+)$")

    for text, _conf in texts:
        consumed = False
        m = pat_x.search(text)
        if m:
            try:
                x_matches.append(int(m.group(1).replace(",", "")))
                consumed = True
            except ValueError:
                pass
        if not consumed:
            m = pat_label.search(text)
            if m:
                try:
                    label_matches.append(int(m.group(1).replace(",", "")))
                    consumed = True
                except ValueError:
                    pass
        if not consumed:
            m = pat_bare.match(text.strip())
            if m:
                try:
                    bare_matches.append(int(m.group(1).replace(",", "")))
                    consumed = True
                except ValueError:
                    pass
        if not consumed:
            name_parts.append(text)

    # 우선순위: x prefix > label > bare 중 max
    count: int | None = None
    if x_matches:
        count = max(x_matches)
    elif label_matches:
        count = max(label_matches)
    elif bare_matches:
        count = max(bare_matches)

    name = " ".join(name_parts).strip()
    return name or None, count, avg_conf


def _get_field(obj: Any, name: str) -> Any:
    """OCRResult / dict 양쪽 호환 필드 접근."""
    if obj is None:
        return None
    if hasattr(obj, "get") and callable(obj.get):
        try:
            return obj.get(name)
        except Exception:
            pass
    try:
        return obj[name]
    except (KeyError, TypeError, IndexError, AttributeError):
        return None


def _extract_texts_from_result(result: Any) -> list[tuple[str, float]]:
    """
    PaddleOCR 결과에서 (text, confidence) 리스트 추출.

    PaddleOCR 3.x: result = [OCRResult{"rec_texts": [...], "rec_scores": [...], ...}, ...]
    PaddleOCR 2.x: result = [[[bbox_4pts, (text, conf)], ...], ...]
    """
    if not result:
        return []

    # generator → list 변환
    try:
        result_list = list(result)
    except TypeError:
        return []
    if not result_list:
        return []

    first = result_list[0]
    if first is None:
        return []

    # 3.x: OCRResult / dict 형태
    rec_texts = _get_field(first, "rec_texts")
    rec_scores = _get_field(first, "rec_scores")
    if rec_texts is not None and rec_scores is not None:
        try:
            return [
                (str(t), float(s)) for t, s in zip(list(rec_texts), list(rec_scores))
            ]
        except Exception:
            pass

    # 2.x: 리스트 of [bbox, (text, conf)]
    if isinstance(first, list):
        out: list[tuple[str, float]] = []
        for line in first:
            if not line:
                continue
            try:
                out.append((str(line[1][0]), float(line[1][1])))
            except (IndexError, TypeError, ValueError):
                continue
        return out

    return []


def _ocr_predict(ocr_engine: PaddleOCR, image: np.ndarray) -> Any:
    """3.x .predict() / 2.x .ocr() 자동 호출."""
    if hasattr(ocr_engine, "predict"):
        return ocr_engine.predict(input=image)
    return ocr_engine.ocr(image, cls=False)


def process_image(
    image_path: str,
    ocr_engine: PaddleOCR,
    icon_index: list[dict[str, Any]] | None = None,
) -> tuple[list[OcrItem], list[str]]:
    img = cv2.imread(image_path)
    if img is None:
        return [], [f"이미지 로드 실패: {image_path}"]

    warnings: list[str] = []
    h, w = img.shape[:2]
    if w < MIN_IMAGE_WIDTH:
        warnings.append(
            f"해상도가 낮습니다 ({w}×{h}). 720px 이상 권장 — 인식률이 떨어질 수 있습니다."
        )

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cells = detect_cells(gray)
    if not cells:
        warnings.append(f"셀을 검출하지 못했습니다 ({Path(image_path).name})")
        return [], warnings

    items: list[OcrItem] = []
    for (x, y, cw, ch) in cells:
        crop = img[y : y + ch, x : x + cw]

        # OCR — 원본 우선, 실패 시에만 전처리 fallback (전처리가 잘 인식되는 텍스트를
        # 오히려 깨뜨리는 경우가 있어 보수적으로 적용)
        result_raw = _ocr_predict(ocr_engine, crop)
        texts_raw = _extract_texts_from_result(result_raw)
        name_raw, count_raw, conf_raw = (
            parse_text_to_item(texts_raw) if texts_raw else (None, None, 0.0)
        )

        # raw 가 (이름 + 수량) 모두 얻으면 그대로 사용
        raw_complete = bool(name_raw) and count_raw is not None and count_raw > 0
        if raw_complete:
            name, count, avg_conf = name_raw, count_raw, conf_raw
        else:
            # raw 부족 — 전처리로 한 번 더 시도
            result_pp = _ocr_predict(ocr_engine, preprocess_for_ocr(crop))
            texts_pp = _extract_texts_from_result(result_pp)
            name_pp, count_pp, conf_pp = (
                parse_text_to_item(texts_pp) if texts_pp else (None, None, 0.0)
            )

            # 두 결과 중 더 완전한 쪽 (이름 + 수량 둘 다 검출) 우선
            pp_complete = bool(name_pp) and count_pp is not None and count_pp > 0

            if pp_complete and not raw_complete:
                name, count, avg_conf = name_pp, count_pp, conf_pp
            elif raw_complete:
                name, count, avg_conf = name_raw, count_raw, conf_raw
            else:
                # 둘 다 부족 — 더 많은 정보가 있는 쪽 (이름 길이 + count 존재 점수화)
                score_raw = (len(name_raw or "") * 0.3) + (10 if count_raw else 0) + conf_raw
                score_pp = (len(name_pp or "") * 0.3) + (10 if count_pp else 0) + conf_pp
                if score_pp > score_raw:
                    name, count, avg_conf = name_pp, count_pp, conf_pp
                else:
                    name, count, avg_conf = name_raw, count_raw, conf_raw

        # 시각 매칭 (인덱스 있으면 — 원본 crop 사용, 전처리 X)
        cell_phash = compute_cell_phash(crop)
        candidates: list[VisualCandidate] | None = None
        if cell_phash and icon_index:
            candidates = find_visual_candidates(cell_phash, icon_index, TOP_K_VISUAL)

        # OCR 이름 없어도 시각 후보가 있으면 셀 통과 (count 라도 사용 가능)
        if name is None and not candidates:
            continue

        items.append(
            OcrItem(
                name=name or "",
                count=count if count is not None else 0,
                confidence=avg_conf,
                bbox=[x, y, cw, ch],
                phash=cell_phash,
                candidates=candidates,
            )
        )

    return items, warnings


def _build_ocr_engine() -> PaddleOCR:
    """PaddleOCR 2.x / 3.x 인자 호환 처리."""
    # 3.x: use_textline_orientation, no show_log
    try:
        return PaddleOCR(use_textline_orientation=False, lang="korean")
    except TypeError:
        pass
    # 2.x fallback
    try:
        return PaddleOCR(use_angle_cls=False, lang="korean", show_log=False)
    except TypeError:
        pass
    # 최후 fallback — lang 만
    return PaddleOCR(lang="korean")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(json.dumps({"items": [], "warnings": ["입력 이미지 경로가 없습니다"]}))
        return

    all_items: list[OcrItem] = []
    all_warnings: list[str] = []

    icon_index = load_icon_index()
    if icon_index is None:
        all_warnings.append(
            "icon_hashes.json 이 없어 시각 매칭이 비활성화됩니다. "
            "tools/ocr/build_icon_index.py 를 실행해 인덱스를 생성하세요."
        )

    # 모델 로딩 + 추론 구간은 stdout 오염 차단 (paddlex 로그 → stderr)
    with stdout_to_stderr():
        ocr_engine = _build_ocr_engine()
        for path in args:
            items, warnings = process_image(path, ocr_engine, icon_index)
            all_items.extend(items)
            all_warnings.extend(warnings)

    # 출력 직렬화 — 깨끗한 stdout 으로
    payload: dict[str, Any] = {
        "items": [asdict(it) for it in all_items],
        "warnings": all_warnings,
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
