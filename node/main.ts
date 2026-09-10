import NodeSqlParser from "node-sql-parser";

const { Parser } = NodeSqlParser;

type Column = {
  name: string;
  type: "integer" | "text";
};

type Table = {
  name: string;
  columns: Column[];
};

type Schema = Table[];

// Every table carries the tenant id field `organization_id`
export const schema: Schema = [
  {
    name: "organizations",
    columns: [
      { name: "id", type: "integer" },
      { name: "organization_id", type: "integer" },
      { name: "name", type: "text" },
    ],
  },
  {
    name: "users",
    columns: [
      { name: "id", type: "integer" },
      { name: "organization_id", type: "integer" },
      { name: "email", type: "text" },
    ],
  },
  {
    name: "projects",
    columns: [
      { name: "id", type: "integer" },
      { name: "organization_id", type: "integer" },
      { name: "owner_id", type: "integer" },
      { name: "title", type: "text" },
    ],
  },
];

const query = `SELECT COUNT(*) FROM users`;

// The tenant column is whatever column shows up on every table (besides `id`).
// Derived from the schema so we don't hardcode a magic string.
function tenantColumn(schema: Schema): string {
  const counts: Record<string, number> = {};
  for (const t of schema) {
    for (const c of t.columns) counts[c.name] = (counts[c.name] ?? 0) + 1;
  }
  const common = Object.keys(counts).filter(
    (n) => counts[n] === schema.length && n !== "id",
  );
  return common[0] ?? "organization_id";
}

// AND two condition nodes together. If there's no existing condition, the new
// one just becomes the condition.
function and(existing: any, next: any): any {
  if (!existing) return next;
  // Force parentheses around the existing condition. Without this, sqlify emits
  // `a OR b AND tenant`, and since AND binds tighter than OR that parses as
  // `a OR (b AND tenant)` — the tenant filter stops guarding the whole clause
  // and rows can leak. `(a OR b) AND tenant` is what we mean.
  existing.parentheses = true;
  return { type: "binary_expr", operator: "AND", left: existing, right: next };
}

// Build `<ref>.<tenantCol> = <tenantId>` as an AST node.
function tenantPredicate(ref: string, col: string, tenantId: number): any {
  return {
    type: "binary_expr",
    operator: "=",
    left: { type: "column_ref", table: ref, column: col },
    right: { type: "number", value: tenantId },
  };
}

// Collect every CTE name defined anywhere in the statement. A `FROM <cte>` is a
// derived table, not a base table — it's already tenant-scoped inside its own
// definition, so we must NOT slap a tenant filter on the outer reference (the
// column may not even be projected out).
function collectCteNames(node: any, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectCteNames(child, names);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.with)) {
    for (const w of node.with) if (w?.name?.value) names.add(w.name.value);
  }
  for (const key of Object.keys(node)) collectCteNames(node[key], names);
}

// Add the tenant filter for every REAL table in this one SELECT's FROM list.
// Base table -> WHERE.  Joined table -> its own ON.
//
// Putting a joined table's filter in ON (instead of WHERE) is the important
// bit: for a LEFT JOIN, a tenant filter in WHERE silently collapses it into an
// INNER JOIN (it drops the NULL-extended rows). In ON it keeps LEFT semantics,
// and for INNER JOIN ON vs WHERE are equivalent — so ON is correct for both.
function scopeSelect(
  node: any,
  col: string,
  tenantId: number,
  cteNames: Set<string>,
): void {
  if (!Array.isArray(node.from)) return; // e.g. SELECT 1 with no FROM

  for (const item of node.from) {
    if (!item.table) continue; // subquery / derived table — scoped on its own
    if (cteNames.has(item.table)) continue; // CTE reference — already scoped
    const ref = item.as || item.table;
    const predicate = tenantPredicate(ref, col, tenantId);

    if (item.join) {
      item.on = and(item.on, predicate);
    } else {
      node.where = and(node.where, predicate);
    }
  }
}

// Walk the whole AST. Every time we land on a SELECT node, scope its own tables.
// Recursing into every child means nested SELECTs — subqueries in WHERE, derived
// tables in FROM, CTEs under `with`, UNION branches — all get visited and scoped.
function walk(
  node: any,
  col: string,
  tenantId: number,
  cteNames: Set<string>,
): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, col, tenantId, cteNames);
    return;
  }
  if (!node || typeof node !== "object") return;

  if (node.type === "select") scopeSelect(node, col, tenantId, cteNames);

  for (const key of Object.keys(node)) walk(node[key], col, tenantId, cteNames);
}

export function main(schema: Schema, query: string, tenantId: number): string {
  const parser = new Parser();
  const opt = { database: "Sqlite" };

  const ast = parser.astify(query, opt);
  const col = tenantColumn(schema);

  const cteNames = new Set<string>();
  collectCteNames(ast, cteNames);

  walk(ast, col, tenantId, cteNames);

  const sql = parser.sqlify(ast, opt);
  return sql;
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] === import.meta.filename) {
  console.log(main(schema, query, 1));
}