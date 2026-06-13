"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
}

interface AuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
}

export const AuthContext = createContext<AuthContextValue>({
  isLoaded: true,
  isSignedIn: false,
  user: null,
});

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}

interface DemoAuthProviderProps {
  children: ReactNode;
}

export function DemoAuthProvider({ children }: DemoAuthProviderProps) {
  const value = useMemo(
    () => ({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: "demo-user-001",
        email: "demo@aidr.local",
        firstName: "Demo",
        lastName: "User",
        fullName: "Demo User",
        imageUrl: "",
      },
    }),
    []
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
