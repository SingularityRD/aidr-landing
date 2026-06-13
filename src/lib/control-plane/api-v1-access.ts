export const PUBLIC_API_V1_ACTIONS = new Set([
	"waitlist-signup",
	"device-start",
	"device-poll",
	"enroll",
	"ingest",
	"policy",
]);

export function isPublicApiV1Action(action: string): boolean {
	return PUBLIC_API_V1_ACTIONS.has(action);
}
