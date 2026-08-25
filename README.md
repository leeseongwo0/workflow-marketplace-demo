# AI 워크플로 자산 마켓플레이스

Sui Testnet에서 워크플로 라이선스를 구매하고, 로컬 executor가 라이선스를 확인한 뒤 Google News RSS 결과와 검증 가능한 실행 영수증을 만드는 발표용 MVD입니다.

현재 구현 범위는 Phase 1–6입니다. 선택 사항인 Seal은 아직 구현하지 않았으며, Nautilus와 TEE는 이 MVD의 범위가 아닙니다. 세부 진행 상황은 [구현 현황](docs/implementation-status.md)에서 확인할 수 있습니다.

## 데모 흐름

```text
LicensePass 확인 또는 구매
  → 검색어 입력
  → 지갑 서명
  → 로컬 executor 실행
  → 뉴스 리포트 확인
  → ExecutionReceipt 확인 및 기록
```

웹 화면은 두 경로로 나뉩니다.

- `/`: 프로젝트 소개용 랜딩 페이지
- `/app`: LicensePass부터 리포트와 receipt까지 보여 주는 데모 앱

## 처음 시작하기

### 버전 호환성

| 항목 | 저장소 기준 | 호환 범위와 사용 위치 |
| --- | --- | --- |
| Node.js | `22.13.0` | 최소 `22.13.0`; CI는 22.13.0, 로컬 검증은 24.19.0에서도 통과 |
| pnpm | `11.22.0` | 정확한 버전 권장; `packageManager`와 lockfile 기준 |
| Sui CLI | `1.77.2` | Move build/test와 Testnet 작업에 사용하는 검증 버전 |
| Move | edition `2024` | `Move.lock`에 Testnet Sui framework revision이 고정됨 |
| `@mysten/sui` | `2.26.2` | 웹과 executor가 함께 사용하는 고정 SDK 버전 |
| dApp Kit | core `1.6.18`, React `2.1.20` | 현재 지갑 연결·서명 API와 호환되는 조합 |
| React / Vite | `19.2.8` / `8.2.1` | 현재 웹 빌드에서 검증한 조합 |
| TypeScript | `7.0.2` | strict typecheck 기준 버전 |

버전 확인:

```bash
node --version
corepack pnpm --version
sui --version
```

호환성 관련 원칙은 단순합니다.

- 가장 안정적인 환경은 `.node-version`의 Node와 `package.json`의 pnpm 버전을 그대로 사용하는 것입니다.
- UI나 RSS 코드만 작업한다면 Sui CLI가 없어도 됩니다. Move 파일을 수정할 때는 Sui CLI `1.77.2`를 권장합니다.
- 더 새로운 Sui CLI가 `Move.lock`을 변경하려 하면 해당 변경을 바로 커밋하지 말고 기술 담당자와 먼저 확인합니다.
- Sui CLI와 `@mysten/sui` SDK는 서로 다른 버전 체계를 사용하므로 버전 번호를 동일하게 맞출 필요가 없습니다.
- 의존성 설치는 pnpm만 사용합니다. `npm install`이나 Yarn을 함께 사용해 별도의 lockfile을 만들지 않습니다.

### 설치

저장소를 받은 뒤 아래 명령을 실행합니다.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

UI만 확인하려면 다음 명령으로 충분합니다.

```bash
corepack pnpm dev:web
```

브라우저에서 `http://127.0.0.1:5173/` 또는 `http://127.0.0.1:5173/app`을 엽니다. 공개 객체 설정이 없는 로컬 환경에서는 화면에 `Fixture mode`가 명시됩니다.

실제 로컬 executor 경로를 실행하려면 `.env.example`을 복사해 팀에서 공유한 개발 설정을 채운 뒤 터미널 두 개를 사용합니다.

```bash
# 터미널 1
corepack pnpm dev:executor

# 터미널 2
corepack pnpm dev:web
```

자세한 데모 운영 절차는 [데모 실행 가이드](docs/demo-runbook.md)를 참고하세요.

## 자주 쓰는 명령

| 명령 | 용도 |
| --- | --- |
| `corepack pnpm dev:web` | 웹 개발 서버 실행 |
| `corepack pnpm dev:executor` | 로컬 executor 실행 |
| `corepack pnpm check` | TypeScript 검사와 결정적 테스트 실행 |
| `corepack pnpm build:web` | 웹 production build 확인 |
| `corepack pnpm verify` | PR 전 기본 검사 전체 실행 |
| `sui move test --path move/workflow_marketplace` | Move 변경 검증 |

## 저장소 구조

```text
apps/web                       React 랜딩·데모 앱
apps/executor                  로컬 실행 API와 Sui/Walrus 연동
packages/shared                공용 스키마, canonical JSON, receipt BCS
packages/workflow-google-news  RSS URL·파싱·정규화·24시간 필터
move/workflow_marketplace      Sui Move 마켓플레이스 패키지
fixtures/google-news           네트워크를 사용하지 않는 XML fixture
docs                           구현 현황, 설계, 데모와 팀 가이드
scripts                        Walrus 업로드 등 운영 스크립트
tools                          선택적인 개발 도구 설정
```

## 팀에서 작업하는 방법

복잡한 규칙 대신 아래 네 가지만 지킵니다.

1. 작업을 시작하기 전에 담당 파일과 목표를 팀에 알립니다.
2. `main`에서 바로 수정하지 않고 짧은 작업 브랜치를 만듭니다.
3. Pull Request 전에 `corepack pnpm verify`를 실행합니다.
4. Move, 결제, 라이선스, 서명, 암호화 관련 변경은 기술 담당자에게 먼저 공유합니다.

처음 참여하는 팀원은 [팀 협업 가이드](docs/team-collaboration-guide.md)와 [기여 안내](CONTRIBUTING.md)만 읽으면 됩니다.

## 프로젝트 범위

- 지원 워크플로는 `google_news_rss/v1` 하나입니다.
- RSS 결과만 사용하며 기사 본문은 수집하지 않습니다.
- workflow bundle은 설정 데이터이며 임의 코드를 실행하지 않습니다.
- 단위 테스트는 Google News, Sui, Walrus에 접속하지 않습니다.

제품 계약과 기술적 불변 조건은 [구현 brief](CODEX_IMPLEMENTATION_BRIEF.md)가 기준입니다.
