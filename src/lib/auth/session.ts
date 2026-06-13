import { onAuthStateChanged } from "firebase/auth";
import { SMOKE_MODE, readSmokeSessionCookie } from "@/lib/smoke-session";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isDemoMode } from "@/lib/demo";

export type AppSession = {
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  user: {
    id: string;
    email: string | null;
    created_at?: string;
    user_metadata?: {
      provider_id?: string;
      github_id?: string;
      name?: string;
      picture?: string;
    };
  };
};

function waitForAuthInit() {
  const auth = getFirebaseAuth();
  if (!auth) return Promise.resolve<ReturnType<typeof getFirebaseAuth>>(null);

  if (auth.currentUser) return Promise.resolve(auth);

  return new Promise<typeof auth>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve(auth);
    });
  });
}

function getRefreshTokenFromUser(user: {
  refreshToken?: string;
  stsTokenManager?: { refreshToken?: string };
}) {
  return user.refreshToken || user.stsTokenManager?.refreshToken || "";
}

export async function getSession(): Promise<AppSession | null> {
  // Demo mode: return a synthetic session so the dashboard works out-of-the-box
  if (isDemoMode()) {
    return {
      access_token: "demo-token",
      refresh_token: "demo-refresh",
      expires_at: null,
      user: {
        id: "demo-user-001",
        email: "demo@aidr.local",
        created_at: new Date().toISOString(),
        user_metadata: {
          name: "Demo User",
          picture: undefined,
        },
      },
    };
  }

  if (SMOKE_MODE && typeof document !== "undefined") {
    const smoke = readSmokeSessionCookie(document.cookie);
    if (smoke) return smoke;
  }

  const auth = await waitForAuthInit();
  if (!auth?.currentUser) return null;

  const user = auth.currentUser;
  const tokenResult = await user.getIdTokenResult();
  const refreshToken = getRefreshTokenFromUser(
    user as unknown as { refreshToken?: string; stsTokenManager?: { refreshToken?: string } }
  );

  return {
    access_token: tokenResult.token,
    refresh_token: refreshToken,
    expires_at: tokenResult.expirationTime ?? null,
    user: {
      id: user.uid,
      email: user.email,
      created_at: user.metadata?.creationTime ?? new Date().toISOString(),
      user_metadata: {
        provider_id: undefined,
        github_id: undefined,
        name: user.displayName ?? undefined,
        picture: user.photoURL ?? undefined,
      },
    },
  };
}

export async function signOut() {
  if (isDemoMode()) return;
  const auth = getFirebaseAuth();
  if (!auth) return;
  await auth.signOut();
}
