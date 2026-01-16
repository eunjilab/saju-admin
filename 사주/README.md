# 사주 관리자페이지 시스템 구조

## 개요
사주 명리학 기반 유료 서비스 관리 시스템

---

## 배포 사이트

| 사이트 | URL | 용도 |
|--------|-----|------|
| **관리자페이지 (메인)** | saju-admin.netlify.app | 모든 도구 통합, 고객 관리 |
| 입력폼 | lucky-cactus-b5f9e6.netlify.app | 고객 신청 폼 |
| 사주계산기 | saju-calc.netlify.app | 사주 계산 도구 |
| 추가질문폼 | jovial-medovik-51e5df.netlify.app | 고객 추가질문 입력 |

---

## 파일 구조

### HTML 도구들 (번호순 작업 흐름)

| 파일 | 역할 | 별도 배포 |
|------|------|----------|
| `1_input.html` | 고객 입력폼 (신청서) | lucky-cactus-b5f9e6.netlify.app |
| `2_saju.html` | 사주계산기 (만세력, 대운, 신살 등) | saju-calc.netlify.app |
| `3_inyeon_calc.html` | 인연상 계산기 (점수, 만남시기) | - |
| `4_inyeon_gen.html` | 인연상 이미지 생성기 | - |
| `5_prompt.html` | 프롬프트 생성기 (Claude용) | - |
| `6_result.html` | 결과 작성/저장 도구 | - |
| `7_question.html` | 추가질문 입력폼 | jovial-medovik-51e5df.netlify.app |
| `8_question_result.html` | 추가질문 결과 작성 도구 | - |
| `index.html` | **관리자 메인페이지** (모든 도구 연결) | saju-admin.netlify.app |

### 작업 흐름 (파이프라인)

```
고객 신청 (1_input)
    ↓
관리자페이지에서 "변환시작" 클릭 (index.html)
    ↓
┌─────────────────────────────────────────┐
│  자동 파이프라인 (iframe 방식)           │
│                                         │
│  1. 사주계산기 (2_saju.html)             │
│     → sajuResult 생성                   │
│                                         │
│  2. [프리미엄만] 인연상 계산기            │
│     (3_inyeon_calc.html)                │
│     → inyeonCalcResult 생성             │
│                                         │
│  3. [프리미엄만] 인연상 이미지 생성        │
│     (4_inyeon_gen.html)                 │
│     → inyeonHTML 생성                   │
│                                         │
│  4. 프롬프트 생성기 (5_prompt.html)       │
│     → promptResult 생성                 │
└─────────────────────────────────────────┘
    ↓
결과 작성 (6_result.html)
    ↓
[선택] 추가질문 (7_question → 8_question_result)
    ↓
완료
```

---

## 데이터 저장

### 저장소
- **Google Sheets**: 원본 데이터 (모든 고객 정보)
- **Supabase**: 동기화된 데이터 (빠른 조회용)

### 주요 필드
| 필드 | 설명 |
|------|------|
| orderCode | 주문코드 (P-YYMMDD-NNN) |
| sajuResult | 사주계산 결과 (만세력, 대운, 신살 등) |
| inyeonCalcResult | 인연상 계산 결과 |
| inyeonHTML | 인연상 이미지 HTML |
| promptResult | 프롬프트 생성 결과 |
| mainResultText | 주요 결과글 |
| additionalResultText | 추가질문 결과글 |
| questions | 선택 질문 목록 |

---

## 스킬 파일 (사주 해석 가이드)

### 위치
**최신 버전**: `/Users/eunji/사주-프로젝트/스킬/프리미엄/`

### 파일 목록

| 파일 | 용도 |
|------|------|
| saju-basics.md | 천간/지지/오행 기초 |
| sipsung-guide.md | 십성 해석 |
| hapchung-guide.md | 합충형파해 |
| byeongjon-guide.md | 병존/반복 구조 |
| sinsal-guide.md | 48종 신살 |
| daeun-guide.md | 대운/세운 |
| gyeokguk-guide.md | 격국/용신 |
| **premium-result.md** | 프리미엄 해석 방법 |
| **프리미엄_사주_지침_가이드.md** | 프리미엄 전용 지침 |

---

## 패키지 종류

| 패키지 | 내용 | 상태 |
|--------|------|------|
| 라이트 | 기본 사주 분석 | 미구현 |
| 스탠다드 | + 운세표 | 미구현 |
| **프리미엄** | + 인연상 + 신살 20종 + 맞춤질문 | **테스트 중** |

