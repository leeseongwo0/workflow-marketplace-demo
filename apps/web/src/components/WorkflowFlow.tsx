interface WorkflowFlowProps {
  steps: string[];
}

/**
 * The workflow drawn as the stages it runs through.
 *
 * Built from the listing's own data rather than an image per workflow: a
 * picture would have to be produced and kept in step with the copy, and a
 * generated one would look like every other generated one. Plain boxes and
 * arrows read as a pipeline, which is what a workflow is.
 */
export function WorkflowFlow({ steps }: WorkflowFlowProps) {
  if (steps.length === 0) return null;

  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
      {steps.map((step, index) => (
        <li key={step} className="flex flex-1 items-center gap-2 sm:flex-col sm:gap-0">
          <div className="flex w-full items-center">
            {/* Connector on the left of every box but the first. */}
            <span
              aria-hidden="true"
              className={`hidden h-px flex-1 sm:block ${index === 0 ? "bg-transparent" : "bg-line"}`}
            />
            <div className="flex min-h-[3.25rem] w-full flex-1 items-center justify-center rounded-lg border border-line bg-ink px-3 py-2 text-center text-xs leading-snug text-white sm:w-auto">
              {step}
            </div>
            <span
              aria-hidden="true"
              className={`hidden h-px flex-1 sm:block ${
                index === steps.length - 1 ? "bg-transparent" : "bg-line"
              }`}
            />
          </div>
          <span
            aria-hidden="true"
            className={`text-xs text-muted sm:hidden ${
              index === steps.length - 1 ? "invisible" : ""
            }`}
          >
            ↓
          </span>
        </li>
      ))}
    </ol>
  );
}
