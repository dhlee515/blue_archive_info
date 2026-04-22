# 사이드바 "정보" 그룹 메뉴 도입 계획

> 현재 평평하게 나열된 공개 메뉴 중 **정보글 / 학생 목록 / 리세계 추천 / 엘리그마 계산기 / 제조 계산기 / 이벤트 계산기** 를 하나의 접기/펼치기 그룹("**정보**") 아래로 묶는다.
> 대시보드는 그룹 밖 최상단에 유지.

---

## 1. 현재 구조 ([Sidebar.tsx:14-22](my-site/src/components/navigation/Sidebar.tsx#L14-L22))

```ts
const navLinks = [
  { name: '대시보드', path: '/' },
  { name: '정보글', path: '/guide' },
  { name: '학생 목록', path: '/students' },
  { name: '리세계 추천', path: '/reroll' },
  { name: '엘리그마 계산기', path: '/calculator/eligma' },
  { name: '제조 계산기', path: '/calculator/crafting' },
  { name: '이벤트 계산기', path: '/calculator/event' },
];
```

모두 flat `map` 으로 렌더. 각 링크는 `location.pathname === link.path || startsWith(link.path + '/')` 로 active 판정.

---

## 2. 목표 구조

```
• 대시보드
• 정보 ▼
   ○ 정보글
   ○ 학생 목록
   ○ 리세계 추천
• 계산기 ▼
   ○ 엘리그마 계산기
   ○ 제조 계산기
   ○ 이벤트 계산기
```

- "정보" 는 **그룹 헤더** — 자체 이동 없음, 클릭 시 접기/펼치기만
- 하위 항목은 들여쓰기 + 약간 작은 폰트로 시각적 구분
- 상단 admin/editor 메뉴 블록 (유저 관리, 비밀 노트, 내부 공지) 은 **변경 없음**

---

## 3. 설계 결정

1. **"정보" 자체는 클릭 시 토글만** (라우트 없음)
   - 대체로 그룹 헤더에 페이지 연결은 모호한 UX. `<button>` 으로 처리
2. **초기 펼침 상태 = 펼쳐짐**
   - 첫 방문자에게 하위 메뉴 발견성 우선
3. **현재 경로가 그룹 내에 있으면 자동 펼침 강제**
   - 예: `/guide` 접속 상태라면 "정보" 그룹이 반드시 펼쳐져 있어야 함 (숨겨진 상태에서 현재 위치 안 보이면 혼란)
4. **펼침 상태 로컬 저장 → YAGNI 로 유보**
   - 새로고침마다 펼쳐진 기본 상태로 리셋
   - 필요 시 `localStorage` 키 `sidebar.info.open` 으로 확장 가능
5. **admin 메뉴 그룹화 → 범위 밖**
   - "유저 관리 / 비밀 노트 / 내부 공지" 를 "관리" 그룹으로 묶는 것도 자연스럽지만 현 요청 범위는 "정보" 만
6. **Chevron 아이콘 lucide-react** — 이미 의존성 존재 ([RuleIcon](my-site/src/service/secretNote/plugins/RuleIcon.tsx) 등)

---

## 4. 데이터 구조

```ts
type NavLink = { name: string; path: string };
type NavGroup = { name: string; children: NavLink[] };
type NavItem = NavLink | NavGroup;

const navLinks: NavItem[] = [
  { name: '대시보드', path: '/' },
  {
    name: '정보',
    children: [
      { name: '정보글',        path: '/guide' },
      { name: '학생 목록',      path: '/students' },
      { name: '리세계 추천',    path: '/reroll' },
      { name: '엘리그마 계산기', path: '/calculator/eligma' },
      { name: '제조 계산기',    path: '/calculator/crafting' },
      { name: '이벤트 계산기',  path: '/calculator/event' },
    ],
  },
];
```

렌더 시 `'children' in item` 으로 타입 판별.

---

## 5. 컴포넌트 변경

### 5.1 상태
```ts
const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(['정보']));
const toggleGroup = (name: string) => {
  setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
};
```

### 5.2 현재 경로 기반 자동 펼침
```ts
useEffect(() => {
  navLinks.forEach((item) => {
    if ('children' in item) {
      const active = item.children.some(
        (c) => location.pathname === c.path || location.pathname.startsWith(c.path + '/')
      );
      if (active) setOpenGroups((prev) => new Set(prev).add(item.name));
    }
  });
}, [location.pathname]);
```

