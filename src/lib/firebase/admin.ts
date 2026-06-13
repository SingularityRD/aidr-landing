import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { isDemoMode } from "@/lib/demo";

function normalizePrivateKey(value: string | undefined) {
  return value?.replace(/\\n/g, "\n");
}

function getServiceAccountConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  return { projectId, clientEmail, privateKey };
}

function hasServiceAccountConfig(config: ReturnType<typeof getServiceAccountConfig>) {
  return Boolean(config.projectId && config.clientEmail && config.privateKey);
}

function createMockFirestore(): Firestore {
  const docs = new Map<string, Record<string, unknown>>();

  function snap(path: string, id: string) {
    const data = docs.get(path);
    return { exists: Boolean(data), data: () => data ?? null, id, ref: docRef(path) };
  }

  function docRef(path: string) {
    const id = path.split("/").at(-1) ?? "demo";
    return {
      id,
      get: async () => snap(path, id),
      set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
        docs.set(path, { ...(options?.merge ? docs.get(path) ?? {} : {}), ...data });
      },
      update: async (data: Record<string, unknown>) => {
        docs.set(path, { ...(docs.get(path) ?? {}), ...data });
      },
      delete: async () => {
        docs.delete(path);
      },
    };
  }

  function collectionRef(collectionPath: string) {
    const queryDocs = (field?: string, op?: string, value?: unknown, max = Number.POSITIVE_INFINITY) => {
      const prefix = `${collectionPath}/`;
      const matches = Array.from(docs.entries())
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
        .filter(([, data]) => {
          if (!field) return true;
          if (op === "==") return data[field] === value;
          if (op === "<=") return String(data[field] ?? "") <= String(value ?? "");
          return true;
        })
        .slice(0, max)
        .map(([path]) => snap(path, path.slice(prefix.length)));
      return { docs: matches, empty: matches.length === 0, size: matches.length };
    };

    return {
      doc: (id = `demo-doc-${docs.size + 1}`) => docRef(`${collectionPath}/${id}`),
      where: (field: string, op: string, value: unknown) => ({
        limit: (max: number) => ({ get: async () => queryDocs(field, op, value, max) }),
        get: async () => queryDocs(field, op, value),
      }),
      orderBy: () => ({ limit: (max: number) => ({ get: async () => queryDocs(undefined, undefined, undefined, max) }) }),
      get: async () => queryDocs(),
      add: async (data: Record<string, unknown>) => {
        const ref = docRef(`${collectionPath}/demo-doc-${docs.size + 1}`);
        await ref.set(data);
        return { id: ref.id };
      },
    };
  }

  return {
    collection: collectionRef,
    batch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
    doc: (path: string) => docRef(path),
    runTransaction: async <T,>(fn: (tx: {
      get: (ref: ReturnType<typeof docRef>) => Promise<ReturnType<typeof snap>>;
      set: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
      update: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>) => void;
      delete: (ref: ReturnType<typeof docRef>) => void;
    }) => Promise<T>) =>
      fn({
        get: async (ref) => ref.get(),
        set: (ref, data, options) => {
          void ref.set(data, options);
        },
        update: (ref, data) => {
          void ref.update(data);
        },
        delete: (ref) => {
          void ref.delete();
        },
      }),
  } as unknown as Firestore;
}

function createMockAuth(): Auth {
  const demoUser = { uid: "demo-user-001", email: "demo@aidr.local" };
  return {
    verifyIdToken: async () => demoUser as unknown as Awaited<ReturnType<Auth["verifyIdToken"]>>,
    getUser: async () => demoUser as unknown as Awaited<ReturnType<Auth["getUser"]>>,
    createUser: async () => demoUser as unknown as Awaited<ReturnType<Auth["createUser"]>>,
    updateUser: async () => demoUser as unknown as Awaited<ReturnType<Auth["updateUser"]>>,
    deleteUser: async () => {},
    setCustomUserClaims: async () => {},
    listUsers: async () => ({ users: [] }) as unknown as Awaited<ReturnType<Auth["listUsers"]>>,
  } as unknown as Auth;
}

let adminAuth: Auth;
let adminDb: Firestore;
let firebaseAdminEnvError: string | null;

if (isDemoMode()) {
  adminAuth = createMockAuth();
  adminDb = createMockFirestore();
  firebaseAdminEnvError = null;
} else {
  const serviceAccount = getServiceAccountConfig();
  const hasServiceAccount = hasServiceAccountConfig(serviceAccount);

  let shouldUseMockServices = false;
  if (!hasServiceAccount) {
    firebaseAdminEnvError = "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY for server-side Firebase Admin.";
    shouldUseMockServices = true;
  } else {
    try {
      if (!getApps().length) {
        initializeApp({
          credential: cert({
            projectId: serviceAccount.projectId!,
            clientEmail: serviceAccount.clientEmail!,
            privateKey: serviceAccount.privateKey!,
          }),
          projectId: serviceAccount.projectId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      firebaseAdminEnvError = `Firebase Admin initialization failed: ${message}`;
      shouldUseMockServices = true;
    }
  }

  if (shouldUseMockServices) {
    adminAuth = createMockAuth();
    adminDb = createMockFirestore();
  } else {
    adminAuth = getAuth();
    adminDb = getFirestore();
    firebaseAdminEnvError = null;
  }
}

export { adminAuth, adminDb, firebaseAdminEnvError };
