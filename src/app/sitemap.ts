import type { MetadataRoute } from "next";
import { CONTENT_REVIEWED_ON, PUBLIC_ROUTES, getSiteUrl } from "@/lib/site/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  return PUBLIC_ROUTES.map((route) => ({
    url: route === "/" ? site : `${site}${route}`,
    lastModified: CONTENT_REVIEWED_ON,
    changeFrequency: route === "/status" ? "hourly" : "monthly",
    priority: route === "/" ? 1 : 0.6,
  }));
}
