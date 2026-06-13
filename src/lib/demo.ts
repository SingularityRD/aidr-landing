/**
 * Demo mode detection and helpers.
 * Demo mode is only enabled when explicitly requested by flag.
 */

export const isDemoMode = (): boolean => {
	if (typeof process === "undefined") return false;
	if (process.env.AIDR_DEMO_MODE === "1" || process.env.NEXT_PUBLIC_AIDR_E2E_MODE === "1") return true;
	return false;
};

export const demoUser = {
	id: "demo-user-001",
	email: "demo@aidr.local",
	firstName: "Demo",
	lastName: "User",
	fullName: "Demo User",
	imageUrl: "",
};
