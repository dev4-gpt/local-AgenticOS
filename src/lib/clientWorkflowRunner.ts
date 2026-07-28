const UUID = /^[0-9a-f-]{36}$/i;

export type ClientWorkflowRunnerInput = {
  workflowId?: unknown;
  surface?: unknown;
  operation?: unknown;
  title?: unknown;
  goal?: unknown;
  steps?: unknown;
  now?: string;
};

export type ClientWorkflowStepResult = {
  id: string;
  title: string;
  status: "done";
  result: string;
};

export type ClientWorkflowRun = {
  workflowId: string | null;
  adapter: "tenant-workflow-runner";
  mode: "deterministic-free";
  surface: string;
  operation: string;
  goal: string;
  status: "completed";
  completedSteps: number;
  steps: ClientWorkflowStepResult[];
  externalActions: "approval_required";
  completedAt: string;
};

const OPERATIONS = new Set(["plan", "review", "build", "improve", "iterate", "handoff"]);

/**
 * Runs the provider-free portion of a hosted workflow. It prepares an
 * inspectable, bounded plan; it never claims that an external action ran.
 */
export function runClientWorkflowRunner(input: ClientWorkflowRunnerInput): ClientWorkflowRun | null {
  const workflowId = typeof input.workflowId === "string" && UUID.test(input.workflowId) ? input.workflowId : null;
  const surface = typeof input.surface === "string" ? input.surface.trim().slice(0, 80) : "orchestrate";
  const operation = typeof input.operation === "string" ? input.operation.trim().toLowerCase() : "plan";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 240) : "Hosted workflow";
  const goal = typeof input.goal === "string" ? input.goal.trim().slice(0, 5000) : "Review the requested outcome";
  if (!surface || !title || !goal || !OPERATIONS.has(operation)) return null;

  const rawSteps = Array.isArray(input.steps) ? input.steps : defaultSteps(operation);
  const steps = rawSteps.slice(0, 8).flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const step = value as Record<string, unknown>;
    const id = typeof step.id === "string" && UUID.test(step.id) ? step.id : `generated-${index + 1}`;
    const stepTitle = typeof step.title === "string" ? step.title.trim().slice(0, 240) : "Bounded workflow step";
    if (!stepTitle) return [];
    return [{ id, title: stepTitle, status: "done" as const, result: stepResult(operation, stepTitle) }];
  });
  if (steps.length === 0) return null;

  return {
    workflowId,
    adapter: "tenant-workflow-runner",
    mode: "deterministic-free",
    surface,
    operation,
    goal,
    status: "completed",
    completedSteps: steps.length,
    steps,
    externalActions: "approval_required",
    completedAt: typeof input.now === "string" && input.now ? input.now : new Date().toISOString(),
  };
}

function defaultSteps(operation: string) {
  return [
    { id: "generated-1", title: operation === "review" ? "Inspect the current workflow" : "Scope and constraints" },
    { id: "generated-2", title: "Work items and ownership" },
    { id: "generated-3", title: "Human review" },
    { id: "generated-4", title: "Approved delivery" },
  ];
}

function stepResult(operation: string, title: string) {
  if (operation === "review") return `Reviewed ${title.toLowerCase()} as a bounded tenant workflow step.`;
  if (operation === "iterate" || operation === "improve") return `Prepared ${title.toLowerCase()} for a bounded iteration; external changes remain approval-gated.`;
  if (operation === "handoff") return `Prepared ${title.toLowerCase()} for an approval-gated handoff; no external delivery was executed.`;
  return `Prepared ${title.toLowerCase()} from the supplied goal; external changes remain approval-gated.`;
}
