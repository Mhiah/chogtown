import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A tiny document store: collections of JSON documents keyed by id.
 * Uses Supabase (table `docs`, see supabase/schema.sql) when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set, otherwise an in-memory map that lasts for
 * the life of the server process (fine for local dev and demos).
 */
export interface Store {
  get<T>(col: string, id: string): Promise<T | null>;
  set<T>(col: string, id: string, data: T): Promise<void>;
  list<T>(col: string, limit?: number): Promise<T[]>;
  del(col: string, id: string): Promise<void>;
}

type Row = { data: unknown; at: number };

class MemoryStore implements Store {
  private m = new Map<string, Map<string, Row>>();
  private c(col: string) {
    let x = this.m.get(col);
    if (!x) this.m.set(col, (x = new Map()));
    return x;
  }
  async get<T>(col: string, id: string) {
    const r = this.c(col).get(id);
    return r ? (structuredClone(r.data) as T) : null;
  }
  async set<T>(col: string, id: string, data: T) {
    this.c(col).set(id, { data: structuredClone(data), at: Date.now() });
  }
  async list<T>(col: string, limit = 500) {
    return [...this.c(col).values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map((r) => structuredClone(r.data) as T);
  }
  async del(col: string, id: string) {
    this.c(col).delete(id);
  }
}

class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}
  async get<T>(col: string, id: string) {
    const { data, error } = await this.db.from("docs").select("data").eq("col", col).eq("id", id).maybeSingle();
    if (error) throw error;
    return (data?.data as T) ?? null;
  }
  async set<T>(col: string, id: string, data: T) {
    const { error } = await this.db.from("docs").upsert({ col, id, data, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  async list<T>(col: string, limit = 500) {
    const { data, error } = await this.db.from("docs").select("data").eq("col", col).order("updated_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => r.data as T);
  }
  async del(col: string, id: string) {
    const { error } = await this.db.from("docs").delete().eq("col", col).eq("id", id);
    if (error) throw error;
  }
}

const g = globalThis as unknown as { __chogStore?: Store };

export function store(): Store {
  if (!g.__chogStore) {
    const raw = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    // Accept the URL as copied from any Supabase page, e.g. with /rest/v1/ on the end.
    let url = raw;
    try { if (raw) url = new URL(raw).origin; } catch { /* keep as given */ }
    g.__chogStore = url && key ? new SupabaseStore(createClient(url, key, { auth: { persistSession: false } })) : new MemoryStore();
  }
  return g.__chogStore;
}
