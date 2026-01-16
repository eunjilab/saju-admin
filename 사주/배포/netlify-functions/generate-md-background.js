/**
 * MD 백그라운드 생성 Netlify Function
 *
 * - 7개 섹션 순차 생성
 * - 자동 검증 및 수정
 * - Google Sheets + Supabase 자동 저장
 *
 * 사용법:
 * POST /generate-md-background
 * Body: { orderCode, customer }
 */

const Anthropic = require('@anthropic-ai/sdk');
const { verifyAndFix } = require('./utils/verify-md');

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

// Netlify Background Function 설정
exports.config = {
    type: 'background'  // 백그라운드 실행 (최대 15분)
};

exports.handler = async (event, context) => {
    console.log('=== MD Background Generation Started ===');

    try {
        const body = JSON.parse(event.body);
        const { orderCode, customer, prompt } = body;

        if (!orderCode || !customer) {
            console.error('Missing required fields');
            return;
        }

        // API 키 확인
        if (!process.env.ANTHROPIC_API_KEY) {
            console.error('API key not configured');
            await updateStatus(orderCode, 'error', 'API 키가 설정되지 않았습니다.');
            return;
        }

        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });

        // 상태 업데이트: 시작
        await updateStatus(orderCode, 'generating', '생성 시작...');

        // 1. 섹션별 생성
        let fullMD = '';
        const requiredSections = getRequiredSections(customer.package);

        for (let i = 0; i < requiredSections.length; i++) {
            const section = requiredSections[i];
            console.log(`Generating section ${i + 1}/${requiredSections.length}: ${section.name}`);

            await updateStatus(orderCode, 'generating', `섹션 ${i + 1}/${requiredSections.length}: ${section.name} 생성 중...`);

            try {
                const sectionContent = await generateSection(anthropic, customer, section.id, fullMD, prompt);
                fullMD += sectionContent + '\n\n';
            } catch (error) {
                console.error(`Section ${section.id} error:`, error);
                await updateStatus(orderCode, 'error', `섹션 ${section.name} 생성 실패: ${error.message}`);
                return;
            }
        }

        // 2. META 블록 추가 (맨 앞에)
        const metaBlock = generateMetaBlock(customer, requiredSections.length);
        fullMD = metaBlock + '\n\n' + fullMD;

        // 3. 검증 및 자동 수정
        await updateStatus(orderCode, 'verifying', '검증 중...');

        const promptText = prompt || customer.sajuResult || '';
        const verifyResult = verifyAndFix(promptText, fullMD);

        if (!verifyResult.isValid) {
            console.log(`Found ${verifyResult.errors.length} errors, auto-fixing...`);
            fullMD = verifyResult.fixedMD;
        }

        // 4. 저장
        await updateStatus(orderCode, 'saving', '저장 중...');

        // Supabase 저장
        await saveToSupabase(orderCode, fullMD, verifyResult);

        // Google Sheets 저장
        await saveToGoogleSheets(orderCode, fullMD);

        // 5. 완료
        await updateStatus(orderCode, 'completed', '완료', {
            mdLength: fullMD.length,
            verifyResult: verifyResult.summary,
            generatedAt: new Date().toISOString()
        });

        console.log('=== MD Background Generation Completed ===');

    } catch (error) {
        console.error('Background generation error:', error);
        try {
            const body = JSON.parse(event.body);
            await updateStatus(body.orderCode, 'error', error.message);
        } catch (e) {
            console.error('Failed to update error status:', e);
        }
    }
};

// ========== 섹션 생성 ==========
async function generateSection(anthropic, customer, sectionId, previousContent, originalPrompt) {
    const systemPrompt = getSectionPrompt(sectionId);
    const userPrompt = buildSectionUserPrompt(customer, sectionId, previousContent, originalPrompt);

    const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
    });

    return message.content[0].text;
}

// ========== META 블록 생성 ==========
function generateMetaBlock(customer, totalPages) {
    const { name, birthYear, birthMonth, birthDay, birthHour, birthMinute, gender, package: pkg } = customer;

    return `<!-- META
이름: ${name}
생년월일: ${birthYear}년 ${birthMonth}월 ${birthDay}일
시간: ${birthHour || '모름'}시 ${birthMinute || ''}분
성별: ${gender === 'M' || gender === '남' ? '남성' : '여성'}
패키지: ${pkg === 'premium' ? '프리미엄' : pkg === 'standard' ? '스탠다드' : '라이트'}
총 페이지: ${pkg === 'premium' ? '44' : pkg === 'standard' ? '25' : '20'}
생성일시: ${new Date().toISOString()}
-->`;
}

