const Anthropic = require('@anthropic-ai/sdk');

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
        const { customer, action, previousMd, modificationRequest } = JSON.parse(event.body);

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

        let systemPrompt = SYSTEM_PROMPT;
        let userPrompt;

        if (action === 'modify' && previousMd && modificationRequest) {
            // 수정 요청
            userPrompt = `다음은 기존에 생성된 사주 보고서입니다:

${previousMd}

사용자의 수정 요청:
${modificationRequest}

위 요청에 따라 보고서를 수정해주세요. 전체 마크다운 형식을 유지하면서 수정된 버전을 출력해주세요.
⚠️ 계산 결과(대운, 인연상, 신살 등)는 절대 변경하지 마세요. 이미 계산된 값을 그대로 사용하세요.`;
        } else if (action === 'review') {
            // 검토 요청
            systemPrompt = REVIEW_SYSTEM_PROMPT;
            userPrompt = `다음 사주 보고서를 검토해주세요:

${previousMd}

## 원본 계산 데이터 (검증용)
${customer.sajuResult || '없음'}

${customer.inyeonCalcResult || ''}

위 보고서가 원본 계산 데이터와 일치하는지, 그리고 작성 규칙을 잘 따랐는지 검토해주세요.`;
        } else {
            // 새로 생성
            userPrompt = buildPrompt(customer);
        }

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 12000,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userPrompt
                }
            ]
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

// ========== 시스템 프롬프트 ==========
const SYSTEM_PROMPT = `당신은 전문 사주 명리학 상담사입니다. 프리미엄 사주 보고서를 작성합니다.

## 🔴 절대 규칙

### 1. 계산 금지!
- 대운, 세운, 인연수, 배우자상, 신살 등 **모든 계산은 이미 완료되어 제공됩니다**
- 절대로 직접 계산하지 마세요
- 제공된 "사주 계산 결과"와 "인연상 계산 결과"를 **그대로** 사용하세요
- 계산 결과를 변경하거나 다르게 해석하지 마세요

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
- "~님에게 드리는 마무리 메시지" 같은 문구 금지

### 6. 맞춤 질문 답변 순서
1. 가장 큰 고민
2. 반복되는 패턴
3. 선택 질문들
4. 프리미엄 맞춤질문

⚠️ 순서대로, 하나도 빠짐없이 답변!

## 보고서 구조 (마크다운)
# [고객이름]님의 사주 보고서

## 1. 사주 개요
## 2. 올해의 운세 (월별)
## 3. 연애/결혼운
## 4. 직업/재물운
## 5. 건강운
## 6. 인연상/배우자상 (프리미엄)
## 7. 맞춤 질문 답변
## 8. 조언 및 행운 포인트

## 신살 해석 규칙 (🔴 중요!)
- 신살 목록은 **사주 계산 결과에 있는 것만** 해석하세요
- 계산 결과에 없는 신살을 임의로 추가하지 마세요
- 신살 해석 순서: 길신 → 양면신 → 흉신
- 각 신살마다: [신살명] + [어떤 복/주의점] + [실생활 적용법]

## 대운/세운 해석 규칙 (🔴 중요!)
- 현재 대운, 세운은 **계산 결과에 명시된 것만** 사용
- 대운 시작 나이, 천간/지지 모두 계산 결과 그대로
- 임의로 대운을 계산하거나 변경 금지

## 인연수/배우자상 규칙 (프리미엄)
- 인연수 점수, 만남 시기는 **인연상 계산 결과 그대로** 사용
- 점수 계산 공식을 직접 적용하지 마세요 (이미 계산됨)
- 외모/성격 유형도 계산 결과에서 가져오세요
`;

// ========== 검토용 시스템 프롬프트 ==========
const REVIEW_SYSTEM_PROMPT = `당신은 사주 보고서 검토 전문가입니다.

## 검토 항목

### 1. 계산 일치 확인
- 보고서의 대운, 세운, 신살이 원본 계산 데이터와 일치하는가?
- 인연수/배우자상 점수가 원본과 일치하는가?
- 만남 시기가 원본과 일치하는가?

### 2. 작성 규칙 준수
- 직접적인 표현을 사용했는가?
- 사주 근거를 포함했는가?
- 구체적 해결법을 제시했는가?
- 두리뭉실한 표현이 없는가?

### 3. 누락 확인
- 맞춤 질문을 모두 답변했는가?
- 필수 섹션이 모두 있는가?

## 출력 형식
### 검토 결과

#### ✅ 정상
- (정상인 항목들)

#### ⚠️ 수정 필요
- (수정이 필요한 항목들과 이유)

#### 🔴 계산 오류
- (원본 데이터와 다른 부분)
`;

// ========== 프롬프트 빌더 ==========
function buildPrompt(customer) {
    const {
        name, birthYear, birthMonth, birthDay, birthHour, birthMinute,
        gender, package: packageType, sajuResult, promptResult,
        inyeonCalcResult, inyeonHTML,
        questions, customQuestion, mainConcern, repeatPattern, loveStatus, jobStatus
    } = customer;

    return `## 고객 정보
- 이름: ${name}
- 생년월일: ${birthYear}년 ${birthMonth}월 ${birthDay}일
- 태어난 시간: ${birthHour || '모름'}시 ${birthMinute || ''}분
- 성별: ${gender === 'M' || gender === '남' ? '남성' : '여성'}
- 패키지: ${packageType === 'premium' ? '프리미엄' : packageType === 'standard' ? '스탠다드' : '라이트'}

---

## 🔴 사주 계산 결과 (계산기에서 계산 완료 - 이 값을 그대로 사용!)
${sajuResult || '(사주 계산 결과 없음)'}

---

## 🔴 인연상 계산 결과 (계산기에서 계산 완료 - 이 값을 그대로 사용!)
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

⚠️ 다시 한번 강조:
- 대운, 인연수, 배우자상 등은 **위에 제공된 계산 결과를 그대로** 사용하세요
- 절대 직접 계산하지 마세요!`;
}
