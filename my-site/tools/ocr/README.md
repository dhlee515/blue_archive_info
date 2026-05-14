# OCR 인벤토리 자동 입력 (Phase 3)

블루 아카이브 인게임 인벤토리 캡처 이미지에서 항목 이름과 수량을 자동 추출하는 도구.

## 셋업 (1회)

### 1. Python 3.10+ 설치 확인

```bash
python3 --version
```

### 2. venv 생성 + 의존성 설치

`my-site/tools/ocr/` 디렉토리에서:

```bash
python3 -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

설치 시간: 약 5-10분 (paddlepaddle 가 큼). 디스크 사용: 약 1-1.5GB.

### 3. 첫 실행 시 OCR 모델 자동 다운로드

PaddleOCR 은 첫 호출 시 한국어 모델을 자동 다운로드합니다 (~100MB).
인터넷 연결 필요. 이후엔 캐시 사용.

### 4. 시각 매칭 인덱스 생성 (1회, 권장)

OCR 텍스트만으로 매칭이 어려운 스타일화된 아이콘에 대비해 SchaleDB 의 모든 아이콘에서
perceptual hash (pHash) 인덱스를 생성합니다.

```bash
source venv/bin/activate
python build_icon_index.py
```

- 약 1245개 아이콘 다운로드 (~2-3분)
- 결과: `icon_hashes.json` (~135KB)
- SchaleDB 데이터 변경 시 가끔 재실행 권장

이 인덱스가 없어도 OCR 자체는 동작합니다 (시각 매칭만 비활성화).

## 단독 테스트

```bash
source venv/bin/activate
python extract_inventory.py /path/to/screenshot.png
```

stdout 에 JSON 출력:

```json
{
  "items": [
    {"name": "최상급 활동 보고서", "count": 1234, "confidence": 0.97, "bbox": [10, 20, 100, 120]}
  ],
  "warnings": []
}
```

## Tauri 통합

데스크탑 앱이 자동으로:
1. `tools/ocr/venv/bin/python` (또는 Windows: `venv\Scripts\python.exe`) 을 우선 사용
2. venv 가 없으면 시스템 `python3` fallback
3. dev 모드: `my-site/tools/ocr/extract_inventory.py` 직접 호출
4. prod 모드: 번들된 resource 에서 호출

## 인식률에 대한 솔직한 한계

OCR + 시각 매칭은 **인벤토리 종류에 따라 효과가 크게 다릅니다**:

| 인벤토리 유형 | 자동 매칭 품질 | 비고 |
|---|---|---|
| 활동 보고서 / 강화석 / 모자/머리핀 | ✅ 높음 | 한글 라벨 명확 |
| 학생 엘레프 (학생별) | ✅ 높음 | 학생 얼굴 시각 매칭 |
| 오파츠 / 애착 선물 | ✅ 중상 | 한글 텍스트 + 시각 |
| 무기 부품 | ⚠ 중 | 텍스트 작음, 시각으로 보완 |
| **전술 교육 BD (EX 스킬)** | ⚠ 낮음 | 영문 학교명 + 등급별 색상만으로 구분, OCR/pHash 모두 어려움 — **수동 매핑 필요** |

수량 추출은 모든 유형에서 정확합니다. 매칭이 어려운 항목은 미리보기 UI 의 "변경" 버튼 또는
하단 "유사:" 칩 클릭으로 수동 수정 가능합니다.

## OCR 보정 매핑

`remap.json` — OCR 이 자주 틀리는 패턴을 SchaleDB 정식 명칭으로 매핑합니다.
사용 중 발견되는 패턴을 점진적으로 추가하세요.

```json
{
  "최상금 활동 보고서": "최상급 활동 보고서",
  "회루": "회로"
}
```

## 트러블슈팅

| 증상 | 해결 |
|---|---|
| `Python spawn 실패` | `python3 --version` 확인. 없으면 https://www.python.org/ 에서 설치 |
| `PaddleOCR import 실패` | `tools/ocr/venv/bin/python -m pip install -r requirements.txt` |
| `paddlepaddle 설치 실패 (Apple Silicon)` | `pip install paddlepaddle==2.5.0` 명시 (M1/M2 호환 버전) |
| 모든 인식률이 낮음 | 캡처 해상도 확인 (720px 이상 권장). 화면 밝기/대비도 영향 |
| 셀 검출 실패 | `MIN_CELL_AREA` (현 4000) 를 캡처 해상도에 맞게 조정 |
