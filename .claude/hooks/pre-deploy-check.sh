#!/bin/bash
# 배포 전 체크 - 수정된 파일에 따라 배포해야 할 사이트 알림

input_data=$(cat)
command=$(echo "$input_data" | jq -r '.tool_input.command // ""')

# netlify deploy 명령이 아니면 통과
if [[ ! "$command" =~ "netlify deploy" ]]; then
    exit 0
fi

# 최근 변경된 파일들 확인
changed_files=$(git diff --name-only HEAD~1 2>/dev/null || git diff --name-only)

deploy_sites=""

# 1_input.html 변경 시
if echo "$changed_files" | grep -q "1_input.html"; then
    deploy_sites="$deploy_sites\n- 입력폼 (lucky-cactus-b5f9e6.netlify.app)"
fi

# 2_saju.html 변경 시
if echo "$changed_files" | grep -q "2_saju.html"; then
    deploy_sites="$deploy_sites\n- 사주계산기 (saju-calc.netlify.app)"
fi

# 7_question.html 변경 시
if echo "$changed_files" | grep -q "7_question.html"; then
    deploy_sites="$deploy_sites\n- 추가질문폼 (jovial-medovik-51e5df.netlify.app)"
fi

# 배포해야 할 추가 사이트가 있으면 알림
if [ -n "$deploy_sites" ]; then
    echo "{\"decision\": \"ask\", \"reason\": \"📢 아래 사이트들도 함께 배포해야 합니다:$deploy_sites\n\n관리자페이지만 배포하고 있습니다. 다른 사이트도 배포할까요?\"}"
    exit 0
fi

exit 0
