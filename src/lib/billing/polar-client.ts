import { Polar } from "@polar-sh/sdk";

const polarAccessToken = process.env.POLAR_ACCESS_TOKEN?.trim();
const polarEnvironment = process.env.POLAR_ENVIRONMENT?.trim() || "sandbox";

export const polar = polarAccessToken
  ? new Polar({
      accessToken: polarAccessToken,
      server: polarEnvironment === "production" ? "production" : "sandbox",
    })
  : null;

type PolarClient = NonNullable<typeof polar>;
type CheckoutCreateArg = Parameters<PolarClient["checkouts"]["create"]>[0];
type SubscriptionsListArg = Parameters<PolarClient["subscriptions"]["list"]>[0];

function getPolarClient(): PolarClient {
  if (!polar) throw new Error("Polar is not configured");
  return polar;
}

export function isPolarConfigured(): boolean {
  return Boolean(polar);
}

export async function createPolarCheckout(
  userId: string,
  email: string,
  productPriceId: string,
  seats: number = 1,
): Promise<{ checkoutUrl: string; checkoutId: string } | null> {
  const checkout: CheckoutCreateArg = {
    products: [productPriceId],
    customerEmail: email,
    customerId: userId,
    externalCustomerId: userId,
    metadata: {
      user_id: userId,
      seats: String(seats),
    },
    customerMetadata: {
      user_id: userId,
      seats: seats,
    },
    ...(seats > 1 ? { seats } : {}),
  };

  const createdCheckout = await getPolarClient().checkouts.create(checkout);

  return {
    checkoutUrl: createdCheckout.url,
    checkoutId: createdCheckout.id,
  };
}

export async function getPolarSubscriptions(customerExternalId: string) {
  const result = await getPolarClient().subscriptions.list({
    externalCustomerId: customerExternalId,
  } satisfies SubscriptionsListArg);

  return result;
}

export async function cancelPolarSubscription(subscriptionId: string) {
  await getPolarClient().subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: { cancelAtPeriodEnd: true },
  });
}
