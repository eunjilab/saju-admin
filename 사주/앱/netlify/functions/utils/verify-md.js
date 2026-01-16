/**
 * MD 검증 및 자동 수정 모듈
 * - 프롬프트의 계산값과 MD 파일의 값을 비교
 * - 불일치 시 자동 수정
 */

/**
 * 프롬프트에서 계산값 추출
 */
function extractFromPrompt(prompt) {
    const data = {
        // 기본 정보
        name: null,
        birthYear: null,
        birthMonth: null,
        birthDay: null,
        birthHour: null,
        gender: null,
        package: null,

        // 사주 팔자
        yearGan: null,    // 연간 (예: 乙)
        yearJi: null,     // 연지 (예: 亥)
        monthGan: null,   // 월간
        monthJi: null,    // 월지
        dayGan: null,     // 일간
        dayJi: null,      // 일지
        hourGan: null,    // 시간
        hourJi: null,     // 시지

        // 십성
        yearGanSipsung: null,
        yearJiSipsung: null,
        monthGanSipsung: null,
        monthJiSipsung: null,
        hourGanSipsung: null,
        hourJiSipsung: null,

        // 오행
        oheng: {
            목: 0,
            화: 0,
            토: 0,
            금: 0,
            수: 0
        },

        // 신살 목록
        sinsal: [],

        // 대운
        daeunStart: null,
        daeunList: [],

        // 용신/희신/기신/구신
        yongsin: null,
        heesin: null,
        gisin: null,
        gusin: null
    };

    // 기본 정보 추출
    const nameMatch = prompt.match(/이름[:\s]*([^\n,]+)/);
    if (nameMatch) data.name = nameMatch[1].trim();

    const birthMatch = prompt.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (birthMatch) {
        data.birthYear = birthMatch[1];
        data.birthMonth = birthMatch[2];
        data.birthDay = birthMatch[3];
    }

    const hourMatch = prompt.match(/(\d{1,2})시\s*(\d{1,2})?분?/);
    if (hourMatch) data.birthHour = hourMatch[1];

    const genderMatch = prompt.match(/성별[:\s]*(남|여|남성|여성)/);
    if (genderMatch) data.gender = genderMatch[1].includes('남') ? '남' : '여';

    const packageMatch = prompt.match(/패키지[:\s]*(프리미엄|스탠다드|라이트|premium|standard|light)/i);
    if (packageMatch) data.package = packageMatch[1];

    // 사주 팔자 추출 (다양한 형식 지원)
    // 형식1: 연주: 乙亥
    const yearJuMatch = prompt.match(/연주[:\s]*([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])/);
    if (yearJuMatch) {
        data.yearGan = yearJuMatch[1];
        data.yearJi = yearJuMatch[2];
    }

    const monthJuMatch = prompt.match(/월주[:\s]*([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])/);
    if (monthJuMatch) {
        data.monthGan = monthJuMatch[1];
        data.monthJi = monthJuMatch[2];
    }

    const dayJuMatch = prompt.match(/일주[:\s]*([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])/);
    if (dayJuMatch) {
        data.dayGan = dayJuMatch[1];
        data.dayJi = dayJuMatch[2];
    }

    const hourJuMatch = prompt.match(/시주[:\s]*([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])/);
    if (hourJuMatch) {
        data.hourGan = hourJuMatch[1];
        data.hourJi = hourJuMatch[2];
    }

    // 십성 추출
    const sipsungPatterns = [
        { key: 'yearGanSipsung', pattern: /연간\s*십성[:\s]*([^\n,]+)/ },
        { key: 'yearJiSipsung', pattern: /연지\s*십성[:\s]*([^\n,]+)/ },
        { key: 'monthGanSipsung', pattern: /월간\s*십성[:\s]*([^\n,]+)/ },
        { key: 'monthJiSipsung', pattern: /월지\s*십성[:\s]*([^\n,]+)/ },
        { key: 'hourGanSipsung', pattern: /시간\s*십성[:\s]*([^\n,]+)/ },
        { key: 'hourJiSipsung', pattern: /시지\s*십성[:\s]*([^\n,]+)/ },
    ];

    for (const { key, pattern } of sipsungPatterns) {
        const match = prompt.match(pattern);
        if (match) data[key] = match[1].trim();
    }

    // 오행 추출
    const ohengPatterns = [
        { key: '목', patterns: [/木[:\s]*(\d+)/, /목[:\s]*(\d+)/] },
        { key: '화', patterns: [/火[:\s]*(\d+)/, /화[:\s]*(\d+)/] },
        { key: '토', patterns: [/土[:\s]*(\d+)/, /토[:\s]*(\d+)/] },
        { key: '금', patterns: [/金[:\s]*(\d+)/, /금[:\s]*(\d+)/] },
        { key: '수', patterns: [/水[:\s]*(\d+)/, /수[:\s]*(\d+)/] },
    ];

    for (const { key, patterns } of ohengPatterns) {
        for (const pattern of patterns) {
            const match = prompt.match(pattern);
            if (match) {
                data.oheng[key] = parseInt(match[1]);
                break;
            }
        }
    }

    // 신살 추출 (목록 형태)
    const sinsalSection = prompt.match(/신살[^:]*[:：]\s*([^\n]+(?:\n(?![#\-\*\d]).*)*)/i);
    if (sinsalSection) {
        const sinsalText = sinsalSection[1];
        // 쉼표, 줄바꿈, 또는 •로 구분된 신살들
        const sinsalList = sinsalText.split(/[,，\n•·]/).map(s => s.trim()).filter(s => s);
        data.sinsal = sinsalList;
    }

    // 대운 추출
    const daeunStartMatch = prompt.match(/대운\s*시작[:\s]*(\d+)세/);
    if (daeunStartMatch) data.daeunStart = parseInt(daeunStartMatch[1]);

    const daeunListMatch = prompt.match(/대운\s*순서[:\s]*([^\n]+)/);
    if (daeunListMatch) {
        data.daeunList = daeunListMatch[1].split(/[,，→]/).map(d => d.trim()).filter(d => d);
    }

    // 용신 등 추출
    const yongsinMatch = prompt.match(/용신[:\s]*([^\n,]+)/);
    if (yongsinMatch) data.yongsin = yongsinMatch[1].trim();

    const heesinMatch = prompt.match(/희신[:\s]*([^\n,]+)/);
    if (heesinMatch) data.heesin = heesinMatch[1].trim();

    const gisinMatch = prompt.match(/기신[:\s]*([^\n,]+)/);
    if (gisinMatch) data.gisin = gisinMatch[1].trim();

    const gusinMatch = prompt.match(/구신[:\s]*([^\n,]+)/);
    if (gusinMatch) data.gusin = gusinMatch[1].trim();

    return data;
}

/**
 * MD에서 계산값 추출
 */
function extractFromMD(md) {
    const data = {
        name: null,
        saju: null, // 전체 사주 문자열
        oheng: {
            목: null,
            화: null,
            토: null,
            금: null,
            수: null
        },
        sinsal: [],
        daeunList: [],
        yongsin: null
    };

    // 이름 추출
    const nameMatch = md.match(/이름[:\s]*([^\n,]+)/);
    if (nameMatch) data.name = nameMatch[1].trim();

    // META 블록에서 추출
    const metaMatch = md.match(/<!--\s*META[\s\S]*?-->/);
    if (metaMatch) {
        const meta = metaMatch[0];
        const metaName = meta.match(/이름[:\s]*([^\n]+)/);
        if (metaName) data.name = metaName[1].trim();
    }

    // 사주 팔자 추출 (다양한 형식)
    const sajuPatterns = [
        /사주[:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/,
        /([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/
    ];

    for (const pattern of sajuPatterns) {
        const match = md.match(pattern);
        if (match) {
            data.saju = match[0].replace(/\s+/g, ' ').trim();
            break;
        }
    }

    // 오행 개수 추출
    const ohengPatterns = [
        { key: '목', patterns: [/木[이가]?\s*(\d+)\s*개/, /목[이가]?\s*(\d+)\s*개/, /木\s*[:：]?\s*(\d+)/] },
        { key: '화', patterns: [/火[이가]?\s*(\d+)\s*개/, /화[이가]?\s*(\d+)\s*개/, /火\s*[:：]?\s*(\d+)/] },
        { key: '토', patterns: [/土[이가]?\s*(\d+)\s*개/, /토[이가]?\s*(\d+)\s*개/, /土\s*[:：]?\s*(\d+)/] },
        { key: '금', patterns: [/金[이가]?\s*(\d+)\s*개/, /금[이가]?\s*(\d+)\s*개/, /金\s*[:：]?\s*(\d+)/] },
        { key: '수', patterns: [/水[이가]?\s*(\d+)\s*개/, /수[이가]?\s*(\d+)\s*개/, /水\s*[:：]?\s*(\d+)/] },
    ];

    for (const { key, patterns } of ohengPatterns) {
        for (const pattern of patterns) {
            const match = md.match(pattern);
            if (match) {
                data.oheng[key] = parseInt(match[1]);
                break;
            }
        }
    }

    // 신살 추출 (언급된 것들)
    const knownSinsal = [
        '천을귀인', '문창귀인', '천덕귀인', '월덕귀인', '건록', '금여록',
        '역마살', '도화살', '화개살', '양인살', '귀문관살', '백호살',
        '공망', '원진살', '겁살', '재살', '천살', '지살', '년살', '월살',
        '망신살', '장성살', '반안살', '천의성', '학당귀인', '홍염살'
    ];

    for (const sinsal of knownSinsal) {
        if (md.includes(sinsal)) {
            data.sinsal.push(sinsal);
        }
    }

    // 대운 추출
    const daeunMatch = md.match(/대운[^:]*[:：]?\s*([^\n]+)/);
    if (daeunMatch) {
        const daeunText = daeunMatch[1];
        const daeunItems = daeunText.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g);
        if (daeunItems) data.daeunList = daeunItems;
    }

    // 용신 추출
    const yongsinMatch = md.match(/용신[:\s]*([^\n,（(]+)/);
    if (yongsinMatch) data.yongsin = yongsinMatch[1].trim();

    return data;
}

/**
 * 검증 및 자동 수정
 */
function verifyAndFix(prompt, md) {
    const promptData = extractFromPrompt(prompt);
    const mdData = extractFromMD(md);

    const errors = [];
    let fixedMD = md;

    // 1. 오행 검증
    for (const key of ['목', '화', '토', '금', '수']) {
        const promptValue = promptData.oheng[key];
        const mdValue = mdData.oheng[key];

        if (promptValue !== null && mdValue !== null && promptValue !== mdValue) {
            errors.push({
                type: 'oheng',
                field: key,
                expected: promptValue,
                found: mdValue,
                message: `오행 ${key}: ${mdValue} → ${promptValue}로 수정`
            });

            // 자동 수정 (다양한 패턴)
            const ohengMap = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };
            const hanja = ohengMap[key];

            // "木이 4개" → "木이 3개"
            fixedMD = fixedMD.replace(
                new RegExp(`${hanja}[이가]?\\s*${mdValue}\\s*개`, 'g'),
                `${hanja}이 ${promptValue}개`
            );
            fixedMD = fixedMD.replace(
                new RegExp(`${key}[이가]?\\s*${mdValue}\\s*개`, 'g'),
                `${key}이 ${promptValue}개`
            );
        }
    }

    // 2. 신살 검증 (MD에 프롬프트에 없는 신살이 있는지)
    const promptSinsal = new Set(promptData.sinsal.map(s => s.trim()));
    const extraSinsal = mdData.sinsal.filter(s => !promptSinsal.has(s));

    if (extraSinsal.length > 0 && promptData.sinsal.length > 0) {
        errors.push({
            type: 'sinsal',
            field: 'extra',
            expected: Array.from(promptSinsal),
            found: extraSinsal,
            message: `MD에 추가된 신살 발견: ${extraSinsal.join(', ')} (주의: 프롬프트에 없는 신살)`
        });
        // 신살은 자동 수정하지 않음 (문맥상 어려움)
    }

    // 3. 이름 검증
    if (promptData.name && mdData.name && promptData.name !== mdData.name) {
        errors.push({
            type: 'name',
            expected: promptData.name,
            found: mdData.name,
            message: `이름: ${mdData.name} → ${promptData.name}로 수정`
        });

        fixedMD = fixedMD.replace(new RegExp(mdData.name, 'g'), promptData.name);
    }

    return {
        isValid: errors.length === 0,
        errors,
        fixedMD,
        summary: {
            totalErrors: errors.length,
            autoFixed: errors.filter(e => e.type === 'oheng' || e.type === 'name').length,
            needsReview: errors.filter(e => e.type === 'sinsal').length
        }
    };
}

module.exports = {
    extractFromPrompt,
    extractFromMD,
    verifyAndFix
};
