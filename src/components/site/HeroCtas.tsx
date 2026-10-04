"use client";

import Link from "next/link";
import { useSmartUser } from "@/hooks/useSmartUser";

/** Auth-aware calls to action. Signed-in visitors go to the dashboard; others to the evaluation application. */
export default function HeroCtas({ secondaryHref, secondaryLabel }: { secondaryHref: string; secondaryLabel: string }) {
  const { isSignedIn, isLoaded } = useSmartUser();
  return (
    <div className="btn-row">
      {isLoaded && isSignedIn ? (
        <Link href="/dashboard" className="btn">
          Go to the dashboard
        </Link>
      ) : (
        <Link href="/pilot" className="btn">
          Apply for the 14-day evaluation
        </Link>
      )}
      <Link href={secondaryHref} className="btn btn-secondary">
        {secondaryLabel}
      </Link>
    </div>
  );
}