### 5.3 렌더 분기
```tsx
{navLinks.map((item) => {
  if ('children' in item) {
    const isOpen = openGroups.has(item.name);
    const groupActive = item.children.some(
      (c) => location.pathname === c.path || location.pathname.startsWith(c.path + '/')
    );
    return (
      <div key={item.name}>
        <button
          type="button"
          onClick={() => toggleGroup(item.name)}
          className={`w-full flex items-center px-4 py-2 rounded-md font-medium transition-colors ${
            groupActive ? '...' : '...'
          }`}
        >
          <span className="flex-1 text-left">{item.name}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        </button>
        {isOpen && (
          <div className="flex flex-col gap-1 mt-1">
            {item.children.map((c) => (
              <Link
                key={c.path}
                to={c.path}
                onClick={onClose}
                className={`pl-7 pr-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(c.path) ? '...' : '...'
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }
  // 단일 링크 — 기존 렌더 유지
  return <Link ... />;
})}
```

### 5.4 active 판정 분리
중복을 제거하기 위해 `isActive(path)` 헬퍼 함수로 추출 권장.

---

## 6. 스타일 가이드

| 요소 | Tailwind |
|---|---|
| 그룹 헤더 기본 | `text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700` |
| 그룹 헤더 active (하위 중 현재 경로 있음) | `text-blue-700 dark:text-blue-300` (배경 없이 텍스트만, 시각적 과함 방지) |
| 그룹 헤더 chevron | `w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform` — 열림 `rotate-0`, 닫힘 `-rotate-90` |
| 하위 링크 기본 | `pl-7 pr-4 py-1.5 rounded-md text-sm ...` (들여쓰기 + 작은 폰트) |
| 하위 링크 active | `bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300` (기존 active 색 동일) |

---

## 7. 기존 기능 회귀 확인

- **내부 공지 컨텍스트 active** (`?internal=true` 감지) — 기존 `isInternalContext` 로직은 정보글에만 적용. 정보글이 그룹 하위로 내려가도 active 제외 조건을 **하위 링크에서도 동일 적용** 필요
  ```ts
  const isActive = pathMatches && !(path === '/guide' && isInternalContext);
  ```
  이 로직을 `isActive(path)` 헬퍼에 포함
- 모바일 사이드바 오버레이 동작은 그대로 (그룹 토글은 오버레이 내부에서만 동작)

---

## 8. 작업 순서 (단일 PR)

1. `navLinks` 타입/구조 변경 — 6개를 `{ name: '정보', children: [...] }` 로 묶음
2. `useState<Set<string>>` 로 펼침 상태 + `useEffect` 로 현재 경로 기반 자동 펼침
3. 렌더 블록을 `'children' in item` 분기로 교체, `isActive(path)` 헬퍼 추출
4. `lucide-react` 의 `ChevronDown` 임포트
5. 타입 체크 + 수동 테스트

---

## 9. 수동 테스트 체크리스트

- [ ] 첫 진입 시 "정보" 그룹 펼쳐진 상태
- [ ] "정보" 헤더 클릭 → chevron 90도 회전하며 접힘
- [ ] `/guide` 접속 상태에서 사이드바 열면 "정보" 자동 펼쳐짐
- [ ] `/calculator/eligma` 상태에서도 "정보" 자동 펼쳐짐 + 해당 하위만 active 강조
- [ ] `/guide/new?internal=true` (내부 공지 작성) → "정보글" active **안** 됨, 상단 "내부 공지" active (기존 동작 유지)
- [ ] 모바일 오버레이 열림 → 그룹 토글 정상 동작 → 하위 링크 클릭 시 오버레이 자동 닫힘
- [ ] admin 영역(`/admin/*`) 접속 시 "정보" 그룹은 현재 펼침 상태 그대로 유지 (영향 없음)

---

## 10. 결정된 사항

| 항목 | 결정 |
|---|---|
| 초기 펼침 상태 | **펼쳐짐** |
| 그룹 헤더 active 강조 | **강조** (하위 중 현재 경로가 있을 때 헤더 색 변경) |
| 펼침 상태 `localStorage` 저장 | **저장** (키: `sidebar.openGroups`, 값: 펼쳐진 그룹 이름 배열 JSON) |
| admin 메뉴 그룹화 | **보류** (이번 범위 밖) |
