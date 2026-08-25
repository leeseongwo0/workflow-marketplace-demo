# 데모 실행 가이드

`google_news_rss/v1`의 Sui Testnet·Walrus Testnet 데모를 반복 실행하기 위한 운영 절차입니다. 모든 명령은 저장소 루트에서 실행합니다.

## 1. 준비

필요한 버전은 [README](../README.md)의 표를 따릅니다.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
sui move test --path move/workflow_marketplace
```

브라우저 지갑은 Sui Testnet을 선택하고 데모에 필요한 Testnet SUI를 준비합니다.

## 2. 현재 데모 객체

| 항목 | 공개 ID 또는 값 |
| --- | --- |
| Network | `testnet` |
| Package | `0x19fe5223d0045492ba45d88b5e9fc9d0be4bf05cd6def862c5faef10c6ed0124` |
| Marketplace | `0x8fc737d7538ba4db1507ec6728e8ff8a0ac9bf2cb7024e8697db0673431e7af8` |
| WorkflowRoot | `0x0378baa3b7aade01a7c0f046f5fb02893afc17ee97ef795dc4aca9c3a10a6f54` |
| WorkflowRelease | `0x2a8560b9fc657f7e9ee280897a7f3f06fe9f53b271761d2bf0c36f7d29bfa523` |
| Walrus blob | `RxMcj6lClRuLq2nwiCh7jK9sRENDYG3rRMaB-vBiDvA` |
| Encrypted bundle SHA-256 | `ac342f8ab7b986fc2b6cd90abda7265714efc649c46fca2bcc250f4213096b61` |
| Public manifest SHA-256 | `6651bfa5a474f1bc74df8a1979aeb31c43a0438ea3186639cf55324a5fdb32fa` |

## 3. 로컬 설정

```bash
cp .env.example .env
chmod 600 .env
```

`.env.example`의 설명에 따라 팀에서 공유한 개발 값을 `.env`에 입력합니다. 다음 값은 위의 현재 데모 객체와 일치해야 합니다.

```text
SUI_NETWORK=testnet
SUI_PACKAGE_ID=0x19fe5223d0045492ba45d88b5e9fc9d0be4bf05cd6def862c5faef10c6ed0124
MARKETPLACE_ID=0x8fc737d7538ba4db1507ec6728e8ff8a0ac9bf2cb7024e8697db0673431e7af8
WORKFLOW_ROOT_ID=0x0378baa3b7aade01a7c0f046f5fb02893afc17ee97ef795dc4aca9c3a10a6f54
WORKFLOW_RELEASE_ID=0x2a8560b9fc657f7e9ee280897a7f3f06fe9f53b271761d2bf0c36f7d29bfa523
VITE_SUI_NETWORK=testnet
VITE_SUI_PACKAGE_ID=0x19fe5223d0045492ba45d88b5e9fc9d0be4bf05cd6def862c5faef10c6ed0124
VITE_MARKETPLACE_ID=0x8fc737d7538ba4db1507ec6728e8ff8a0ac9bf2cb7024e8697db0673431e7af8
VITE_WORKFLOW_RELEASE_ID=0x2a8560b9fc657f7e9ee280897a7f3f06fe9f53b271761d2bf0c36f7d29bfa523
```

executor 서명 키가 아직 없다면 다음 명령으로 생성합니다. 기존 Marketplace와 연결된 데모에서는 팀이 보관한 일치하는 개발 키를 사용해야 합니다.

```bash
corepack pnpm --filter @aiwf/executor generate-key
```

## 4. 서버 실행

터미널 두 개를 사용합니다.

```bash
# 터미널 1
corepack pnpm dev:executor
```

```bash
# 터미널 2
corepack pnpm dev:web
```

브라우저에서 `http://127.0.0.1:5173/app`을 엽니다.

## 5. 발표 순서

1. 우측 상단 버튼으로 Testnet 지갑을 연결합니다.
2. 기존 `LicensePass`가 있으면 자동으로 다음 단계로 이동합니다.
3. 없다면 구매 버튼을 누르고 지갑에서 거래를 승인합니다.
4. 검색어를 입력하고 실행합니다.
5. 지갑의 실행 요청 서명을 승인합니다.
6. 최신순 뉴스 리포트와 실행 정보를 확인합니다.
7. `Receipt 확인하기`를 눌러 모달을 엽니다.
8. 필요하면 receipt 기록 거래를 승인합니다.

`Live · Testnet`, `Local server` 표시를 확인합니다. 실제 결과가 아닌 경우 화면에 `Fixture mode`가 명확히 표시되어야 합니다.

## 6. 선택적인 자동 점검

executor가 실행 중이고 `.env`가 준비되어 있다면 다음 명령으로 전체 Testnet 경로를 확인할 수 있습니다.

```bash
corepack pnpm --filter @aiwf/executor e2e:testnet
```

## 7. 새 release가 필요할 때

기존 객체를 그대로 사용하는 일반 UI·executor 작업에는 재배포가 필요하지 않습니다. 새로운 package나 release가 꼭 필요한 경우에만 다음 순서로 진행합니다.

```bash
sui client switch --env testnet
sui move build --path move/workflow_marketplace
sui move test --path move/workflow_marketplace
sui client publish --gas-budget 100000000 move/workflow_marketplace
```

새 workflow bundle 업로드:

```bash
corepack pnpm upload:walrus -- \
  --root-id=<새 WorkflowRoot ID> \
  --version=<새 버전> \
  --public-manifest=<로컬 public manifest JSON> \
  --private-bundle=<로컬 private bundle JSON>
```

새 Package, Marketplace, WorkflowRoot, WorkflowRelease와 Walrus blob 값은 서로 맞는 한 세트로 교체합니다.

## 8. 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| 화면이 갱신되지 않음 | 웹 개발 서버를 재시작하고 브라우저를 새로고침합니다. |
| executor 연결 실패 | `corepack pnpm dev:executor`가 `127.0.0.1:3001`에서 실행 중인지 확인합니다. |
| 지갑 네트워크 오류 | 브라우저 지갑과 `.env`가 모두 Testnet인지 확인합니다. |
| LicensePass를 찾지 못함 | 연결된 지갑 주소와 현재 WorkflowRelease가 맞는지 확인합니다. |
| challenge 만료 | 검색 실행을 다시 눌러 새 challenge를 받습니다. |
| RSS 또는 Walrus 일시 오류 | endpoint와 네트워크 상태를 확인한 뒤 다시 실행합니다. |
| bundle hash 불일치 | 실행을 중지하고 release의 blob ID와 hash를 다시 확인합니다. |
| receipt 조회 지연 | 잠시 기다린 뒤 동일한 객체를 다시 조회합니다. |

발표용 오프라인 화면만 필요하면 `.env`에서 `VITE_SUI_PACKAGE_ID`, `VITE_MARKETPLACE_ID`, `VITE_WORKFLOW_RELEASE_ID` 세 값을 모두 비우고 웹 서버를 재시작합니다. 일부만 비우면 fixture가 아니라 설정 오류가 됩니다.
