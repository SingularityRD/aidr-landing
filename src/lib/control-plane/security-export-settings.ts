export type SecurityExportRoute =
  | "runtime_events"
  | "policy_rollout"
  | "delivery_failures"
  | "incident_cases";

export type SecurityExportDestination = {
  id: string;
  name: string;
  webhookUrl: string;
  includePayload: boolean;
};

type NormalizedDestination = SecurityExportDestination & {
  enabled: boolean;
  route_runtime_events: boolean;
  route_policy_rollout: boolean;
  route_delivery_failures: boolean;
  route_incident_cases: boolean;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeWebhookUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function routeEnabled(destination: NormalizedDestination, route: SecurityExportRoute) {
  if (route === "runtime_events") return destination.route_runtime_events;
  if (route === "policy_rollout") return destination.route_policy_rollout;
  if (route === "delivery_failures") return destination.route_delivery_failures;
  return destination.route_incident_cases;
}

function normalizeDestination(rawValue: unknown, index: number): NormalizedDestination {
  const raw = getRecord(rawValue);
  const id = getString(raw.id).trim() || `destination_${index + 1}`;
  const name = getString(raw.name).trim() || `Destination ${index + 1}`;
  return {
    id,
    name,
    enabled: raw.enabled === true,
    webhookUrl: getString(raw.webhook_url).trim(),
    includePayload: raw.include_payload === true,
    route_runtime_events: raw.route_runtime_events !== false,
    route_policy_rollout: raw.route_policy_rollout !== false,
    route_delivery_failures: raw.route_delivery_failures !== false,
    route_incident_cases: raw.route_incident_cases !== false,
  };
}

export function normalizeSecurityExportDestinations(value: unknown): NormalizedDestination[] {
  const raw = getRecord(value);
  const destinations = [
    {
      id: "primary",
      name: "Primary destination",
      enabled: raw.enabled === true,
      webhookUrl: getString(raw.webhook_url).trim(),
      includePayload: raw.include_payload === true,
      route_runtime_events: raw.route_runtime_events !== false,
      route_policy_rollout: raw.route_policy_rollout !== false,
      route_delivery_failures: raw.route_delivery_failures !== false,
      route_incident_cases: raw.route_incident_cases !== false,
    },
  ];

  if (Array.isArray(raw.destinations)) {
    destinations.push(...raw.destinations.map((destination, index) => normalizeDestination(destination, index)));
  }

  return destinations;
}

export function getSecurityExportDestinations(value: unknown, route: SecurityExportRoute): SecurityExportDestination[] {
  return normalizeSecurityExportDestinations(value)
    .map((destination) => ({ ...destination, webhookUrl: safeWebhookUrl(destination.webhookUrl) ?? "" }))
    .filter((destination) => destination.enabled && destination.webhookUrl && routeEnabled(destination, route))
    .map(({ id, name, webhookUrl, includePayload }) => ({ id, name, webhookUrl, includePayload }));
}

export function getSecurityExportSkipReason(
  value: unknown,
  route: SecurityExportRoute,
): "route_disabled" | "webhook_not_configured" {
  const candidates = normalizeSecurityExportDestinations(value)
    .map((destination) => ({ ...destination, webhookUrl: safeWebhookUrl(destination.webhookUrl) ?? "" }))
    .filter((destination) => destination.enabled && destination.webhookUrl);

  if (candidates.length > 0 && candidates.every((destination) => !routeEnabled(destination, route))) {
    return "route_disabled";
  }

  return "webhook_not_configured";
}
