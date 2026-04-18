# 내부 공지 작성/수정 폼 UI 구분 수정 계획

> **문제**: [GuideFormPage.tsx](my-site/src/service/guide/pages/GuideFormPage.tsx) 는 일반 정보글과 내부 공지를 같은 컴포넌트로 렌더하는데, `isInternal` 여부와 무관하게 UI 가 동일하여 사용자가 어떤 종류를 작성 중인지 화면만 보고는 알 수 없다.

범위: **해석 A (UI 구분)** — 본문 초기 템플릿(해석 B)은 이번 범위가 아님.

---

## 1. 현상

[GuideFormPage.tsx:105-118](my-site/src/service/guide/pages/GuideFormPage.tsx#L105-L118) 기준 아래 요소가 `isInternal` 여부로 분기되지 않음:

| 요소 | 현재 값 | 기대 |
|---|---|---|
| 페이지 제목 | `'정보글 작성'` / `'정보글 수정'` | 내부일 때 `'내부 공지 작성'` / `'내부 공지 수정'` |
| 상단 배지/힌트 | 없음 | 내부일 때 `"내부"` yellow 배지 ([InternalNoticePage:113](my-site/src/service/admin/pages/InternalNoticePage.tsx#L113) 와 동일 톤) |
| 제목 input placeholder | `"정보글 제목을 입력하세요"` | 내부일 때 `"내부 공지 제목을 입력하세요"` |

> 현 코드에서도 **저장/취소 이동 경로**와 **카테고리 옵션(Internal vs 일반 Repository)** 은 이미 분기됨. UI 텍스트만 빠져있음.

> `isInternal` 은 URL 쿼리(`?internal=true`) 또는 편집 대상 guide 의 `is_internal` 로 결정되며, 폼에서 직접 토글할 수 있는 UI 는 없음 (변경 범위 밖).

---

## 2. 수정 방향

### 2.1 페이지 제목
```tsx
<h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight flex items-center gap-2">
  {isInternal && (
    <span className="text-xs px-1.5 py-0.5 bg-yellow-50 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded font-bold">
      내부
    </span>
  )}
  {isEdit ? (isInternal ? '내부 공지 수정' : '정보글 수정') : (isInternal ? '내부 공지 작성' : '정보글 작성')}
</h1>
```
- 배지 톤은 [InternalNoticePage:113-115](my-site/src/service/admin/pages/InternalNoticePage.tsx#L113-L115) 와 동일 (`yellow-50 / yellow-900/40`)
- 삼항 중첩이 거슬리면 상단에서 변수로 추출:
  ```tsx
  const resourceLabel = isInternal ? '내부 공지' : '정보글';
  const actionLabel = isEdit ? '수정' : '작성';
  // → {resourceLabel} {actionLabel}
  ```
  가독성 좋으므로 **이쪽 권장**.

### 2.2 제목 placeholder ([GuideFormPage.tsx:117](my-site/src/service/guide/pages/GuideFormPage.tsx#L117))
```tsx
placeholder={`${resourceLabel} 제목을 입력하세요`}
```

### 2.3 (선택) 저장 버튼 문구
현재: `{loading ? '저장 중...' : isEdit ? '수정하기' : '작성하기'}`
- "내부 공지" / "정보글" 을 버튼에 넣는 건 과잉. **변경하지 않음**.

### 2.4 (선택) 상단 안내 문구
InternalNoticePage 는 `"관리자/부관리자 전용 공지사항입니다."` 설명을 둠. 폼에도 동일 설명을 제목 아래 짧게 넣을지 여부:
- 현재 계획: **넣지 않음** — 폼 페이지까지 진입한 시점엔 이미 알고 있을 확률이 높고, 시각적 소음 증가
- 의견 있으면 추가

---

## 3. 변경 파일

- [my-site/src/service/guide/pages/GuideFormPage.tsx](my-site/src/service/guide/pages/GuideFormPage.tsx) — **이 파일 하나만 수정**

다른 파일은 건드릴 필요 없음. Repository / Router / Sidebar 변경 없음.

---

## 4. 수락 기준 (수동 테스트)

- [ ] `/guide/new` 진입 → 제목 "정보글 작성", 배지 없음, placeholder "정보글 제목을 입력하세요"
- [ ] `/guide/new?internal=true` 진입 → 제목 "내부 공지 작성", **yellow "내부" 배지 표시**, placeholder "내부 공지 제목을 입력하세요"
- [ ] 기존 일반 정보글 편집(`/guide/:id/edit`, `is_internal=false`) → 제목 "정보글 수정"
- [ ] 기존 내부 공지 편집(`/guide/:id/edit`, `is_internal=true`) → 제목 "내부 공지 수정" + 배지 표시
- [ ] 저장/취소 후 이동 경로는 기존과 동일 (`/admin/notices` vs `/guide`)
- [ ] `npm run type-check` 통과

---

## 5. 변경 규모 예상

- 코드 라인: 약 **5~10 줄** 수정/추가
- 리스크: 거의 없음 (UI 텍스트 분기만 추가)
- PR: 단일 커밋으로 머지 가능
