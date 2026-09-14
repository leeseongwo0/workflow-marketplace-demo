import type { Workflow } from "../stores/workflow-store";

interface WorkflowThumbnailProps {
  workflow: Pick<Workflow, "icon" | "accent">;
  className?: string;
  textClassName?: string;
}

export function WorkflowThumbnail({
  workflow,
  className = "h-20 w-20 rounded-xl",
  textClassName = "text-3xl",
}: WorkflowThumbnailProps) {
  if (workflow.icon === undefined) {
    return <div className={`flex-shrink-0 bg-white ${className}`} />;
  }

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center bg-gradient-to-br ${workflow.accent ?? "from-blue/80 to-mint/60"} ${className}`}
    >
      <span className={textClassName} aria-hidden="true">
        {workflow.icon}
      </span>
    </div>
  );
}
