# MD 생성 시스템 개선 계획

## 현재 문제점

### 1. 생성 결과가 짧고 얕음
- **현재**: 8개 섹션, 150줄 내외
- **목표**: 20개 섹션, 500줄 이상 (42~46페이지 분량)

### 2. 가이드 파일 미활용
현재 `generate-md.js`는 가이드 파일을 전혀 참조하지 않음
```
사주/가이드/
├── 01_기초_천간지지오행.md
├── 02_십성_해석.md
├── 03_합충형파해.md
├── 04_병존반복구조.md
├── 05_신살_48종.md
├── 05_신살_검증표.md
├── 06_대운세운.md
├── 07_격국용신.md
├── 08_프리미엄_해석방법.md
└── 프리미엄_사주_지침_가이드.md
```

### 3. 단일 API 호출의 한계
- `max_tokens: 12000`으로 제한
- 긴 보고서 생성 시 중간에 잘림

---

## 해결 방안: 섹션별 분할 생성 + 자동 이어쓰기

### 아키텍처

```
[프론트엔드] ──────────────────────────────────────
     │
     ▼
[1] 섹션 목록 요청 (어떤 섹션들을 생성할지)
     │
     ▼
[Netlify Function] ────────────────────────────────
     │
     ├─► [2] 섹션1 생성 (표지~명식 분석)
     │        ↓
     │   응답 확인 → 완료? → 다음 섹션
     │        ↓ 미완료
     │   [2-1] 이어쓰기 요청 (자동)
     │
     ├─► [3] 섹션2 생성 (일간/오행 분석)
     │        ↓
     │   ...반복...
     │
     └─► [N] 마지막 섹션 생성
              ↓
         [검토 요청] (선택)
              ↓
         [최종 MD 반환]
```

---

## 구현 계획

### Phase 1: 섹션 정의 및 프롬프트 분리

#### 섹션 분류 (총 7개 묶음)

| 섹션 번호 | 섹션명 | 포함 내용 |
|-----------|--------|-----------|
| 1 | 표지+기본정보 | 표지, 고객정보, 사주 명식, 일간 분석 |
| 2 | 오행+십성 | 오행 분포, 십성 분석, 성격/기질 |
| 3 | 신살+격국 | 신살 분석, 격국용신, 대운 흐름 |
| 4 | 올해운세 | 2025/2026년 세운, 월별 운세 |
| 5 | 분야별운세 | 연애/결혼, 직업/재물, 건강 |
| 6 | 인연상 | 배우자상, 인연수, 만남시기 (프리미엄) |
| 7 | 맞춤답변+마무리 | 질문 답변, 행운 포인트, 마무리 |

#### 각 섹션별 전용 프롬프트
```javascript
const SECTION_PROMPTS = {
  section1_intro: `...표지, 명식 분석 전용 프롬프트...`,
  section2_oheng: `...오행, 십성 분석 전용 프롬프트...`,
  // ...
};
```

### Phase 2: 가이드 파일 로딩 시스템

#### 방법 A: 빌드 시 삽입 (권장)
```javascript
// build-prompts.js - 빌드 스크립트
const fs = require('fs');
const guides = {
  saju_basics: fs.readFileSync('가이드/01_기초_천간지지오행.md', 'utf8'),
  sipsung: fs.readFileSync('가이드/02_십성_해석.md', 'utf8'),
  // ...
};
// prompts.js 파일 생성
```

#### 방법 B: 요약본 직접 삽입
가이드 파일 전체는 너무 길어서, **핵심 요약본**을 시스템 프롬프트에 직접 삽입

### Phase 3: 자동 이어쓰기 로직

```javascript
async function generateSection(sectionName, context, previousContent = '') {
  const MAX_RETRIES = 3;
  let fullContent = previousContent;
  let retries = 0;

  while (retries < MAX_RETRIES) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        { role: 'user', content: buildSectionPrompt(sectionName, context) },
        ...(fullContent ? [
          { role: 'assistant', content: fullContent },
          { role: 'user', content: '이어서 작성해주세요.' }
        ] : [])
      ]
    });

    fullContent += response.content[0].text;

    // 완료 마커 확인
    if (isComplete(fullContent, sectionName)) {
      return fullContent;
    }

    retries++;
  }

  return fullContent; // 최대 시도 후 반환
}
```

#### 완료 확인 방법
```javascript
function isComplete(content, sectionName) {
  const endMarkers = {
    section1_intro: '---', // 섹션 구분선
    section7_ending: '<!-- 마무리멘트 -->', // 마지막 태그
  };

  return content.includes(endMarkers[sectionName]) ||
         content.includes('<!-- 섹션완료 -->');
}
```

