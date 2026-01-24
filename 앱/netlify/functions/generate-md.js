/**
 * MD 생성 Netlify Function (V2 - 섹션별 생성)
 *
 * 변경점:
 * - 섹션별 분할 생성 (Netlify 10초 타임아웃 대응)
 * - 가이드 요약본 포함
 * - 자동 이어쓰기
 *
 * 엔드포인트:
 * - POST /generate-md (action: 'section') - 단일 섹션 생성
 * - POST /generate-md (action: 'full') - 전체 생성 (기존 호환)
 * - POST /generate-md (action: 'modify') - 수정
 * - POST /generate-md (action: 'review') - 검토
 */

const Anthropic = require('@anthropic-ai/sdk');

// 섹션 정의
const SECTIONS = [
    { id: 'intro', name: '표지+기본정보', order: 1 },
    { id: 'oheng', name: '오행+십성', order: 2 },
    { id: 'sinsal', name: '신살+격국', order: 3 },
    { id: 'yearly', name: '올해운세', order: 4 },
    { id: 'category', name: '분야별운세', order: 5 },
    { id: 'inyeon', name: '인연상', order: 6, premiumOnly: true },
    { id: 'ending', name: '맞춤답변+마무리', order: 7 }
];

exports.handler = async (event, context) => {
    // CORS 헤더
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // OPTIONS 요청 처리 (CORS preflight)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // POST만 허용
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { customer, action, section, previousContent, previousMd, modificationRequest } = body;

        // API 키 확인
        if (!process.env.ANTHROPIC_API_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'API key not configured' })
            };
        }

        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });

        // action에 따른 분기
        switch (action) {
            case 'section':
                // 단일 섹션 생성
                return await handleSectionGeneration(anthropic, customer, section, previousContent, headers);

            case 'full':
                // 전체 생성 (기존 호환 - 단일 호출로 짧은 버전)
                return await handleFullGeneration(anthropic, customer, headers);

            case 'modify':
                // 수정 요청
                return await handleModification(anthropic, customer, previousMd, modificationRequest, headers);

            case 'review':
                // 검토 요청
                return await handleReview(anthropic, customer, previousMd, headers);

            case 'sections-info':
                // 섹션 목록 반환
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        sections: getRequiredSections(customer.package)
                    })
                };

            default:
                // 기본: 전체 생성 (기존 호환)
                return await handleFullGeneration(anthropic, customer, headers);
        }

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to generate MD',
                details: error.message
            })
        };
    }
};

// ========== 섹션 생성 핸들러 ==========
async function handleSectionGeneration(anthropic, customer, sectionId, previousContent, headers) {
    const sectionInfo = SECTIONS.find(s => s.id === sectionId);
    if (!sectionInfo) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: `Unknown section: ${sectionId}` })
        };
    }

    // 프리미엄 전용 섹션 체크
    if (sectionInfo.premiumOnly && customer.package !== 'premium') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                content: '',
                skipped: true,
                reason: 'Premium only section'
            })
        };
    }

    const systemPrompt = getSectionPrompt(sectionId);
    const userPrompt = buildSectionUserPrompt(customer, sectionId, previousContent);

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 6000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        const content = message.content[0].text;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                sectionId: sectionId,
                sectionName: sectionInfo.name,
                content: content,
                stopReason: message.stop_reason,
                usage: message.usage
            })
        };

    } catch (error) {
        console.error(`Section ${sectionId} error:`, error);
        throw error;
    }
}

// ========== 전체 생성 핸들러 (기존 호환) ==========
async function handleFullGeneration(anthropic, customer, headers) {
    const systemPrompt = FULL_SYSTEM_PROMPT;
    const userPrompt = buildFullUserPrompt(customer);

    const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 12000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
    });

    const mdContent = message.content[0].text;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            content: mdContent,
            fileName: `${customer.name}_사주보고서_${new Date().toISOString().split('T')[0]}.md`
        })
    };
}

