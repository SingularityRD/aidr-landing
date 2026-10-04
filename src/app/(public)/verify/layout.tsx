import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Authorize a device",
  description: "Approve a device enrollment code for Singularity AIDR.",
  path: "/verify",
  noindex: true,
});

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
