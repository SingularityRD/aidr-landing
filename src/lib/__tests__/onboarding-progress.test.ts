import { describe, expect, it } from "vitest";
import { getOnboardingProgress } from "../onboarding-progress";

describe("getOnboardingProgress", () => {
  it("starts with only the copied prompt complete when no agent has enrolled", () => {
    const progress = getOnboardingProgress({
      promptCopied: true,
      agents: [],
      events: [],
    });

    expect(progress.completed).toBe(1);
    expect(progress.percent).toBe(25);
    expect(progress.steps.map((step) => [step.id, step.complete])).toEqual([
      ["copy_prompt", true],
      ["install_agent", false],
      ["verify_device", false],
      ["first_event", false],
    ]);
  });

  it("treats pending and connected agents as device-visible after verification", () => {
    const progress = getOnboardingProgress({
      promptCopied: true,
      agents: [{ status: "pending" }],
      events: [],
    });

    expect(progress.completed).toBe(3);
    expect(progress.steps.find((step) => step.id === "verify_device")?.complete).toBe(true);
  });

  it("finishes once the first event is visible", () => {
    const progress = getOnboardingProgress({
      promptCopied: true,
      agents: [{ status: "connected" }],
      events: [{ id: "evt_1" }],
    });

    expect(progress.completed).toBe(4);
    expect(progress.percent).toBe(100);
  });
});