// ========== 수정 핸들러 ==========
async function handleModification(anthropic, customer, previousMd, modificationRequest, headers) {
    const userPrompt = `다음은 기존에 생성된 사주 보고서입니다:

${previousMd}

사용자의 수정 요청:
${modificationRequest}

위 요청에 따라 보고서를 수정해주세요. 전체 마크다운 형식을 유지하면서 수정된 버전을 출력해주세요.
⚠️ 계산 결과(대운, 인연상, 신살 등)는 절대 변경하지 마세요.`;

    const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 12000,
        system: FULL_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
    });

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            content: message.content[0].text,
            fileName: `${customer.name}_사주보고서_${new Date().toISOString().split('T')[0]}.md`
        })
    };
}

// ========== 검토 핸들러 ==========
async function handleReview(anthropic, customer, previousMd, headers) {
    const userPrompt = `다음 사주 보고서를 검토해주세요:

${previousMd}

## 원본 계산 데이터 (검증용)
${customer.sajuResult || '없음'}

${customer.inyeonCalcResult || ''}

위 보고서가 원본 계산 데이터와 일치하는지, 그리고 작성 규칙을 잘 따랐는지 검토해주세요.`;

    const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
    });

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            content: message.content[0].text
        })
    };
}

// ========== 유틸리티 함수 ==========
function getRequiredSections(packageType) {
    return SECTIONS.filter(section => {
        if (section.premiumOnly && packageType !== 'premium') {
            return false;
        }
        return true;
    });
}

