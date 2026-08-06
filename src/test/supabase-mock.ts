/**
 * Minimal in-memory stand-in for the Supabase admin client used by the
 * server modules under test. It implements only the query surface the
 * production code actually uses, with real filtering semantics so tests
 * exercise logic rather than stubs.
 */

type Row = Record<string, any>;

interface Filter {
  op: "eq" | "neq" | "in" | "is" | "gte" | "lte";
  col: string;
  val: any;
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case "eq":
      return v === f.val;
    case "neq":
      return v !== f.val;
    case "in":
      return (f.val as any[]).includes(v);
    case "is":
      return f.val === null ? v === null || v === undefined : v === f.val;
    case "gte":
      return String(v) >= String(f.val);
    case "lte":
      return String(v) <= String(f.val);
  }
}

let idCounter = 0;
export function uuid() {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

export class MockDb {
  tables: Record<string, Row[]> = {};
  /** Columns treated as unique per table, used to emulate 23505. */
  unique: Record<string, string[][]> = {
    payment_events: [["provider", "event_key"]],
    ops_tasks: [["dedupe_key"]],
    recovery_workflows: [["dedupe_key"]],
    sla_timers: [["sla_type", "entity", "entity_id"]],
  };

  seed(table: string, rows: Row[]) {
    this.tables[table] = [...(this.tables[table] ?? []), ...rows.map((r) => ({ ...r }))];
  }

  rows(table: string): Row[] {
    this.tables[table] ??= [];
    return this.tables[table];
  }

  reset() {
    this.tables = {};
  }

  from(table: string) {
    return new MockQuery(this, table);
  }

  rpc(_fn: string, _args: Row) {
    return Promise.resolve({ data: null, error: null });
  }
}

class MockQuery implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private conflict: string[] = [];
  private headOnly = false;
  private wantCount = false;
  private limitN: number | null = null;
  private orderCol: string | null = null;
  private orderAsc = true;

  constructor(
    private db: MockDb,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode === "select") this.mode = "select";
    if (opts?.head) this.headOnly = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push({ op: "neq", col, val });
    return this;
  }
  in(col: string, val: any[]) {
    this.filters.push({ op: "in", col, val });
    return this;
  }
  is(col: string, val: any) {
    this.filters.push({ op: "is", col, val });
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push({ op: "gte", col, val });
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push({ op: "lte", col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.conflict = opts?.onConflict?.split(",").map((s) => s.trim()) ?? ["id"];
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  private filtered(): Row[] {
    let rows = this.db.rows(this.table).filter((r) => this.filters.every((f) => matches(r, f)));
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const x = a[col] ?? "";
        const y = b[col] ?? "";
        return this.orderAsc ? (x > y ? 1 : x < y ? -1 : 0) : x > y ? -1 : x < y ? 1 : 0;
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private uniqueViolation(row: Row): boolean {
    const sets = this.db.unique[this.table] ?? [];
    return sets.some(
      (cols) =>
        cols.every((c) => row[c] !== undefined && row[c] !== null) &&
        this.db.rows(this.table).some((r) => cols.every((c) => r[c] === row[c])),
    );
  }

  private run(): { data: any; error: any; count?: number } {
    if (this.mode === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const created: Row[] = [];
      for (const p of list) {
        const row = { id: p['id'] ?? uuid(), created_at: new Date().toISOString(), ...p };
        if (this.uniqueViolation(row)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        this.db.rows(this.table).push(row);
        created.push(row);
      }
      return { data: created, error: null };
    }
    if (this.mode === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const out: Row[] = [];
      for (const p of list) {
        const existing = this.db
          .rows(this.table)
          .find((r) => this.conflict.every((c) => r[c] === p[c]));
        if (existing) {
          Object.assign(existing, p);
          out.push(existing);
        } else {
          const row = { id: p['id'] ?? uuid(), created_at: new Date().toISOString(), ...p };
          this.db.rows(this.table).push(row);
          out.push(row);
        }
      }
      return { data: out, error: null };
    }
    if (this.mode === "update") {
      const rows = this.filtered();
      rows.forEach((r) => Object.assign(r, this.payload));
      return { data: rows, error: null };
    }
    if (this.mode === "delete") {
      const rows = this.filtered();
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !rows.includes(r));
      return { data: rows, error: null };
    }
    const rows = this.filtered();
    if (this.headOnly) return { data: null, error: null, count: rows.length };
    return { data: rows, error: null, count: this.wantCount ? rows.length : undefined };
  }

  async maybeSingle() {
    const res = this.run();
    const rows = (res.data as Row[]) ?? [];
    return { data: rows[0] ?? null, error: res.error };
  }
  async single() {
    const res = this.run();
    const rows = (res.data as Row[]) ?? [];
    if (res.error) return { data: null, error: res.error };
    if (rows.length === 0) return { data: null, error: { code: "PGRST116", message: "no rows" } };
    return { data: rows[0], error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export const mockDb = new MockDb();
export const supabaseAdminMock = {
  from: (t: string) => mockDb.from(t),
  rpc: (fn: string, args: Row) => mockDb.rpc(fn, args),
};