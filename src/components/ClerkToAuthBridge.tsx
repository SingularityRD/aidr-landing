"use client";

import { useUser } from "@clerk/nextjs";
import { useMemo, type ReactNode } from "react";
import { AuthContext } from "./DemoAuthProvider";

interface ClerkToAuthBridgeProps {
  children: ReactNode;
}

export function ClerkToAuthBridge({ children }: ClerkToAuthBridgeProps) {
  const clerk = useUser();

  const value = useMemo(() => {
    if (!clerk.isLoaded) {
      return { isLoaded: false as const, isSignedIn: false, user: null };
    }
    if (!clerk.isSignedIn || !clerk.user) {
      return { isLoaded: true as const, isSignedIn: false as const, user: null };
    }
    const primaryEmail = clerk.user.primaryEmailAddress?.emailAddress ?? "";
    return {
      isLoaded: true as const,
      isSignedIn: true as const,
      user: {
        id: clerk.user.id,
        email: primaryEmail,
        firstName: clerk.user.firstName,
        lastName: clerk.user.lastName,
        fullName: clerk.user.fullName,
        imageUrl: clerk.user.imageUrl,
      },
    };
  }, [clerk.isLoaded, clerk.isSignedIn, clerk.user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
