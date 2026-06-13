"use client";

import {
  SMOKE_MODE,
  SMOKE_SESSION_COOKIE,
  createSmokeSession,
  clearSmokeSessionWindowName,
  writeSmokeSessionWindowName,
} from "../smoke-session";
import { getSession } from "../auth/session";
import { getFirebaseFirestore } from "./client";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  setDoc,
  updateDoc,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";

type QueryFilter = { field: string; op: "eq" | "neq"; value: unknown };
type QueryOrder = { field: string; ascending?: boolean };
type QueryPayload = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  values?: Record<string, unknown> | Record<string, unknown>[] | null;
  filters?: QueryFilter[];
  order?: QueryOrder;
  limit?: number;
  maybeSingle?: boolean;
  single?: boolean;
  head?: boolean;
  count?: "exact";
};
type QueryResponse = { data: unknown; error: null | { message: string }; count?: number };
type SessionData = Awaited<ReturnType<typeof getSession>>;
type SessionUser = NonNullable<SessionData>["user"];

type ApiResponse<T = unknown> = { data: T; error: null | { message: string }; count?: number };

const firebaseApiBase = "/api/v1";
const pilotStatus = process.env.NEXT_PUBLIC_AIDR_E2E_PILOT_STATUS?.trim() || "approved";
const smokeDebug = process.env.NEXT_PUBLIC_AIDR_E2E_DEBUG === "1";

export const firebaseDbEnvError = null;

function writeSmokeSessionCookie(session: ReturnType<typeof createSmokeSession>) {
  if (typeof document === "undefined") return;
  document.cookie = `${SMOKE_SESSION_COOKIE}=${encodeURIComponent(JSON.stringify(session))}; Path=/; Max-Age=86400; SameSite=Lax`;
  try {
    window.sessionStorage.setItem(SMOKE_SESSION_COOKIE, JSON.stringify(session));
  } catch {}
  writeSmokeSessionWindowName(session);
}

function clearSmokeSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SMOKE_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  try {
    window.sessionStorage.removeItem(SMOKE_SESSION_COOKIE);
  } catch {}
  clearSmokeSessionWindowName();
}

async function getBearerToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

