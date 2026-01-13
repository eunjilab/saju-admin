#!/bin/bash
# 세션 시작 시 프로젝트 상태 체크

echo "📋 사주 관리자페이지 세션 시작"

# Git 상태 확인
uncommitted=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$uncommitted" -gt 0 ]; then
    echo "⚠️ 커밋되지 않은 변경사항 ${uncommitted}개 있음"
fi

# 최근 커밋 확인
last_commit=$(git log -1 --format="%s (%ar)" 2>/dev/null)
echo "📌 최근 커밋: $last_commit"

exit 0
