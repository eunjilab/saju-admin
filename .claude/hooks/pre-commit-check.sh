#!/bin/bash
# 커밋 전 README 업데이트 체크

input_data=$(cat)
command=$(echo "$input_data" | jq -r '.tool_input.command // ""')

# git commit 명령이 아니면 통과
if [[ ! "$command" =~ "git commit" ]]; then
    exit 0
fi

# 변경된 파일들 확인
changed_files=$(git diff --cached --name-only 2>/dev/null)

# 주요 파일 변경 여부 체크
has_major_change=false
needs_readme_update=false

# index.html, netlify/functions, 새 HTML 파일 등 주요 변경 체크
if echo "$changed_files" | grep -qE "(index\.html|netlify/functions|_input\.html|_saju\.html|_question\.html)"; then
    has_major_change=true
fi

# README.md가 변경되지 않았으면
if ! echo "$changed_files" | grep -q "README.md"; then
    if [ "$has_major_change" = true ]; then
        needs_readme_update=true
    fi
fi

if [ "$needs_readme_update" = true ]; then
    echo '{"decision": "ask", "reason": "⚠️ 주요 파일이 변경되었는데 README.md가 업데이트되지 않았습니다. README도 수정이 필요한지 확인해주세요."}'
    exit 0
fi

exit 0
