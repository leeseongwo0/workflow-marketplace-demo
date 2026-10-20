import type { Workflow } from "../stores/workflow-store";

interface WorkflowThumbnailProps {
  workflow: Pick<Workflow, "icon" | "accent">;
  className?: string;
  textClassName?: string;
}

/**
 * A quiet marker next to a listing.
 *
 * It used to be a saturated gradient behind a large emoji, which is the look
 * that made reviewers read the catalog as a generated mockup. The tile is now
 * a plain surface and the glyph is held back, so it identifies a row without
 * competing with the name beside it.
 */
export function WorkflowThumbnail({
  workflow,
  className = "h-12 w-12 rounded-lg",
  textClassName = "text-lg",
}: WorkflowThumbnailProps) {
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center border border-line bg-ink ${className}`}
    >
      {workflow.icon !== undefined && (
        <span className={`${textClassName} opacity-70 grayscale`} aria-hidden="true">
          {workflow.icon}
        </span>
      )}
    </div>
  );
}
