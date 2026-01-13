#!/bin/bash
# 민감한 파일 보호 - 실수로 수정하지 않도록

input_data=$(cat)
file_path=$(echo "$input_data" | jq -r '.tool_input.file_path // ""')

# 보호할 파일 패턴
protected_patterns=(
    ".env"
    "package-lock.json"
    ".git/"
    "node_modules/"
    "credentials"
    "secret"
)

for pattern in "${protected_patterns[@]}"; do
    if [[ "$file_path" == *"$pattern"* ]]; then
        echo "{\"decision\": \"block\", \"reason\": \"⛔ 보호된 파일입니다: $file_path\"}"
        exit 0
    fi
done

exit 0
