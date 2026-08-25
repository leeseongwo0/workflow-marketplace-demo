# 기여 안내

처음 참여한다면 [README](README.md)와 [팀 협업 가이드](docs/team-collaboration-guide.md)를 먼저 읽어 주세요.

## 작업 시작

```bash
git pull --ff-only
git switch -c <이름>/<짧은-작업명>
corepack pnpm install --frozen-lockfile
```

브랜치 이름은 알아보기만 쉬우면 됩니다. 예: `minsu/report-ui`, `jiyun/rss-error`.

## 작업 중

- 한 Pull Request에는 한 가지 목적만 담습니다.
- 같은 파일을 동시에 수정할 것 같으면 먼저 담당 범위를 공유합니다.
- 기존 사용자 변경이나 관련 없는 코드를 되돌리지 않습니다.
- 새로운 라이브러리는 꼭 필요한 경우에만 추가합니다.
- Move 권한·결제·라이선스 또는 서명·암호화·키 처리 변경은 구현 전에 기술 담당자와 상의합니다.

## 공유 전 확인

```bash
corepack pnpm verify
```

Move 파일을 수정했다면 추가로 실행합니다.

```bash
sui move build --path move/workflow_marketplace
sui move test --path move/workflow_marketplace
```

Pull Request에는 다음만 간단히 적으면 됩니다.

- 무엇을 왜 바꿨는지
- 화면이나 동작이 어떻게 달라졌는지
- 실행한 테스트와 결과
- 리뷰어가 알아야 할 제한 사항
