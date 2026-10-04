import { buildSecurityTxt } from "@/lib/site/security-txt";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildSecurityTxt(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