---

## 배포 규칙

### 기본 배포 (관리자페이지)
```bash
cd "/Users/eunji/사주 관리자페이지"
npx netlify deploy --prod
git add -A && git commit -m "메시지" && git push origin main
```

### 입력폼 수정 시 (반드시 3곳!)
```bash
# 1. 관리자페이지
npx netlify deploy --prod

# 2. 입력폼
cd input-form-deploy && npx netlify deploy --prod

# 3. GitHub
git add -A && git commit -m "메시지" && git push origin main
```

### 개별 도구 수정 시 (반드시 3곳!)

#### 2_saju.html (사주계산기) 수정 시
```bash
# 1. 관리자페이지
npx netlify deploy --prod

# 2. 사주계산기
cd saju-calc-deploy && npx netlify deploy --prod
# 사이트: saju-calc.netlify.app

# 3. GitHub
git add -A && git commit -m "메시지" && git push origin main
```

#### 7_question.html (추가질문폼) 수정 시
```bash
# 1. 관리자페이지
npx netlify deploy --prod

# 2. 추가질문폼
cd question-form-deploy && npx netlify deploy --prod
# 사이트: jovial-medovik-51e5df.netlify.app

# 3. GitHub
git add -A && git commit -m "메시지" && git push origin main
```

#### 배포 체크리스트
| 수정 파일 | 관리자페이지 | 개별 사이트 | GitHub |
|----------|-------------|------------|--------|
| 1_input.html | ✅ | ✅ lucky-cactus-b5f9e6 | ✅ |
| 2_saju.html | ✅ | ✅ saju-calc | ✅ |
| 7_question.html | ✅ | ✅ jovial-medovik-51e5df | ✅ |
| 기타 도구 | ✅ | - | ✅ |

---

## 폴더 구조

```
사주/
├── 앱/                         # 메인 앱 파일들
│   ├── index.html              # 관리자 메인페이지
│   ├── 1_input.html            # 입력폼
│   ├── 2_saju.html             # 사주계산기
│   ├── 3_inyeon_calc.html      # 인연상 계산기
│   ├── 4_inyeon_gen.html       # 인연상 생성기
│   ├── 5_prompt.html           # 프롬프트 생성기
│   ├── 6_result.html           # 결과 작성
│   ├── 7_question.html         # 추가질문
│   ├── 8_question_result.html  # 추가질문 결과
│   └── styles.css              # 공통 스타일
│
├── 배포/                       # 배포 관련
│   ├── 에이전트/               # 에이전트 시스템 (NEW!)
│   │   ├── 에이전트_시스템_계획.md  # 전체 계획
│   │   └── MD생성_개선_계획.md     # 상세 계획
│   ├── netlify-functions/      # Netlify Functions
│   │   ├── generate-md.js      # MD 생성 API
│   │   ├── prompts/            # 프롬프트 파일들
│   │   └── utils/              # 유틸리티 함수
│   └── input-form/             # 입력폼 배포용
│
├── 가이드/                     # 사주 해석 가이드 (10개)
│   ├── 01_기초_천간지지오행.md
│   ├── 02_십성_해석.md
│   ├── 03_합충형파해.md
│   ├── 04_병존반복구조.md
│   ├── 05_신살_48종.md
│   ├── 05_신살_검증표.md
│   ├── 06_대운세운.md
│   ├── 07_격국용신.md
│   ├── 08_프리미엄_해석방법.md
│   └── 프리미엄_사주_지침_가이드.md
│
├── 테스트/                     # 테스트 관련
│   ├── saju-calc.test.html     # 사주계산 테스트
│   ├── inyeon-calc.test.html   # 인연상계산 테스트
│   └── 결과물/                 # 테스트 결과물 저장
│
├── 백업/                       # 백업 파일
│   └── 2_saju_backup.html
│
└── README.md                   # 이 파일
```

---

## MD 자동생성 시스템

### 개요
관리자페이지에서 버튼 클릭으로 사주 보고서 MD 파일을 자동 생성하는 기능

### 구조
```
[관리자페이지]              [Netlify Function]           [Claude API]
     │                           │                           │
     │── "MD 생성" 클릭 ────────>│                           │
     │   (고객 데이터 전송)       │                           │
     │                           │── API 요청 ──────────────>│
     │                           │   (프롬프트+sajuResult)    │
     │                           │                           │
     │                           │<─── MD 응답 ─────────────│
     │<── MD 반환 ──────────────│                           │
     │                           │                           │
     │ [미리보기/다운로드/적용]   │                           │
```

