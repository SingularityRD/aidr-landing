import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "14-day evaluation",
  description: "Apply for the 14-day, 1-agent Singularity AIDR evaluation. Access is by application and approval.",
  path: "/pilot",
});

export default function PilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
