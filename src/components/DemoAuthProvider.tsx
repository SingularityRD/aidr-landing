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

/** True only where a working auth provider (Clerk) is mounted; sign-in UI must not render otherwise. */
export const AuthAvailableContext = createContext<boolean>(false);

/** Marks a subtree as having a working auth provider. A component, because server layouts cannot touch a client context object. */
export function AuthAvailableProvider({ children }: { children: ReactNode }) {
  return <AuthAvailableContext.Provider value={true}>{children}</AuthAvailableContext.Provider>;
}

export function useAuthAvailable(): boolean {
  return useContext(AuthAvailableContext);
}

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

  return (
    <AuthAvailableContext.Provider value={true}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </AuthAvailableContext.Provider>
  );
}