### 파일
- `netlify/functions/generate-md.js` - Claude API 연동 함수
- `index.html` - Step 6: MD 자동생성 UI

### 기능
| 버튼 | 기능 |
|------|------|
| 🤖 MD 생성 | Claude API로 사주 보고서 생성 |
| 🔍 검토 | 생성된 MD가 계산 결과와 일치하는지 확인 |
| 👁️ 미리보기 | 새 창에서 MD 내용 확인 |
| 💾 다운로드 | .md 파일로 저장 |
| ✏️ 수정 | 수정 요청 입력 후 재생성 |
| ✅ 결과글에 적용 | mainResultText에 자동 저장 |

### 환경변수 설정 (필수!)
Netlify 대시보드에서 설정:
1. Site settings → Environment variables
2. `ANTHROPIC_API_KEY` 추가
3. Anthropic API 키 값 입력

### 핵심 규칙
- **계산 금지**: 대운, 세운, 인연수 등은 이미 계산된 sajuResult, inyeonCalcResult를 그대로 사용
- Claude가 임의로 계산하지 않도록 시스템 프롬프트에 강력히 명시

---

## 결과생성기 특수 태그 형식

### 개요
MD 자동생성 → 결과생성기(6_result.html) 연결 시 사용하는 특수 HTML 주석 태그

### 태그 → 결과물 변환

| 태그 | 결과생성기 표시 | 용도 |
|------|----------------|------|
| `<!-- 소름 -->내용<!-- /소름 -->` | 🔮 소름 포인트 박스 | 정확히 맞는 부분 강조 |
| `<!-- 왜그런지 -->내용<!-- /왜그런지 -->` | 📚 사주 해석 박스 | 사주 근거 설명 |
| `<!-- 주의 -->내용<!-- /주의 -->` | ⚠️ 주의 박스 | 주의사항 |
| `<!-- 조언 -->내용<!-- /조언 -->` | 💡 조언 박스 | 실용적 해결책 |
| `<!-- 희망 -->내용<!-- /희망 -->` | ✨ 마무리 박스 | 희망적 메시지 |
| `<!-- 강점 -->내용<!-- /강점 -->` | 💪 강점 박스 | 장점 강조 |
| `<!-- 공감 -->내용<!-- /공감 -->` | 💚 공감 포인트 | 공감 유발 |
| `<!-- 올해핵심 -->내용<!-- /올해핵심 -->` | 표지 핵심 키워드 | 올해 요약 |
| `<!-- 마무리멘트 -->내용<!-- /마무리멘트 -->` | 마지막 카드 | 응원 메시지 |

### 기타 형식
```markdown
[키워드] 재물운, 변화, 도전    → 예쁜 태그 뱃지로 변환
| 월 | 운세 | 키워드 |          → 깔끔한 테이블로 변환
**굵게** *이탤릭*              → 스타일 적용
```

### 사용 예시
```markdown
8월에 심장이랑 혈압 조심하세요.
<!-- 왜그런지 -->화(火) 기운이 과해지는 달이에요. 일간 丙火에 세운 午火까지 더해져서 화기가 폭발해요.<!-- /왜그런지 -->
<!-- 조언 -->야근 줄이고, 매운 음식 피하세요. 수영이나 물 근처 산책이 좋아요.<!-- /조언 -->
```

### 데이터 흐름
```
Step 5: 프롬프트 생성기
    ↓ (고객정보 + 계산결과 → Claude 프롬프트)
Step 6: MD 자동생성 (Claude API)
    ↓ (특수 태그 포함된 마크다운)
Step 7: 결과글 저장
    ↓ (복사 → 6_result.html에 붙여넣기)
Step 8: 결과파일 (HTML 결과지)
    ↓ (특수 태그 → 예쁜 박스로 변환)
```

---

## 향후 계획

- [x] MD 파일 자동 생성 (Netlify Functions + Claude API)
- [x] 섹션별 분할 생성 시스템 구축
- [ ] **MD 생성/검증 에이전트 시스템** (진행 중)
  - [ ] 에이전트1: MD 생성 (섹션별 분할)
  - [ ] 에이전트2: 검증/자동수정
  - [ ] 스텝6 UI 개선 (진행상황, 검증결과 표시)
- [ ] 스탠다드/라이트 패키지 구현

### 에이전트 시스템 상세
`배포/에이전트/에이전트_시스템_계획.md` 참조
