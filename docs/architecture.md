# 아키텍처

이 문서는 팀 개발에 필요한 핵심 구조와 변경하면 안 되는 규칙만 정리합니다. 세부 데이터 형식의 최종 기준은 코드와 테스트입니다.

## 전체 흐름

```text
웹 앱
  → Sui: WorkflowRelease와 LicensePass 확인
  → 로컬 executor: 실행 challenge 발급 및 지갑 서명 확인
  → Walrus: 암호화된 workflow bundle 조회
  → Google News RSS: 최근 24시간 결과 실행
  → executor: 결과 hash와 receipt 서명 생성
  → Sui: ExecutionReceipt 기록
```

## 구성요소

| 위치 | 역할 |
| --- | --- |
| `apps/web` | 지갑 연결, 라이선스 구매, 입력, 리포트와 receipt UI |
| `apps/executor` | 라이선스 확인, bundle 복호화, RSS 실행, receipt 서명 |
| `packages/shared` | 공용 스키마, canonical JSON, Move 호환 receipt BCS |
| `packages/workflow-google-news` | URL 생성, RSS 파싱, 정규화, 중복 제거, 24시간 필터 |
| `move/workflow_marketplace` | 마켓플레이스, release, license, receipt 객체와 검증 |

## 변경 시 지켜야 할 규칙

### Sui Move

- package publication마다 canonical `Marketplace`는 하나입니다.
- `WorkflowRoot`는 creator가 소유하고, `WorkflowRelease`는 공유 객체입니다.
- `LicensePass`와 `ExecutionReceipt`는 주소 소유 객체이며 외부 모듈이 임의로 이전할 수 없습니다.
- 활성 release에 정확한 가격을 지불해야 하며 buyer와 release 조합당 license는 하나입니다.
- receipt의 runner, release, LicensePass 등록 정보, executor 서명과 nonce를 모두 검증합니다.
- 사용한 receipt nonce는 다시 기록할 수 없습니다.

### 실행과 데이터

- 브라우저는 암호화 키나 복호화된 bundle을 받지 않습니다.
- executor는 라이선스를 먼저 확인한 뒤 bundle과 키에 접근합니다.
- Walrus에서 받은 bytes는 on-chain hash와 일치하는지 확인한 후 파싱합니다.
- bundle은 strict `google_news_rss/v1` 설정이며 전달받은 코드를 실행하지 않습니다.
- 기사 본문이나 연결된 페이지는 가져오지 않습니다.

### 형식과 암호화

- canonical JSON은 UTF-8, 정렬된 object key, 보존된 array 순서를 사용합니다.
- bundle은 AES-256-GCM으로 암호화하며 매번 새로운 12-byte nonce를 사용합니다.
- AAD domain은 `AIWF_BUNDLE_V1`, receipt domain은 `AIWF_RECEIPT_V1`입니다.
- receipt는 TypeScript와 Move에서 동일한 BCS field 순서를 사용합니다.
- hash는 SHA-256이며 문자열 경계에서는 소문자 64자리 hex입니다.

### 실행 요청

- challenge는 runner, release, license와 정규화된 query hash에 묶입니다.
- 유효한 지갑 서명을 확인한 challenge는 한 번만 사용할 수 있습니다.
- RSS 검색에는 서버가 `when:1d`를 붙이고 결과도 최근 24시간으로 다시 필터링합니다.
- 결과는 중복 제거 후 최신순 최대 10개입니다.

## 웹 모드

- `live`: 필요한 공개 object ID가 모두 설정된 경우 실제 경로를 사용합니다.
- `fixture`: 공개 object ID가 모두 없을 때 발표용 고정 데이터를 사용하며 화면에 표시합니다.
- 일부 설정만 있거나 값이 잘못되면 실행을 막고 설정 오류를 보여 줍니다.

## 의도적으로 제외한 기능

- Nautilus와 TEE
- 임의 workflow 코드 실행
- 기사 본문 crawling
- Fork, royalty, seller UI
- Seal은 Phase 7의 선택 사항이며 현재 구현하지 않았습니다.

설계 규칙을 바꿀 때는 관련 Move 테스트, 공용 BCS 테스트, executor 통합 테스트와 웹 테스트를 함께 확인합니다.
