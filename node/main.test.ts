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
