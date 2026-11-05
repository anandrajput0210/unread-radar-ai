import { Badge } from "./ui/Badge.jsx";

/**
 * Marks a task the extractor is not sure about. Confirmed tasks show nothing;
 * model-only suggestions already carry their own label.
 */
export function OutcomeBadge({ task }) {
  if (task?.outcome !== "possible" || task.classification === "model_candidate") return null;
  return <Badge tone="amber" className="cursor-help" title={task.outcomeReason || "Weaker evidence: confirm or reject"}>Possible task · review</Badge>;
}
