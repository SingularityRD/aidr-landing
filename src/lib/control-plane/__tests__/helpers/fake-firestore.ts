/**
 * Minimal in-memory Firestore (Admin SDK subset) used by the control-plane
 * contract tests. It models only what the control plane touches, and is strict
 * where Firestore is strict so tests catch real bugs:
 *  - `update()` on a missing document throws (NOT_FOUND),
 *  - a transaction read after a write throws,
 *  - transaction writes are buffered and applied atomically on commit.
 */

type Data = Record<string, unknown>;

function clone<T>(value: T): T {
  // FieldValue sentinels are plain-ish objects; structuredClone keeps them usable as data.
  return structuredClone(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b;
}

export class FakeDocRef {
  constructor(
    readonly store: FakeFirestore,
    readonly path: string,
  ) {}

  get id() {
    return this.path.split("/").at(-1) as string;
  }

  get parent(): FakeCollectionRef {
    return new FakeCollectionRef(this.store, this.path.split("/").slice(0, -1).join("/"));
  }

  async get() {
    return this.store.snapshot(this.path);
  }

  async set(data: Data, options?: { merge?: boolean }) {
    this.store.write(this.path, data, options?.merge === true);
  }

  async create(data: Data) {
    if (this.store.docs.has(this.path)) throw new Error("ALREADY_EXISTS");
    this.store.write(this.path, data, false);
  }

  async update(data: Data) {
    if (!this.store.docs.has(this.path)) throw new Error(`NOT_FOUND: ${this.path}`);
    this.store.write(this.path, data, true);
  }

  async delete() {
    this.store.docs.delete(this.path);
  }
}

export class FakeCollectionRef {
  constructor(
    readonly store: FakeFirestore,
    readonly path: string,
  ) {}

  get id() {
    return this.path.split("/").at(-1) as string;
  }

  /** Parent document, or null for a root collection (Admin SDK semantics). */
  get parent(): FakeDocRef | null {
    const segments = this.path.split("/");
    return segments.length > 1 ? new FakeDocRef(this.store, segments.slice(0, -1).join("/")) : null;
  }

  doc(id?: string) {
    return new FakeDocRef(this.store, `${this.path}/${id ?? this.store.nextId()}`);
  }

  async add(data: Data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.store, () => this.store.childrenOf(this.path)).where(field, op, value);
  }

  orderBy() {
    return new FakeQuery(this.store, () => this.store.childrenOf(this.path));
  }

  limit(n: number) {
    return new FakeQuery(this.store, () => this.store.childrenOf(this.path)).limit(n);
  }

  async get() {
    return new FakeQuery(this.store, () => this.store.childrenOf(this.path)).get();
  }
}

export class FakeQuery {
  private readonly filters: Array<[string, string, unknown]> = [];
  private max = Number.POSITIVE_INFINITY;

  constructor(
    private readonly store: FakeFirestore,
    private readonly source: () => string[],
  ) {}

  where(field: string, op: string, value: unknown) {
    this.filters.push([field, op, value]);
    return this;
  }

  orderBy() {
    return this;
  }

  limit(n: number) {
    this.max = n;
    return this;
  }

  async get() {
    const docs = this.source()
      .filter((path) => {
        const data = this.store.docs.get(path) as Data;
        return this.filters.every(([field, op, value]) => {
          const actual = data[field];
          if (op === "==") return sameValue(actual, value);
          if (op === "<=") return typeof actual === "string" && typeof value === "string" && actual <= value;
          throw new Error(`unsupported operator ${op}`);
        });
      })
      .slice(0, this.max)
      .map((path) => this.store.snapshot(path));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

type TxWrite = { kind: "set" | "update"; path: string; data: Data; merge: boolean };

export class FakeFirestore {
  readonly docs = new Map<string, Data>();
  private counter = 0;

  nextId() {
    this.counter += 1;
    return `auto${this.counter.toString().padStart(6, "0")}`;
  }

  snapshot(path: string) {
    const data = this.docs.get(path);
    return {
      id: path.split("/").at(-1) as string,
      exists: data !== undefined,
      ref: new FakeDocRef(this, path),
      data: () => (data ? clone(data) : undefined),
    };
  }

  write(path: string, data: Data, merge: boolean) {
    const next = merge ? { ...(this.docs.get(path) ?? {}), ...clone(data) } : clone(data);
    this.docs.set(path, next);
  }

  childrenOf(collectionPath: string): string[] {
    const prefix = `${collectionPath}/`;
    return [...this.docs.keys()].filter(
      (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"),
    );
  }

  collection(path: string) {
    return new FakeCollectionRef(this, path);
  }

  doc(path: string) {
    return new FakeDocRef(this, path);
  }

  collectionGroup(name: string) {
    return new FakeQuery(this, () =>
      [...this.docs.keys()].filter((path) => path.split("/").at(-2) === name),
    );
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const tx = new FakeTransaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }

  /** Test helper: seed a document without going through the app. */
  seed(path: string, data: Data) {
    this.docs.set(path, clone(data));
  }

  /** Test helper: read a stored document (undefined when absent). */
  peek(path: string): Data | undefined {
    const data = this.docs.get(path);
    return data ? clone(data) : undefined;
  }
}

export class FakeTransaction {
  private readonly writes: TxWrite[] = [];

  constructor(private readonly store: FakeFirestore) {}

  async get(target: FakeDocRef | FakeQuery) {
    if (this.writes.length > 0) {
      throw new Error("Firestore transactions require all reads to be executed before all writes");
    }
    return target instanceof FakeDocRef ? target.get() : target.get();
  }

  set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }) {
    this.writes.push({ kind: "set", path: ref.path, data, merge: options?.merge === true });
  }

  update(ref: FakeDocRef, data: Data) {
    this.writes.push({ kind: "update", path: ref.path, data, merge: true });
  }

  commit() {
    for (const write of this.writes) {
      if (write.kind === "update" && !this.store.docs.has(write.path)) {
        throw new Error(`NOT_FOUND: ${write.path}`);
      }
      this.store.write(write.path, write.data, write.merge);
    }
  }
}
