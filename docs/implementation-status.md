# 구현 현황

기준일: 2026-08-25

- [x] Phase 1 — 저장소, 공용 스키마, 오프라인 Google News RSS 코어
- [x] Phase 2 — Sui Move 마켓플레이스, 라이선스, receipt
- [x] Phase 3 — AES-GCM bundle, Walrus adapter, bootstrap
- [x] Phase 4 — 로컬 executor와 지갑 challenge
- [x] Phase 5 — 랜딩 페이지와 라이선스·실행·리포트 UI
- [x] Phase 6 — Sui/Walrus Testnet end-to-end 데모
- [ ] Phase 7 — 선택 사항인 Seal 검토

## 현재 검증 상태

| 항목 | 결과 |
| --- | --- |
| TypeScript strict 검사 | 통과 |
| 결정적 테스트 | 245개 통과 |
| 웹 production build | 통과 |
| Move 테스트 | 20개 통과 |
| GitHub CI | 통과 |

기본 검증 명령:

```bash
corepack pnpm verify
sui move test --path move/workflow_marketplace
```

## 현재 제품 범위

- 지원 workflow는 `google_news_rss/v1` 하나입니다.
- 검색 결과는 최근 24시간, 최신순, 중복 제거 후 최대 10개입니다.
- 브라우저는 workflow bundle을 복호화하거나 임의 코드를 실행하지 않습니다.
- 실행은 로컬 executor에서 이루어집니다.
- Seal은 선택 사항이며 Nautilus와 TEE는 범위 밖입니다.

반복 가능한 실제 데모 절차와 현재 object ID는 [데모 실행 가이드](demo-runbook.md)를 기준으로 합니다.
