import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Waitlist",
  description: "Join the Singularity AIDR waitlist for evaluation updates.",
  path: "/waitlist",
});

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
