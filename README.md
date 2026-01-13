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
사주 관리자페이지/
├── index.html              # 관리자 메인페이지
├── 1_input.html            # 입력폼
├── 2_saju.html             # 사주계산기
├── 3_inyeon_calc.html      # 인연상 계산기
├── 4_inyeon_gen.html       # 인연상 생성기
├── 5_prompt.html           # 프롬프트 생성기
├── 6_result.html           # 결과 작성
├── 7_question.html         # 추가질문
├── 8_question_result.html  # 추가질문 결과
├── skills/                 # 스킬 파일 (공통)
├── input-form-deploy/      # 입력폼 배포용
├── netlify/
│   └── functions/          # Netlify Functions
├── backup/                 # 백업 파일
├── .claude/
│   ├── CLAUDE.md           # Claude Code 규칙
│   └── commands/           # 커스텀 명령어
└── README.md               # 이 파일
```

---

## 향후 계획

- [ ] MD 파일 자동 생성 (Netlify Functions + Claude API)
- [ ] MD 파일 검토 에이전트
- [ ] 스탠다드/라이트 패키지 구현
