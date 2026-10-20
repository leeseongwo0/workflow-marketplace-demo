interface BriefResultProps {
  /** Headlines from the original workflow, when a real run is available. */
  topStories: string[];
  executedAtMs: number;
}

const FIXED_LINES: Array<{ label: string; value: string }> = [
  { label: "시장 영향 뉴스", value: "수출 규제 추가 검토" },
  { label: "주목 기업", value: "NVIDIA · TSMC" },
  { label: "한 줄 요약", value: "수요는 강한데 공급·규제가 변수" },
];

/**
 * A saved run of the forked brief.
 *
 * Nothing is executed to show this. The listing has no bundle behind it, so
 * the screen presents what a run produced rather than pretending to produce
 * one. The headlines are taken from the original workflow's own output when
 * this browser has one, which is the whole point of the fork: the brief is
 * built out of someone else's result.
 */
export function BriefResult({ topStories, executedAtMs }: BriefResultProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">실행 결과</h2>
        <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-xs font-normal text-amber-300">
          저장된 결과 · 예시
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {new Date(executedAtMs).toLocaleString("ko-KR", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        실행 · 원본 워크플로의 결과를 입력으로 받았습니다
      </p>

      <dl className="mt-5 flex flex-col gap-4">
        <div>
          <dt className="text-xs text-muted">Top 3</dt>
          <dd className="mt-2">
            <ol className="flex flex-col gap-2">
              {topStories.map((story, index) => (
                <li
                  key={story}
                  className="flex items-start gap-3 rounded-xl border border-white/20 bg-ink px-4 py-3"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-snug break-keep">{story}</span>
                </li>
              ))}
            </ol>
          </dd>
        </div>

        {FIXED_LINES.map((line) => (
          <div key={line.label} className="flex flex-col gap-1">
            <dt className="text-xs text-muted">{line.label}</dt>
            <dd className="text-sm font-medium">{line.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex items-baseline gap-3 border-t border-line pt-4">
        <span className="text-xs text-muted">핵심 시사점</span>
        <span className="text-base font-semibold text-mint">공급 측 뉴스 주시</span>
      </div>
    </div>
  );
}
