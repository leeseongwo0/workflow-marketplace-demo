# 기여 안내

처음 참여한다면 [README](README.md)의 설치와 검증을 먼저 완료해 주세요.

## 작업 시작

```bash
git switch main
git pull --ff-only
git switch -c <이름>/<짧은-작업명>
```

예: `git switch -c minsu/report-ui`

작업 시작 전에 팀 채널이나 Issue에 담당 파일과 목표를 한 줄로 공유합니다.

| 작업 | 주로 수정하는 위치 |
| --- | --- |
| 랜딩·데모 화면 | `apps/web/src` |
| 로컬 API와 실행 흐름 | `apps/executor/src` |
| Google News RSS | `packages/workflow-google-news` |
| 공용 데이터 형식 | `packages/shared` |
| Sui 객체·라이선스·receipt | `move/workflow_marketplace` |

Move, 공용 스키마, 서명 또는 암호화 형식은 여러 영역에 영향을 주므로 구현 전에 팀과 범위를 확인합니다.

## 공유 전 확인

```bash
corepack pnpm verify
```

Move 파일을 수정했다면 다음 검사도 실행합니다.

```bash
sui move build --path move/workflow_marketplace
sui move test --path move/workflow_marketplace
```

## 커밋과 Pull Request

```bash
git status
git add <수정한 파일>
git commit -m "변경 내용을 짧게 설명"
git push -u origin <현재-브랜치>
```

Pull Request에는 변경 이유, 달라진 동작, 실행한 테스트만 간단히 작성합니다. 충돌이 생기면 파일을 덮어쓰지 말고 해당 파일 담당자와 함께 해결합니다.
