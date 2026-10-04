import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site/config";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/.well-known/security.txt"],
        // Authenticated product surfaces, machine endpoints and token-bearing flows are not for indexing.
        disallow: [
          "/api/",
          "/v1/",
          "/dashboard",
          "/agents",
          "/events",
          "/incidents",
          "/billing",
          "/api-keys",
          "/settings",
          "/onboarding",
          "/policy-rollout",
          "/policy-approvals",
          "/delivery-failures",
          "/verify",
          "/auth/",
          "/login",
          "/signup",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
