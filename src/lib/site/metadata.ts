import type { Metadata } from "next";
import { SITE_NAME } from "./config";

/** Per-page metadata with a canonical URL, Open Graph and Twitter tags. */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} // ${SITE_NAME}`,
      description,
      url: path,
      type: "website",
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} // ${SITE_NAME}`,
      description,
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