// ========== 섹션별 프롬프트 ==========
function getSectionPrompt(sectionId) {
    const commonRules = `
## 🔴 절대 규칙

### 1. 계산 금지!
- 대운, 세운, 인연수, 배우자상, 신살 등 **모든 계산은 이미 완료되어 제공됩니다**
- 제공된 "사주 계산 결과"와 "인연상 계산 결과"를 **그대로** 사용하세요

### 2. 직접적인 표현 필수
❌ 나쁜 예시: "건강에 주의가 필요한 시기예요."
✅ 좋은 예시: "8월에 심장이랑 혈압 조심하세요. 화(火) 기운이 과해져서 그래요."

### 3. 해석 공식
[언제] + [뭐가 문제인지 직접] + [왜: 사주 근거] + [어떻게 피하는지]

### 4. 특수 태그 사용 (필수!)
<!-- 소름 -->정확한 내용<!-- /소름 -->
<!-- 왜그런지 -->사주 근거<!-- /왜그런지 -->
<!-- 주의 -->주의점<!-- /주의 -->
<!-- 조언 -->해결책<!-- /조언 -->
<!-- 강점 -->장점<!-- /강점 -->
<!-- 공감 -->공감 내용<!-- /공감 -->
`;

    const sectionPrompts = {
        intro: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 표지 + 기본정보

작성할 내용:
1. 표지 (고객명, 생년월일시, 올해 핵심 키워드)
   - <!-- 올해핵심 -->핵심 키워드 3-4개<!-- /올해핵심 --> 태그 사용
   - [키워드] 태그로 주요 키워드 나열
2. 사주 명식 표 (연주/월주/일주/시주)
3. 일간 분석 (자연물 비유, 핵심 성향 3-4가지)
   - <!-- 소름 --> 태그로 고객이 공감할 특성 언급

⚠️ 자세하고 풍부하게 작성하세요. 최소 1500자 이상.
마크다운 형식으로 작성하세요. 섹션 끝에 --- 구분선 넣기.`,

        oheng: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 오행 + 십성 분석

작성할 내용:
1. 오행 분포 표 (목/화/토/금/수 개수와 의미)
   - 강한 오행: 과잉 시 특성, 장점
   - 약한 오행: 부족 시 특성, 보완법
2. 십성 분포 분석 (비겁/식상/재성/관성/인성)
   - 가장 강한 십성 중심 해석
   - 없는 십성이 있다면 그 영향
3. 성격 + 심리 패턴
   - 대인관계 패턴
   - 스트레스 받는 상황

### 십성 해석 기준
- 비견/겁재: 친구, 경쟁, 독립심
- 식신/상관: 재능, 표현력
- 편재/정재: 재물, 사업
- 편관/정관: 직장, 명예
- 편인/정인: 학업, 도움

### 십성 좋은 조합
- 식신+정재: 재능으로 돈 벎
- 정관+정인: 명예+학업
- 상관+편재: 기술로 큰돈

### 십성 나쁜 조합
- 상관+정관: 직장 갈등
- 비견+정재: 재물 뺏김
- 편인+식신: 식복 빼앗김

⚠️ 자세하고 풍부하게 작성하세요. 최소 2000자 이상.
마크다운 형식으로 작성하세요. 섹션 끝에 --- 구분선 넣기.`,

        sinsal: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 신살 + 격국 분석

작성할 내용:
1. 신살 분석 (계산 결과에 있는 것만!)
   - 길신: 어떤 복이 있는지 구체적으로
   - 양면신: 좋게 쓰는 방법 / 주의점
   - 흉신: 문제점 + 해결책

2. 격국 분석 (계산 결과에 있다면)
   - 격국 이름과 의미
   - 격국에 맞는 직업/진로

3. 용신/기신 설명
   - 용신 활용법
   - 기신 주의점

4. 대운 흐름
   - 현재 대운 상세 분석
   - 향후 대운 미리보기 (표)
   - 대운 전환 시기 주의점

### 주요 신살 해석 기준
- 천을귀인: 위기 때 도움받음
- 역마살: 움직이면 운 트임 / 정착 어려움
- 도화살: 매력적 / 이성 문제 주의
- 양인살: 추진력 강함 / 과격해질 수 있음
- 귀문관살: 생각 많음 / 불안감

⚠️ 자세하고 풍부하게 작성하세요. 최소 2000자 이상.
마크다운 형식으로 작성하세요. 섹션 끝에 --- 구분선 넣기.`,

        yearly: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 올해 운세 (월별 상세)

작성할 내용:
1. 올해 세운 개요 (2025년 乙巳 or 2026년 丙午)
   - 세운과 원국 관계
   - 올해 핵심 키워드 3-4개
2. 분기별 운세 표 (1~3월, 4~6월, 7~9월, 10~12월)
3. 월별 상세 운세 (12개월 전부!)
   - 각 월의 월운 천간지지
   - 좋은 달: 뭘 하면 좋은지 구체적으로
   - 안 좋은 달: 뭘 피해야 하는지 구체적으로
   - 건강, 재물, 관계 포인트

### 월별 운세 작성 공식
[언제] + [뭐가 있는지/없는지] + [왜: 월운과 원국 관계] + [어떻게 활용/주의]

⚠️ 12개월 모두 빠짐없이 자세하게 작성하세요! 최소 3000자 이상.
마크다운 형식으로 작성하세요. 섹션 끝에 --- 구분선 넣기.`,

        category: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 분야별 운세 (연애/직업/재물/건강)

작성할 내용:
1. 연애/결혼운
   - 현재 대운의 연애 기운
   - 재성(남)/관성(여) 분석
   - 일지(배우자궁) 분석
   - 좋은 인연 만나는 시기
   - 피해야 할 이성 유형

2. 직업/진로운
   - 격국으로 적합 직업군 (3-5개)
   - 십성으로 직업 스타일
   - 이직/전직 좋은 시기
   - 조심해야 할 시기

3. 재물운
   - 재성 유무 및 강약
   - 재물 패턴 (벌이/지출/저축)
   - 투자/사업 적합 여부
   - 재물 들어오는 시기
   - 주의할 시기

4. 건강운
   - 오행 기반 약한 장기 (표)
   - 조심해야 할 시기
   - 건강 관리 방법 구체적으로

⚠️ 각 분야별로 자세하게 작성하세요. 최소 2500자 이상.
마크다운 형식으로 작성하세요. 섹션 끝에 --- 구분선 넣기.`,

        inyeon: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 인연상 + 배우자상 (프리미엄)

⚠️ 인연상 계산 결과를 **그대로** 사용하세요!

작성할 내용:
1. 인연수 분석
   - 총점과 등급 (계산 결과 그대로)
   - 각 항목별 점수 표
   - 점수 의미 설명

2. 배우자 외모 (일지 기반)
   - 키, 체형, 인상
   - 첫인상 느낌
   - 구체적 이미지

3. 배우자 성격 (일지 기반)
   - 성격 키워드 3-5개
   - 장점/단점
   - 궁합 포인트

4. 만남 시기와 장소
   - 계산 결과의 만남 시기 그대로
   - 어디서 만날지 추천
   - 인연 활성화 방법

5. 인연 팁
   - 귀인 띠 (도움 되는 사람)
   - 원진 띠 (피해야 할 사람)
   - 인연 높이는 구체적 방법

### 일지 기반 배우자 성격
- 子(쥐): 영리, 사교적
- 丑(소): 성실, 꾸준
- 寅(호랑이): 활동적, 리더십
- 卯(토끼): 온화, 감성적
- 辰(용): 야심, 카리스마
- 巳(뱀): 지혜, 직관적
- 午(말): 열정적, 활발
- 未(양): 온순, 배려심
- 申(원숭이): 영리, 재치
- 酉(닭): 꼼꼼, 완벽주의
- 戌(개): 충직, 정의감
- 亥(돼지): 순수, 낙천적

⚠️ 자세하고 풍부하게 작성하세요. 최소 2000자 이상.
마크다운 형식으로 작성하세요. 섹션 끝에 --- 구분선 넣기.`,

        ending: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 맞춤 질문 답변 + 마무리

작성할 내용:
1. 맞춤 질문 답변 (순서대로, 하나도 빠짐없이!)
   - 😭 가장 큰 고민 → 먼저, 상세하게
   - 🔁 반복되는 패턴 → 왜 그런지 설명
   - 선택 질문들 → 각각 답변
   - ✨ 프리미엄 맞춤질문 → 마지막에 가장 상세히

2. 행운 포인트
   - 행운의 색상 (주/보조)
   - 행운의 방향
   - 행운의 숫자
   - 행운의 시간대

3. 마무리 메시지
   - <!-- 희망 --> 태그로 희망 메시지
   - <!-- 마무리멘트 --> 태그로 따뜻한 응원
   - AI 같지 않게 자연스럽게

### 질문 답변 공식
[질문 요약] + [답변] + [사주 근거] + [구체적 조언]

⚠️ 모든 질문에 빠짐없이 답변하세요. 최소 2000자 이상.
마크다운 형식으로 작성하세요.`
    };

    return sectionPrompts[sectionId] || sectionPrompts.intro;
}

// ========== 섹션 사용자 프롬프트 빌드 ==========
function buildSectionUserPrompt(customer, sectionId, previousContent) {
    const {
        name, birthYear, birthMonth, birthDay, birthHour, birthMinute,
        gender, package: packageType, sajuResult,
        inyeonCalcResult, questions, customQuestion,
        mainConcern, repeatPattern, loveStatus, jobStatus
    } = customer;

    let prompt = `## 고객 정보
- 이름: ${name}
- 생년월일: ${birthYear}년 ${birthMonth}월 ${birthDay}일
- 태어난 시간: ${birthHour || '모름'}시 ${birthMinute || ''}분
- 성별: ${gender === 'M' || gender === '남' ? '남성' : '여성'}
- 패키지: ${packageType === 'premium' ? '프리미엄' : packageType === 'standard' ? '스탠다드' : '라이트'}

---

## 🔴 사주 계산 결과 (이 값을 그대로 사용!)
${sajuResult || '(사주 계산 결과 없음)'}

---`;

    // 인연상 섹션이면 인연상 계산 결과 추가
    if (sectionId === 'inyeon' && inyeonCalcResult) {
        prompt += `

## 🔴 인연상 계산 결과 (이 값을 그대로 사용!)
${inyeonCalcResult}

---`;
    }

    // 마지막 섹션이면 질문 정보 추가
    if (sectionId === 'ending') {
        prompt += `

## 고객 질문/고민 (모두 답변 필수!)

### 😭 가장 큰 고민
${mainConcern || '없음'}

### 🔁 반복되는 패턴
${repeatPattern || '없음'}

### 선택 질문
${questions || '없음'}

### 연애 상태
${loveStatus || '없음'}

### 직업 상태
${jobStatus || '없음'}

### ✨ 프리미엄 맞춤질문
${customQuestion || '없음'}

---`;
    }

    // 이전 섹션 요약 (컨텍스트 유지)
    if (previousContent) {
        const summary = extractKeyInfo(previousContent);
        if (summary) {
            prompt += `

## 이전 섹션 핵심 정보 (일관성 유지용)
${summary}

---`;
        }
    }

    const sectionInfo = SECTIONS.find(s => s.id === sectionId);
    prompt += `

위 정보를 바탕으로 **${sectionInfo?.name || sectionId}** 섹션을 마크다운 형식으로 작성해주세요.

⚠️ 중요:
- 계산 결과는 절대 변경하지 말고 그대로 사용하세요!
- 자세하고 풍부하게 작성하세요!
- 직접적인 표현을 사용하세요!`;

    return prompt;
}

// 이전 내용에서 핵심 정보 추출
function extractKeyInfo(content) {
    const info = [];

    // 일간 추출
    const ilganMatch = content.match(/일간[^:：]*[:：]\s*([^\n]+)/);
    if (ilganMatch) info.push(`일간: ${ilganMatch[1].trim()}`);

    // 격국 추출
    const gyeokgukMatch = content.match(/격국[^:：]*[:：]\s*([^\n]+)/);
    if (gyeokgukMatch) info.push(`격국: ${gyeokgukMatch[1].trim()}`);

    // 용신 추출
    const yongsinMatch = content.match(/용신[^:：]*[:：]\s*([^\n]+)/);
    if (yongsinMatch) info.push(`용신: ${yongsinMatch[1].trim()}`);

    return info.join('\n');
}

// ========== 전체 사용자 프롬프트 빌드 (기존 호환) ==========
function buildFullUserPrompt(customer) {
    const {
        name, birthYear, birthMonth, birthDay, birthHour, birthMinute,
        gender, package: packageType, sajuResult, promptResult,
        inyeonCalcResult, questions, customQuestion,
        mainConcern, repeatPattern, loveStatus, jobStatus
    } = customer;

    return `## 고객 정보
- 이름: ${name}
- 생년월일: ${birthYear}년 ${birthMonth}월 ${birthDay}일
- 태어난 시간: ${birthHour || '모름'}시 ${birthMinute || ''}분
- 성별: ${gender === 'M' || gender === '남' ? '남성' : '여성'}
- 패키지: ${packageType === 'premium' ? '프리미엄' : packageType === 'standard' ? '스탠다드' : '라이트'}

---

## 🔴 사주 계산 결과 (이 값을 그대로 사용!)
${sajuResult || '(사주 계산 결과 없음)'}

---

## 🔴 인연상 계산 결과 (이 값을 그대로 사용!)
${inyeonCalcResult || '(인연상 계산 결과 없음 - 프리미엄 아님)'}

---

## 프롬프트 분석 결과
${promptResult || '(프롬프트 결과 없음)'}

---

## 고객 질문/고민 (모두 답변 필수!)

### 😭 가장 큰 고민
${mainConcern || '없음'}

### 🔁 반복되는 패턴
${repeatPattern || '없음'}

### 선택 질문
${questions || '없음'}

### 연애 상태
${loveStatus || '없음'}

### 직업 상태
${jobStatus || '없음'}

### ✨ 프리미엄 맞춤질문
${customQuestion || '없음'}

---

위 정보를 바탕으로 프리미엄 사주 보고서를 마크다운 형식으로 작성해주세요.
⚠️ 계산 결과는 절대 변경하지 말고 그대로 사용하세요!`;
}

// ========== 전체 시스템 프롬프트 (기존 호환) ==========
const FULL_SYSTEM_PROMPT = `당신은 전문 사주 명리학 상담사입니다. 프리미엄 사주 보고서를 작성합니다.

## 🔴 절대 규칙

### 1. 계산 금지!
- 대운, 세운, 인연수, 배우자상, 신살 등 **모든 계산은 이미 완료되어 제공됩니다**
- 절대로 직접 계산하지 마세요
- 제공된 "사주 계산 결과"와 "인연상 계산 결과"를 **그대로** 사용하세요

### 2. 직접적인 표현 필수
❌ 나쁜 예시 (두리뭉실):
- "건강에 주의가 필요한 시기예요."
- "이 시기는 조심하면 좋겠어요."

✅ 좋은 예시 (직접적):
- "8월에 심장이랑 혈압 조심하세요. 화(火) 기운이 과해져서 그래요. 야근 줄이고, 매운 음식 피하세요."
- "6월에 돈 나갈 일 생겨요. 비겁운이라 그래요. 보증 서지 마세요."

### 3. 해석 공식
[언제] + [뭐가 문제인지 직접] + [왜: 사주 근거] + [어떻게 피하는지 구체적으로]

### 4. 4가지 필수 요소
1. **직접적 단어** - 돌려 말하지 않기
2. **자연스러운 문체** - AI 같지 않게, 대화하듯이
3. **사주 근거** - 왜 그런지 명확히
4. **실용적 해결법** - 구체적으로 뭘 해야 하는지

### 5. 금지 사항
- "도도성" 이름 사용 금지 (고객 이름만!)
- 2025=乙巳, 2026=丙午 혼동 금지
- 명리 용어는 괄호 설명 필수 (예: 비겁(比劫))

### 6. 맞춤 질문 답변 순서
1. 가장 큰 고민
2. 반복되는 패턴
3. 선택 질문들
4. 프리미엄 맞춤질문

## 보고서 구조 (마크다운)
# [고객이름]님의 사주 보고서

## 1. 사주 개요
## 2. 오행 분석
## 3. 십성 분석
## 4. 신살 분석
## 5. 격국과 용신
## 6. 대운 흐름
## 7. 올해의 운세 (월별)
## 8. 연애/결혼운
## 9. 직업/진로운
## 10. 재물운
## 11. 건강운
## 12. 인연상/배우자상 (프리미엄)
## 13. 맞춤 질문 답변
## 14. 조언 및 행운 포인트

## 🎨 결과생성기용 특수 태그 (필수!)
\`\`\`
<!-- 소름 -->고객이 소름 돋을 만큼 정확한 내용<!-- /소름 -->
<!-- 왜그런지 -->사주 해석/근거 설명<!-- /왜그런지 -->
<!-- 주의 -->주의해야 할 점<!-- /주의 -->
<!-- 조언 -->실용적인 조언<!-- /조언 -->
<!-- 희망 -->희망적인 마무리<!-- /희망 -->
<!-- 강점 -->강점/장점 강조<!-- /강점 -->
<!-- 공감 -->고객이 공감할 내용<!-- /공감 -->
<!-- 올해핵심 -->올해 핵심 키워드<!-- /올해핵심 -->
<!-- 마무리멘트 -->마지막 응원 메시지<!-- /마무리멘트 -->
\`\`\`
`;

// ========== 검토용 시스템 프롬프트 ==========
const REVIEW_SYSTEM_PROMPT = `당신은 사주 보고서 검토 전문가입니다.

## 검토 항목

### 1. 계산 일치 확인
- 보고서의 대운, 세운, 신살이 원본 계산 데이터와 일치하는가?
- 인연수/배우자상 점수가 원본과 일치하는가?

### 2. 작성 규칙 준수
- 직접적인 표현을 사용했는가?
- 사주 근거를 포함했는가?
- 구체적 해결법을 제시했는가?

### 3. 누락 확인
- 맞춤 질문을 모두 답변했는가?
- 필수 섹션이 모두 있는가?

## 출력 형식
### 검토 결과

#### ✅ 정상
- (정상인 항목들)

#### ⚠️ 수정 필요
- (수정이 필요한 항목들)

#### 🔴 계산 오류
- (원본 데이터와 다른 부분)
`;
