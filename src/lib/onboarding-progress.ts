export type OnboardingAgentState = {
  status?: string | null;
};

export type OnboardingEventState = {
  id?: string | null;
};

export type OnboardingProgressInput = {
  promptCopied: boolean;
  agents: OnboardingAgentState[];
  events: OnboardingEventState[];
};

export type OnboardingProgressStep = {
  id: "copy_prompt" | "install_agent" | "verify_device" | "first_event";
  label: string;
  complete: boolean;
};

export function getOnboardingProgress(input: OnboardingProgressInput): {
  steps: OnboardingProgressStep[];
  completed: number;
  total: number;
  percent: number;
} {
  const hasAgent = input.agents.length > 0;
  const hasVerifiedAgent = input.agents.some((agent) => {
    const status = (agent.status ?? "pending").toLowerCase();
    return status === "pending" || status === "connected" || status === "paused";
  });
  const hasEvent = input.events.length > 0;

  const steps: OnboardingProgressStep[] = [
    { id: "copy_prompt", label: "Prompt copied", complete: input.promptCopied },
    { id: "install_agent", label: "Agent installed", complete: hasAgent },
    { id: "verify_device", label: "Device verified", complete: hasVerifiedAgent },
    { id: "first_event", label: "First event received", complete: hasEvent },
  ];
  const completed = steps.filter((step) => step.complete).length;
  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
  };
}
