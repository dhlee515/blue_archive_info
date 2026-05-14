# 프라나 AI (Blue Archive Info)

블루 아카이브 한국어 정보 사이트 + 데스크탑 앱.

- **육성 플래너** — 학생별 목표 설정, 부족 재화 자동 계산
- **재화 인벤토리** — 보유 재화 입력, 부족분 시각화
- **계산기** — 엘리그마 / 제작 / 이벤트 효율
- **학생 정보 / 가이드** — SchaleDB 기반
- **로컬 / 클라우드 모드** — 로그인 시 클라우드 동기화, 비로그인 시 이 기기에만 저장

## 다운로드

[**최신 버전 다운로드 (GitHub Releases)**](https://github.com/dhlee515/blue_archive_info/releases/latest)

### OS별 파일 선택

| OS | 파일 | 비고 |
|---|---|---|
| **macOS (Apple Silicon, M1+)** | `bluearchive-info-desktop_X.Y.Z_aarch64.dmg` | 권장 |
| **macOS (Intel)** | `bluearchive-info-desktop_X.Y.Z_x64.dmg` | |
| **Windows** | `bluearchive-info-desktop_X.Y.Z_x64-setup.exe` | 설치 마법사 |
| **Linux (Ubuntu/Debian)** | `bluearchive-info-desktop_X.Y.Z_amd64.deb` | `sudo apt install ./파일.deb` |
| **Linux (다른 배포판)** | `bluearchive-info-desktop_X.Y.Z_amd64.AppImage` | `chmod +x` 후 실행 |

## 설치 가이드 (첫 실행 보안 경고 통과)

코드사인 없이 배포되어 OS 별 보안 경고가 뜹니다 (정상). **한 번 통과하면** 이후엔 평소처럼 실행됩니다.

### 🍎 macOS

1. `.dmg` 더블클릭 → 마운트
2. 앱 아이콘을 **Applications 폴더로 드래그**
3. Applications 폴더에서 앱을 처음 실행하면 차단됨:

   > "확인되지 않은 개발자가 만들었기 때문에 열 수 없습니다"

4. **시스템 설정** → **개인 정보 보호 및 보안** 으로 이동
5. 아래쪽 "Blue Archive Info 가 차단되었습니다" 옆 **"확인 없이 열기"** 클릭
6. 다시 앱 실행 → **"열기"** 클릭 → 정상 작동

이후 실행 시에는 경고 없음.

### 🪟 Windows

1. `.exe` 다운로드 → 더블클릭
2. SmartScreen 경고:

   > "Windows에서 PC를 보호했습니다"

3. **"추가 정보"** 클릭 → **"실행"** 버튼 클릭
4. 설치 마법사 진행
5. 시작 메뉴 또는 바탕화면 아이콘에서 실행

이후 실행 시에는 경고 없음.

### 🐧 Linux

#### Ubuntu / Debian (.deb)

```bash
sudo apt install ./bluearchive-info-desktop_X.Y.Z_amd64.deb
# 또는
sudo dpkg -i ./bluearchive-info-desktop_X.Y.Z_amd64.deb
```

#### 기타 배포판 (.AppImage)

```bash
chmod +x bluearchive-info-desktop_X.Y.Z_amd64.AppImage
./bluearchive-info-desktop_X.Y.Z_amd64.AppImage
```

## 자동 업데이트

앱 시작 시 새 버전을 자동으로 확인합니다.

- 새 버전 있으면 헤더 우측에 **초록색 "v0.X.Y" 배지** 표시
- 클릭 → 확인 다이얼로그 → "업데이트 + 재시작" → 자동 다운로드 + 설치 + 재시작
- 다운로드는 단일 키페어로 서명된 패키지만 허용 (보안)

## 데이터 위치

### 로컬 모드 (비로그인)
- **macOS**: `~/Library/Application Support/io.github.dhlee515.bluearchive-info/`
- **Windows**: `%APPDATA%\io.github.dhlee515.bluearchive-info\`
- **Linux**: `~/.local/share/io.github.dhlee515.bluearchive-info/`

단일 JSON 파일 (`app.json`) — 백업 / 다른 기기 복사 가능.

### 클라우드 모드 (로그인 후)
Supabase (외부 서버) 에 저장. 인터넷 필수. 여러 기기 자동 동기화.

### 모드 전환
헤더의 **모드 배지 (Cloud/HardDrive 아이콘) 클릭** → 동기화 다이얼로그에서 로컬 ↔ 클라우드 명시적 push/pull.

## 고급: OCR 인벤토리 자동 입력 (선택)

게임 인벤토리 캡처 이미지에서 항목/수량 자동 추출. **Python 3.10+ + 추가 의존성 필요**.

### 셋업 (1회)

```bash
# 1. Python 3.10+ 설치 (https://www.python.org/)

# 2. 앱 설치 경로에서 tools/ocr/ 디렉토리 찾기
#    macOS: /Applications/bluearchive-info-desktop.app/Contents/Resources/tools/ocr/
#    Windows: <설치 경로>\resources\tools\ocr\
#    Linux: /usr/lib/bluearchive-info-desktop/resources/tools/ocr/

# 3. venv 생성 + 의존성 설치
cd <위 경로>
python3 -m venv venv
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install paddleocr paddlepaddle opencv-python numpy pillow imagehash
```

설치 디스크 사용: ~1.5GB. 첫 OCR 실행 시 한국어 모델 자동 다운로드 (~100MB).

### 사용
인벤토리 페이지 → **"이미지에서 가져오기"** 버튼 → 캡처 파일 선택 → 자동 인식 → 미리보기에서 검토 → 적용

자세한 내용: [tools/ocr/README.md](my-site/tools/ocr/README.md)

## 트러블슈팅

| 증상 | 대응 |
|---|---|
| macOS: "손상되었거나 완전하지 않습니다" | 터미널에서 `xattr -cr /Applications/bluearchive-info-desktop.app` 후 다시 실행 |
| Windows: SmartScreen 통과 못 함 | 우클릭 → 속성 → 일반 탭 하단 "차단 해제" 체크 후 적용 |
| Linux .deb 의존성 오류 | `sudo apt --fix-broken install` |
| OCR Python spawn 실패 | `python3 --version` 으로 설치 확인. PATH 등록 필수 |
| 자동 업데이트 무한 다운로드 | 인터넷 연결 확인. 방화벽이 github.com 차단하는지 점검 |

## 개발자 정보

### 소스 코드
React 19 + TypeScript + Vite + Tauri 2.x + Tailwind CSS 4.

### 로컬 빌드

```bash
# 의존성
node --version    # 20+
rustc --version   # 1.77+ (rustup 권장, https://rustup.rs)

# 클론 후
cd my-site
npm install

# 개발 모드
npm run tauri:dev

# 프로덕션 빌드
npm run tauri:build
```

빌드 산출물: `my-site/src-tauri/target/release/bundle/`

### 라이선스 / 면책
- 비공식 팬 사이트. 넥슨 / 요스타와 무관
- 학생 데이터 출처: [SchaleDB](https://schaledb.com/)
- 게임 자산 (학생 일러스트, 아이콘) 의 저작권은 원 소유자에게 있음

## 문의 / 기여

- Issue: [GitHub Issues](https://github.com/dhlee515/blue_archive_info/issues)
- 코드 기여 환영
