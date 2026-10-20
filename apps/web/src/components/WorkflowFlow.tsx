import { ArrowDown } from "lucide-react";

interface WorkflowFlowProps {
  steps: string[];
}

/**
 * The workflow drawn as the stages it runs through.
 *
 * Built from the listing's own data rather than an image per workflow: a
 * picture would have to be produced and kept in step with the copy, and a
 * generated one would look like every other generated one.
 *
 * Borders and arrows are deliberately strong. At the theme's usual hairline
 * contrast the boxes read as separate labels rather than one connected
 * pipeline, which defeats the point of drawing it.
 */
export function WorkflowFlow({ steps }: WorkflowFlowProps) {
  if (steps.length === 0) return null;

  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step}>
          <div className="flex items-center gap-3 rounded-xl border border-white/25 bg-ink px-4 py-3.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold">
              {index + 1}
            </span>
            <span className="text-base font-medium leading-snug break-keep">{step}</span>
          </div>
          {index < steps.length - 1 && (
            <div className="flex justify-center py-1" aria-hidden="true">
              <ArrowDown className="h-6 w-6 text-white/50" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
