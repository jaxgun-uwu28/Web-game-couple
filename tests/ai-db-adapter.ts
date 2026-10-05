// A minimal Supabase-shaped adapter over real local Postgres for orchestration tests.
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
export function aiTestDb(pg: PGlite): SupabaseClient {
  const ident = (s: string) => {
    if (!/^[a-z_]+$/.test(s)) throw new Error("Test identifier");
    return s;
  };
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let fields = "*",
      single = false,
      limit = 10000;
    const order: string[] = [];
    let write: Record<string, unknown>[] | null = null,
      conflict = false;
    const run = async () => {
      try {
        if (write) {
          for (const row of write) {
            const keys = Object.keys(row);
            await pg.query(
              `insert into ${ident(table)}(${keys.map(ident).join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")})${conflict ? " on conflict(topic,hash) do nothing" : ""}`,
              Object.values(row),
            );
          }
          return { data: null, error: null };
        }
        const cols =
          fields === "*" ? "*" : fields.split(",").map(ident).join(",");
        const clauses = filters.map(
          ([k], i) =>
            `${k === "state->>status" ? "state->>'status'" : ident(k)}=$${i + 1}`,
        );
        const result = await pg.query(
          `select ${cols} from ${ident(table)}${clauses.length ? " where " + clauses.join(" and ") : ""}${order.length ? " order by " + order.join(",") : ""} limit ${limit}`,
          filters.map((x) => x[1]),
        );
        const rows = result.rows.map((row) =>
          Object.fromEntries(
            Object.entries(row as Record<string, unknown>).map(([k, v]) => [
              k,
              v instanceof Date
                ? k === "date"
                  ? v.toISOString().slice(0, 10)
                  : v.toISOString()
                : v,
            ]),
          ),
        );
        return { data: single ? rows[0] || null : rows, error: null };
      } catch (error) {
        return { data: null, error };
      }
    };
    const q = {
      select: (s = "*") => {
        fields = s;
        return q;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      order: (k: string, opt?: { ascending?: boolean }) => {
        order.push(ident(k) + (opt?.ascending === false ? " desc" : " asc"));
        return q;
      },
      limit: (n: number) => {
        limit = n;
        return q;
      },
      single: () => {
        single = true;
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      insert: (r: Record<string, unknown>[]) => {
        write = r;
        return q;
      },
      upsert: (r: Record<string, unknown>[]) => {
        write = r;
        conflict = true;
        return q;
      },
      then: (resolve: unknown, reject: unknown) =>
        run().then(resolve as never, reject as never),
    };
    return q;
  };
  return {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      try {
        const keys = Object.keys(args);
        const result = await pg.query<{ v: unknown }>(
          `select to_jsonb(public.${ident(name)}(${keys.map((k, i) => ident(k) + "=>$" + (i + 1)).join(",")})) v`,
          Object.values(args),
        );
        return { data: result.rows[0].v, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  } as unknown as SupabaseClient;
}
