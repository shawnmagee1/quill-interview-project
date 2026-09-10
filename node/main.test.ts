import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { main, schema } from "./main.ts";

const TENANT_ID = 1;

function seedDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");

  for (const table of schema) {
    const columns = table.columns.map((c) => `${c.name} ${c.type}`).join(", ");
    db.exec(`CREATE TABLE ${table.name} (${columns})`);
  }

  for (const organizationId of [1, 2, 3, 4, 5]) {
    db.exec(`INSERT INTO organizations (id, organization_id, name)
             VALUES (${organizationId}, ${organizationId}, 'Org ${organizationId}')`);

    for (let i = 0; i < 2; i++) {
      const userId = organizationId * 10 + i;
      db.exec(`INSERT INTO users (id, organization_id, email)
               VALUES (${userId}, ${organizationId}, 'user${userId}@example.com')`);
    }
  }

  return db;
}

test("SELECT COUNT(*) only counts rows belonging to the tenant", () => {
  const db = seedDatabase();

  const scopedSql = main(schema, "SELECT COUNT(*) FROM users", TENANT_ID);
  const [row] = db.prepare(scopedSql).all() as Record<string, number>[];

  const expected = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE organization_id = ?")
    .get(TENANT_ID) as { count: number };

  assert.equal(Object.values(row)[0], expected.count);
  assert.equal(expected.count, 2);
});

// ---------------------------------------------------------------------------
// Additional coverage: joins, subqueries, CTEs, and the OR-precedence leak.
// Seeds a cross-tenant trap (a tenant-1 project whose owner lives in tenant 2)
// so a scoping mistake shows up as a leaked row rather than passing silently.
// ---------------------------------------------------------------------------

function seedFull(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const table of schema) {
    const columns = table.columns.map((c) => `${c.name} ${c.type}`).join(", ");
    db.exec(`CREATE TABLE ${table.name} (${columns})`);
  }
  db.exec(`INSERT INTO users (id, organization_id, email) VALUES
    (10,1,'a@o1'),(11,1,'b@o1'),(20,2,'a@o2'),(21,2,'b@o2')`);
  db.exec(`INSERT INTO projects (id, organization_id, owner_id, title) VALUES
    (100,1,10,'P1-own10'),(101,1,20,'P1-own20-CROSS'),(200,2,20,'P2-own20')`);
  return db;
}

test("OR in WHERE cannot leak across tenants (precedence regression)", () => {
  const db = seedFull();
  // Both target rows belong to org 2; as tenant 1 this must return nothing.
  const sql = main(schema, "SELECT email FROM users WHERE email = 'a@o2' OR email = 'b@o2'", 1);
  const rows = db.prepare(sql).all();
  assert.equal(rows.length, 0);
});

test("INNER JOIN scopes both sides — no cross-tenant match", () => {
  const db = seedFull();
  const sql = main(schema,
    "SELECT p.title, u.email FROM projects p JOIN users u ON u.id = p.owner_id", 1);
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  // project 101 (owner in org 2) must not join to an org-2 user
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "a@o1");
});

test("LEFT JOIN keeps its rows but nulls the cross-tenant side", () => {
  const db = seedFull();
  const sql = main(schema,
    "SELECT p.title, u.email FROM projects p LEFT JOIN users u ON u.id = p.owner_id", 1);
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  // both org-1 projects kept; the cross-tenant owner is NULL, not leaked
  assert.equal(rows.length, 2);
  const cross = rows.find((r) => r.title === "P1-own20-CROSS");
  assert.equal(cross?.email, null);
});

test("subquery in WHERE is scoped independently", () => {
  const db = seedFull();
  const sql = main(schema,
    "SELECT title FROM projects WHERE owner_id IN (SELECT id FROM users)", 1);
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  // owner 20 is an org-2 user, so it must be filtered out of the subquery
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "P1-own10");
});

test("CTE body is scoped and the outer reference is left alone", () => {
  const db = seedFull();
  const sql = main(schema,
    "WITH mine AS (SELECT * FROM projects) SELECT COUNT(*) AS n FROM mine", 1);
  const [row] = db.prepare(sql).all() as { n: number }[];
  assert.equal(row.n, 2); // only org-1 projects
});