async function invokeApi<T = unknown>(
  action: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  if (SMOKE_MODE) {
    if (smokeDebug && typeof window !== "undefined") {
      console.log(`[aidr-smoke][landing] invoke ${action}`);
    }
    if (action === "pilot-status") return { data: { status: pilotStatus } as T, error: null };
    if (action === "device-start") {
      return {
        data: {
          verification_url: `${window.location.origin}/verify?code=AIDR-SMOKE-1234`,
          user_code: "AIDR-SMOKE-1234",
          device_code: "aidr-smoke-device",
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          interval_seconds: 1,
        } as T,
        error: null,
      };
    }
    if (action === "device-poll") {
      return { data: { status: "authorized", enrollment_token: "aidr-smoke-enrollment" } as T, error: null };
    }
    if (action === "device-verify") return { data: { ok: true } as T, error: null };
    return { data: null as T, error: null };
  }

  const token = await getBearerToken();
  const res = await fetch(`${firebaseApiBase}/${action}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    credentials: "include",
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { data: null as T, error: { message: String(payload.error ?? `Request failed (${res.status})`) } };
  }

  if ("data" in payload || "error" in payload) {
    return payload as ApiResponse<T>;
  }

  return { data: payload as T, error: null };
}

function buildQueryBuilder(table: string) {
  const state: QueryPayload = {
    table,
    action: "select",
    filters: [],
  };

  const builder = {
    select(columns?: string, options?: { count?: "exact"; head?: boolean }) {
      state.action = "select";
      state.columns = columns;
      state.count = options?.count;
      state.head = options?.head;
      return builder;
    },
    insert(values: Record<string, unknown> | Record<string, unknown>[]) {
      state.action = "insert";
      state.values = values;
      return builder.execute();
    },
    update(values: Record<string, unknown>) {
      state.action = "update";
      state.values = values;
      return builder;
    },
    delete() {
      state.action = "delete";
      return builder;
    },
    upsert(
      values: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict?: string }
    ) {
      void options;
      state.action = "upsert";
      state.values = values;
      return builder.execute();
    },
    eq(field: string, value: unknown) {
      state.filters?.push({ field, op: "eq", value });
      return builder;
    },
    neq(field: string, value: unknown) {
      state.filters?.push({ field, op: "neq", value });
      return builder;
    },
    order(field: string, options?: { ascending?: boolean }) {
      state.order = { field, ascending: options?.ascending !== false };
      return builder;
    },
    limit(value: number) {
      state.limit = value;
      return builder;
    },
    maybeSingle() {
      state.maybeSingle = true;
      return builder.execute();
    },
    single() {
      state.single = true;
      return builder.execute();
    },
    async execute(): Promise<QueryResponse> {
      const result = await invokeApi("query", "POST", state as unknown as Record<string, unknown>);
      return result as QueryResponse;
    },
    then<TResult1 = QueryResponse, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ) {
      return builder.execute().then(onfulfilled, onrejected);
    },
  };

  return builder;
}

type FirebaseBrowserClient = {
  from: (table: string) => ReturnType<typeof buildQueryBuilder>;
  auth: {
    getSession: () => Promise<{ data: { session: Awaited<ReturnType<typeof getSession>> }; error: null }>;
    signOut: () => Promise<{ error: null }>;
    signInWithOAuth: (args?: {
      provider?: string;
      options?: {
        redirectTo?: string;
        queryParams?: Record<string, string>;
        scopes?: string;
      };
    }) => Promise<{ data: { provider: string; url: string | null }; error: null }>;
    signInWithOtp: (args?: { options?: { emailRedirectTo?: string } }) => Promise<{ data: { session: null; user: null }; error: null }>;
    signInWithIdToken: (args?: { provider?: string; token?: string }) => Promise<{ data: { session: null; user: null }; error: null }>;
    exchangeCodeForSession: () => Promise<{ data: { session: SessionData; user: SessionUser | null }; error: null }>;
    onAuthStateChange: (
      cb: (event: string, session: SessionData | null) => void
    ) => { data: { subscription: { unsubscribe: () => void } } };
  };
  functions: {
    invoke: (name: string, options?: { method?: "GET" | "POST"; body?: Record<string, unknown> }) => Promise<{ data: unknown; error: null | { message: string } }>;
  };
};

function buildClient(): FirebaseBrowserClient {
  return {
    from(table: string) {
      return buildQueryBuilder(table);
    },
    auth: {
      async getSession() {
        return { data: { session: await getSession() }, error: null };
      },
      async signOut() {
        clearSmokeSessionCookie();
        return { error: null };
      },
      async signInWithOAuth({
        options,
      }: {
        provider?: string;
        options?: { redirectTo?: string; queryParams?: Record<string, string>; scopes?: string };
      } = {}) {
        const redirectTo = options?.redirectTo ?? null;
        if (SMOKE_MODE && redirectTo && typeof window !== "undefined") {
          writeSmokeSessionCookie(createSmokeSession("landing-oauth"));
          window.location.assign(`${redirectTo}?code=aidr-smoke-login`);
        }
        return { data: { provider: "", url: redirectTo }, error: null };
      },
      async signInWithOtp({ options }: { options?: { emailRedirectTo?: string } } = {}) {
        const redirectTo = options?.emailRedirectTo;
        if (SMOKE_MODE && redirectTo && typeof window !== "undefined") {
          writeSmokeSessionCookie(createSmokeSession("landing-magic"));
          window.location.assign(`${redirectTo}?code=aidr-smoke-login`);
        }
        return { data: { session: null, user: null }, error: null };
      },
      async signInWithIdToken() {
        return { data: { session: null, user: null }, error: null };
      },
      async exchangeCodeForSession() {
        const session = await getSession();
        return { data: { session, user: session?.user ?? null }, error: null };
      },
      onAuthStateChange(
        cb: (event: string, session: SessionData | null) => void
      ) {
        void cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    functions: {
      async invoke(name: string, options?: { method?: "GET" | "POST"; body?: Record<string, unknown> }) {
        const result = await invokeApi(name, options?.method ?? "POST", options?.body);
        return { data: result.data, error: result.error };
      },
    },
  };
}

let browserClient: FirebaseBrowserClient | null = null;

export function createBrowserFirebaseClient() {
  return buildClient();
}

export function getFirebaseBrowserClient() {
  if (!browserClient) browserClient = buildClient();
  return browserClient;
}

export function getUserCollectionRef(userId: string, name: string): CollectionReference {
  const db = getFirebaseFirestore();
  if (!db) throw new Error("Firestore not initialized");
  return collection(db, "users", userId, name);
}

export function getUserDocRef(userId: string, ...path: string[]): DocumentReference {
  const db = getFirebaseFirestore();
  if (!db) throw new Error("Firestore not initialized");
  return doc(db, "users", userId, ...path);
}

export { getDoc, getDocs, query, orderBy, limit, where, setDoc, updateDoc };
