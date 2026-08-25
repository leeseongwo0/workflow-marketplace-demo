# AI 워크플로 자산 마켓플레이스

Sui Testnet에서 Google News RSS 워크플로의 라이선스를 구매하고, 로컬 executor에서 실행한 뒤 검증 가능한 receipt를 기록하는 발표용 MVD입니다.

```text
LicensePass 확인 또는 구매
  → 검색어 입력
  → 지갑 서명
  → 로컬 실행
  → 뉴스 리포트
  → ExecutionReceipt 확인
```

- `/`: 프로젝트 소개 랜딩 페이지
- `/app`: 실제 데모 화면
- 현재 Phase 1–6 완료, 선택 사항인 Seal은 미구현

## 처음 시작하기

### 권장 버전

| 도구 | 저장소 기준 |
| --- | --- |
| Node.js | `22.13.0` (`>=22.13.0` 지원) |
| pnpm | `11.22.0` |
| Sui CLI | `1.77.2` |
| Move | edition `2024` |
| React / Vite | `19.2.8` / `8.2.1` |
| TypeScript | `7.0.2` |

저장소의 `.nvmrc`와 `.node-version`이 Node 버전을 고정합니다. nvm을 사용한다면 다음 명령으로 맞출 수 있습니다.

```bash
nvm install
nvm use
```

Sui는 이미 설치되어 있으면 먼저 `sui --version`을 확인합니다. 결과에 `1.77.2`가 포함되면 변경할 필요가 없습니다. 다른 버전을 사용하는 경우에만 [공식 suiup](https://github.com/MystenLabs/suiup#installation)으로 전환합니다.

```bash
suiup install sui@testnet-1.77.2
suiup default set sui@testnet-1.77.2
```

### 설치 및 검증

```bash
git clone https://github.com/leeseongwo0/workflow-marketplace-demo.git
cd workflow-marketplace-demo
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

## 실행

UI만 실행:

```bash
corepack pnpm dev:web
```

브라우저에서 `http://127.0.0.1:5173/` 또는 `http://127.0.0.1:5173/app`을 엽니다.

로컬 executor까지 실행하려면 `.env.example`을 `.env`로 복사해 팀의 개발 설정을 채운 뒤 터미널 두 개를 사용합니다.

```bash
# 터미널 1
corepack pnpm dev:executor

# 터미널 2
corepack pnpm dev:web
```

실제 데모 준비와 복구 절차는 [데모 실행 가이드](docs/demo-runbook.md)를 참고하세요.

## 자주 쓰는 명령

| 명령 | 용도 |
| --- | --- |
| `corepack pnpm dev:web` | 웹 개발 서버 실행 |
| `corepack pnpm dev:executor` | 로컬 executor 실행 |
| `corepack pnpm check` | TypeScript와 테스트 확인 |
| `corepack pnpm build:web` | 웹 production build 확인 |
| `corepack pnpm verify` | PR 전 전체 검사 |
| `sui move test --path move/workflow_marketplace` | Move 테스트 |

## 저장소 구조

```text
apps/web                       React 랜딩·데모 앱
apps/executor                  로컬 실행 API
packages/shared                공용 스키마와 receipt BCS
packages/workflow-google-news  RSS 처리 코어
move/workflow_marketplace      Sui Move 패키지
fixtures/google-news           오프라인 XML fixture
docs                           설계, 진행 상황, 데모 가이드
```

## 팀 작업

1. GitHub Collaborator 초대를 수락합니다.
2. `main`에서 작업 브랜치를 만듭니다.
3. 한 Pull Request에는 한 가지 변경만 담습니다.
4. 공유 전에 `corepack pnpm verify`를 실행합니다.

자세한 브랜치·PR 절차는 [기여 안내](CONTRIBUTING.md), 핵심 설계는 [아키텍처](docs/architecture.md), 완료 범위는 [구현 현황](docs/implementation-status.md)을 확인하세요.

## 현재 범위

- `google_news_rss/v1`만 지원합니다.
- RSS 결과만 사용하며 기사 본문은 수집하지 않습니다.
- workflow bundle은 설정 데이터이며 임의 코드를 실행하지 않습니다.
- 실행은 로컬 서버에서 이루어지며 Nautilus와 TEE는 구현하지 않았습니다.
- 단위 테스트는 외부 서비스에 접속하지 않습니다.