// ========== 상태 업데이트 ==========
async function updateStatus(orderCode, status, message, extra = {}) {
    console.log(`[${orderCode}] Status: ${status} - ${message}`);

    // Supabase에 상태 저장
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        try {
            const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/orders?order_code=eq.${orderCode}`, {
                method: 'PATCH',
                headers: {
                    'apikey': process.env.SUPABASE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    md_status: status,
                    md_message: message,
                    md_updated_at: new Date().toISOString(),
                    ...extra
                })
            });

            if (!response.ok) {
                console.error('Supabase status update failed:', await response.text());
            }
        } catch (error) {
            console.error('Supabase status update error:', error);
        }
    }
}

// ========== Supabase 저장 ==========
async function saveToSupabase(orderCode, mdContent, verifyResult) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        console.log('Supabase not configured, skipping...');
        return;
    }

    try {
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/orders?order_code=eq.${orderCode}`, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                md_result: mdContent,
                md_verify_result: JSON.stringify(verifyResult.summary),
                md_generated_at: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        console.log('Supabase save completed');
    } catch (error) {
        console.error('Supabase save error:', error);
    }
}

// ========== Google Sheets 저장 ==========
async function saveToGoogleSheets(orderCode, mdContent) {
    // Google Apps Script 웹앱 URL이 설정되어 있으면 호출
    if (!process.env.GOOGLE_APPS_SCRIPT_URL) {
        console.log('Google Apps Script URL not configured, skipping...');
        return;
    }

    try {
        const response = await fetch(process.env.GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'updateMdResult',
                orderCode: orderCode,
                mdResult: mdContent
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        console.log('Google Sheets save completed');
    } catch (error) {
        console.error('Google Sheets save error:', error);
    }
}

// ========== 유틸리티 함수들 ==========
function getRequiredSections(packageType) {
    return SECTIONS.filter(section => {
        if (section.premiumOnly && packageType !== 'premium') {
            return false;
        }
        return true;
    });
}

// 섹션별 프롬프트 (기존 generate-md.js에서 가져옴)
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
2. 사주 명식 표 (연주/월주/일주/시주)
3. 일간 분석 (자연물 비유, 핵심 성향)

⚠️ 자세하고 풍부하게 작성하세요. 최소 1500자 이상.`,

        oheng: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 오행 + 십성 분석

작성할 내용:
1. 오행 분포 표와 의미
2. 십성 분포 분석
3. 성격 + 심리 패턴

⚠️ 자세하고 풍부하게 작성하세요. 최소 2000자 이상.`,

        sinsal: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 신살 + 격국 분석

작성할 내용:
1. 신살 분석 (계산 결과에 있는 것만!)
2. 격국 분석
3. 용신/기신 설명
4. 대운 흐름

⚠️ 자세하고 풍부하게 작성하세요. 최소 2000자 이상.`,

        yearly: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 올해 운세 (월별 상세)

작성할 내용:
1. 올해 세운 개요
2. 분기별 운세 표
3. 월별 상세 운세 (12개월 전부!)

⚠️ 12개월 모두 빠짐없이 작성하세요! 최소 3000자 이상.`,

        category: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 분야별 운세

작성할 내용:
1. 연애/결혼운
2. 직업/진로운
3. 재물운
4. 건강운

⚠️ 각 분야별로 자세하게 작성하세요. 최소 2500자 이상.`,

        inyeon: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 인연상 + 배우자상 (프리미엄)

⚠️ 인연상 계산 결과를 **그대로** 사용하세요!

작성할 내용:
1. 인연수 분석
2. 배우자 외모/성격
3. 만남 시기와 장소
4. 인연 팁

⚠️ 자세하고 풍부하게 작성하세요. 최소 2000자 이상.`,

        ending: `당신은 전문 사주 명리학 상담사입니다.
${commonRules}

## 이번 섹션: 맞춤 질문 답변 + 마무리

작성할 내용:
1. 맞춤 질문 답변 (모두 빠짐없이!)
2. 행운 포인트
3. 마무리 메시지 (<!-- 마무리멘트 --> 태그 사용)

⚠️ 모든 질문에 빠짐없이 답변하세요. 최소 2000자 이상.`
    };

    return sectionPrompts[sectionId] || sectionPrompts.intro;
}

// 섹션 사용자 프롬프트 빌드
function buildSectionUserPrompt(customer, sectionId, previousContent, originalPrompt) {
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
${sajuResult || originalPrompt || '(사주 계산 결과 없음)'}

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

    const sectionInfo = SECTIONS.find(s => s.id === sectionId);
    prompt += `

위 정보를 바탕으로 **${sectionInfo?.name || sectionId}** 섹션을 마크다운 형식으로 작성해주세요.

⚠️ 계산 결과는 절대 변경하지 말고 그대로 사용하세요!`;

    return prompt;
}
