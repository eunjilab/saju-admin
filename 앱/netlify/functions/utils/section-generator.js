/**
 * 섹션 생성 유틸리티
 * - 섹션별 API 호출
 * - 자동 이어쓰기
 * - 완료 확인
 */

const { SECTIONS, SECTION_PROMPTS, CONTINUE_PROMPT } = require('../prompts/section-prompts');
const {
    SIPSUNG_SUMMARY,
    SINSAL_SUMMARY,
    OHENG_HEALTH,
    INTERPRETATION_FORMULA,
    SPOUSE_GUIDE
} = require('../prompts/guide-summaries');

// 섹션 완료 확인
function isSectionComplete(content, sectionId) {
    // 마지막 섹션은 마무리멘트 태그로 확인
    if (sectionId === 'ending') {
        return content.includes('<!-- /마무리멘트 -->');
    }

    // 다른 섹션은 구분선으로 확인
    // 마지막 50자 안에 ---가 있으면 완료
    const lastPart = content.slice(-100);
    return lastPart.includes('---') || lastPart.includes('<!-- 섹션완료 -->');
}

// 가이드 요약본 합치기
function getGuideSummaries(sectionId) {
    const summaries = [INTERPRETATION_FORMULA]; // 항상 포함

    switch(sectionId) {
        case 'oheng':
            summaries.push(SIPSUNG_SUMMARY, OHENG_HEALTH);
            break;
        case 'sinsal':
            summaries.push(SINSAL_SUMMARY);
            break;
        case 'inyeon':
            summaries.push(SPOUSE_GUIDE);
            break;
        case 'category':
            summaries.push(SIPSUNG_SUMMARY, OHENG_HEALTH);
            break;
    }

    return summaries.join('\n\n');
}

// 사용자 프롬프트 빌드
function buildUserPrompt(customer, sectionId, previousSections = '') {
    const {
        name, birthYear, birthMonth, birthDay, birthHour, birthMinute,
        gender, package: packageType, sajuResult, promptResult,
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
    if (previousSections) {
        prompt += `

## 이전 섹션 요약 (일관성 유지용)
${previousSections}

---`;
    }

    // 가이드 요약본 추가
    const guides = getGuideSummaries(sectionId);
    if (guides) {
        prompt += `

## 해석 가이드 참조
${guides}

---`;
    }

    prompt += `

위 정보를 바탕으로 **${SECTIONS.find(s => s.id === sectionId)?.name || sectionId}** 섹션을 작성해주세요.
⚠️ 계산 결과는 절대 변경하지 말고 그대로 사용하세요!`;

    return prompt;
}

// 이전 섹션 요약 생성
function summarizePreviousSections(sectionsContent) {
    if (!sectionsContent || sectionsContent.length === 0) return '';

    // 각 섹션에서 핵심 정보만 추출
    const summary = [];

    // 일간 정보 추출
    const ilganMatch = sectionsContent.match(/일간[^:]*:\s*([^\n]+)/);
    if (ilganMatch) summary.push(`일간: ${ilganMatch[1]}`);

    // 오행 정보 추출
    const ohengMatch = sectionsContent.match(/강한 오행[^:]*:\s*([^\n]+)/i);
    if (ohengMatch) summary.push(`강한 오행: ${ohengMatch[1]}`);

    // 격국 정보 추출
    const gyeokgukMatch = sectionsContent.match(/격국[^:]*:\s*([^\n]+)/);
    if (gyeokgukMatch) summary.push(`격국: ${gyeokgukMatch[1]}`);

    // 용신 정보 추출
    const yongsinMatch = sectionsContent.match(/용신[^:]*:\s*([^\n]+)/);
    if (yongsinMatch) summary.push(`용신: ${yongsinMatch[1]}`);

    return summary.join('\n');
}

// 단일 섹션 생성 (이어쓰기 포함)
async function generateSection(anthropic, sectionId, customer, previousSections = '', maxRetries = 3) {
    const systemPrompt = SECTION_PROMPTS[sectionId];
    if (!systemPrompt) {
        throw new Error(`Unknown section: ${sectionId}`);
    }

    const userPrompt = buildUserPrompt(customer, sectionId, summarizePreviousSections(previousSections));

    let fullContent = '';
    let retries = 0;

    while (retries < maxRetries) {
        const messages = [
            { role: 'user', content: userPrompt }
        ];

        // 이어쓰기인 경우
        if (fullContent) {
            messages.push({ role: 'assistant', content: fullContent });
            messages.push({ role: 'user', content: CONTINUE_PROMPT });
        }

        try {
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 6000, // 섹션당 6000 토큰
                system: systemPrompt,
                messages: messages
            });

            const newContent = response.content[0].text;
            fullContent += newContent;

            // 완료 확인
            if (isSectionComplete(fullContent, sectionId)) {
                return {
                    success: true,
                    content: fullContent,
                    retries: retries
                };
            }

            // stop_reason이 end_turn이면 완료로 간주
            if (response.stop_reason === 'end_turn') {
                return {
                    success: true,
                    content: fullContent,
                    retries: retries
                };
            }

            retries++;

        } catch (error) {
            console.error(`Section ${sectionId} generation error:`, error);
            throw error;
        }
    }

    // 최대 시도 후에도 완료 안 됐으면 그냥 반환
    return {
        success: true,
        content: fullContent,
        retries: maxRetries,
        incomplete: true
    };
}

// 프리미엄 여부에 따른 섹션 필터링
function getRequiredSections(packageType) {
    return SECTIONS.filter(section => {
        if (section.premiumOnly && packageType !== 'premium') {
            return false;
        }
        return true;
    });
}

module.exports = {
    generateSection,
    getRequiredSections,
    isSectionComplete,
    buildUserPrompt,
    summarizePreviousSections,
    SECTIONS
};
