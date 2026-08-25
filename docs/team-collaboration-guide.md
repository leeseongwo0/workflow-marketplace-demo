# 팀 협업 가이드

이 문서는 개발 경험이 많지 않은 팀원도 저장소에서 안전하게 작업을 시작할 수 있도록 만든 최소 안내입니다.

## 1. 처음 한 번만 준비하기

```bash
git clone https://github.com/leeseongwo0/workflow-marketplace-demo.git
cd workflow-marketplace-demo
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

마지막 명령이 통과하면 기본 개발 준비가 끝난 것입니다.

## 2. 새 작업 시작하기

먼저 최신 코드를 받고 작업 브랜치를 만듭니다.

```bash
git switch main
git pull --ff-only
git switch -c <이름>/<짧은-작업명>
```

예:

```bash
git switch -c minsu/report-ui
```

작업을 시작할 때 팀 채널이나 Issue에 “무엇을, 어느 파일에서 바꾸는지” 한 줄로 공유합니다. 같은 파일을 두 명이 동시에 수정하는 상황만 피해도 대부분의 충돌을 막을 수 있습니다.

## 3. 담당 영역 찾기

| 하고 싶은 일 | 주로 보는 위치 |
| --- | --- |
| 랜딩·데모 화면 | `apps/web/src` |
| 로컬 API와 실행 흐름 | `apps/executor/src` |
| Google News RSS 규칙 | `packages/workflow-google-news` |
| 공용 데이터 형식 | `packages/shared` |
| Sui 객체·라이선스·receipt | `move/workflow_marketplace` |
| 테스트용 RSS 데이터 | `fixtures/google-news` |
| 실행·설계 문서 | `docs` |

Move, 공용 스키마, 서명, 암호화 형식을 바꾸는 작업은 여러 영역에 영향을 줍니다. 이런 변경은 코드를 작성하기 전에 기술 담당자와 변경 범위를 먼저 확정합니다.

## 4. 로컬에서 확인하기

UI 작업:

```bash
corepack pnpm dev:web
```

executor까지 필요한 작업:

```bash
# 터미널 1
corepack pnpm dev:executor

# 터미널 2
corepack pnpm dev:web
```

기본 품질 검사:

```bash
corepack pnpm verify
```

특정 패키지만 빠르게 확인하고 싶다면 다음과 같이 실행할 수 있습니다.

```bash
corepack pnpm --filter web test
corepack pnpm --filter @aiwf/executor test
corepack pnpm --filter @aiwf/workflow-google-news test
```

## 5. 작업 공유하기

```bash
git status
git add <내가 수정한 파일>
git commit -m "변경 내용을 짧게 설명"
git push -u origin <현재-브랜치>
```

GitHub에서 Pull Request를 만들고 템플릿의 세 항목만 작성합니다. 리뷰 반영이 끝나면 팀에서 merge합니다.

## 문제가 생겼을 때

- 설치 오류: Node 버전과 `corepack pnpm install --frozen-lockfile`을 확인합니다.
- 화면이 갱신되지 않음: 개발 서버를 다시 실행하고 브라우저를 새로고침합니다.
- 테스트 실패: 실패한 파일과 첫 번째 오류 메시지를 팀에 공유합니다.
- Git 충돌: 충돌 파일을 임의로 덮어쓰지 말고 해당 파일 담당자와 함께 해결합니다.
- 실행 설정이 없음: 개인 값을 임의로 만들지 말고 팀의 개발용 `.env` 안내를 요청합니다.

기술 설계의 기준은 `docs/mvd-technical-spec.md`, 현재 완료 상태의 기준은 `docs/implementation-status.md`입니다.