### Phase 4: API 엔드포인트 구조 변경

#### 현재 (단일 엔드포인트)
```
POST /generate-md
Body: { customer, action }
Response: { content: "전체 MD" }
```

#### 변경 후 (섹션별 + 스트리밍)
```
POST /generate-md
Body: {
  customer,
  action: 'generate',
  options: {
    streaming: true,  // 실시간 진행상황
    sections: ['all'] // 또는 ['section1', 'section2']
  }
}
Response: {
  sections: [
    { name: 'section1', content: '...', status: 'complete' },
    { name: 'section2', content: '...', status: 'complete' },
    // ...
  ],
  fullContent: '통합 MD',
  metadata: {
    totalSections: 7,
    completedSections: 7,
    totalTokens: 45000
  }
}
```

### Phase 5: 프론트엔드 진행상황 표시

```javascript
// 6_result.html 수정
async function generateMD() {
  showProgress('섹션 1/7: 표지 및 기본정보 생성 중...');

  const response = await fetch('/generate-md', {
    method: 'POST',
    body: JSON.stringify({
      customer,
      options: { streaming: true }
    })
  });

  // 스트리밍 응답 처리
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const data = JSON.parse(new TextDecoder().decode(value));
    updateProgress(data.currentSection, data.totalSections);
    appendPreview(data.content);
  }
}
```

---

## 파일 변경 목록

### 1. 수정할 파일
| 파일 | 변경 내용 |
|------|-----------|
| `사주/배포/netlify-functions/generate-md.js` | 전면 재작성 (섹션별 생성) |
| `사주/앱/6_result.html` | 진행상황 UI 추가 |

### 2. 새로 생성할 파일
| 파일 | 내용 |
|------|------|
| `사주/배포/netlify-functions/prompts/section-prompts.js` | 섹션별 프롬프트 |
| `사주/배포/netlify-functions/prompts/guide-summaries.js` | 가이드 요약본 |
| `사주/배포/netlify-functions/utils/section-generator.js` | 섹션 생성 로직 |

---

## 구현 순서

### Step 1: 프롬프트 파일 분리 (30분)
1. 현재 SYSTEM_PROMPT를 섹션별로 분리
2. 각 섹션별 전용 프롬프트 작성
3. 가이드 파일 핵심 요약본 작성

### Step 2: 섹션 생성 로직 구현 (1시간)
1. `section-generator.js` 작성
2. 이어쓰기 로직 구현
3. 완료 확인 로직 구현

### Step 3: generate-md.js 재작성 (1시간)
1. 새 구조로 재작성
2. 에러 처리 강화
3. 로깅 추가

### Step 4: 프론트엔드 수정 (30분)
1. 진행상황 UI 추가
2. 실시간 미리보기 업데이트

### Step 5: 테스트 및 조정 (1시간)
1. 실제 데이터로 테스트
2. 프롬프트 미세 조정
3. 결과물 품질 확인

---

## 예상 결과

### Before (현재)
- 생성 시간: 15~20초
- 결과 길이: 150줄
- 섹션 수: 8개
- 내용 깊이: 얕음

### After (개선 후)
- 생성 시간: 60~90초 (섹션별 진행 표시)
- 결과 길이: 500줄 이상
- 섹션 수: 20개+
- 내용 깊이: 가이드 기반 상세 분석

---

## 리스크 및 대응

| 리스크 | 대응 방안 |
|--------|----------|
| API 비용 증가 | 섹션 수 조절, 불필요한 재생성 방지 |
| 생성 시간 증가 | 진행상황 표시로 UX 개선 |
| 섹션 간 일관성 | 이전 섹션 요약을 다음 섹션에 전달 |
| Netlify 타임아웃 (10초) | 섹션별 개별 요청으로 분리 |

---

## Netlify 타임아웃 해결 방안

Netlify 무료 플랜은 함수 실행 시간 10초 제한이 있음.

### 해결 방법: 클라이언트 주도 섹션별 요청

```javascript
// 프론트엔드에서 섹션별로 순차 요청
async function generateAllSections(customer) {
  const sections = ['section1', 'section2', ...];
  const results = [];

  for (const section of sections) {
    const result = await fetch('/generate-md', {
      body: JSON.stringify({ customer, section })
    });
    results.push(await result.json());
    updateProgress(section);
  }

  return combineResults(results);
}
```

이렇게 하면 각 섹션이 10초 내에 완료되고, 전체 생성은 클라이언트에서 조율.
