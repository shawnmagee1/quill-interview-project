import { DatabaseSync } from "node:sqlite";
import { main, schema } from "./main.ts";
const T = 1;

function seed(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const t of schema) {
    const cols = t.columns.map((c) => `${c.name} ${c.type}`).join(", ");
    db.exec(`CREATE TABLE ${t.name} (${cols})`);
  }
  db.exec(`INSERT INTO organizations (id,organization_id,name) VALUES (1,1,'O1'),(2,2,'O2'),(3,3,'O3')`);
  db.exec(`INSERT INTO users (id,organization_id,email) VALUES
    (10,1,'a@o1'),(11,1,'b@o1'),(20,2,'a@o2'),(21,2,'b@o2'),(30,3,'a@o3')`);
  db.exec(`INSERT INTO projects (id,organization_id,owner_id,title) VALUES
    (100,1,10,'P1-own10'),(101,1,20,'P1-own20-CROSS'),(200,2,20,'P2-own20'),(300,3,30,'P3-own30')`);
  return db;
}
const db = seed();

const queries: [string,string][] = [
  ["CTE + JOIN + subquery all at once",
   `WITH team AS (SELECT id, email FROM users)
    SELECT t.email, p.title
    FROM team t
    JOIN projects p ON p.owner_id = t.id
    WHERE p.id IN (SELECT id FROM projects WHERE owner_id = t.id)`],
  ["CTE referencing another CTE",
   `WITH a AS (SELECT * FROM users),
         b AS (SELECT * FROM a)
    SELECT COUNT(*) AS n FROM b`],
  ["derived table in FROM, joined to real table",
   `SELECT u.email, x.title
    FROM users u
    JOIN (SELECT owner_id, title FROM projects) x ON x.owner_id = u.id`],
  ["scalar subquery in SELECT list",
   `SELECT p.title,
      (SELECT email FROM users WHERE users.id = p.owner_id) AS owner_email
    FROM projects p`],
  ["UNION of two scoped selects",
   `SELECT email FROM users UNION SELECT title FROM projects`],
  ["LEFT JOIN onto a derived table",
   `SELECT u.email, d.title
    FROM users u
    LEFT JOIN (SELECT owner_id, title FROM projects) d ON d.owner_id = u.id`],
  ["GROUP BY + HAVING + correlated subquery",
   `SELECT p.owner_id, COUNT(*) c
    FROM projects p
    GROUP BY p.owner_id
    HAVING COUNT(*) >= (SELECT 1)`],
  ["self-join through a CTE",
   `WITH u AS (SELECT * FROM users)
    SELECT a.email, b.email FROM u a JOIN u b ON a.id < b.id`],
];

for (const [label, q] of queries) {
  console.log("\n### " + label);
  try {
    const scoped = main(schema, q, T);
    console.log("SCOPED: " + scoped.replace(/\s+/g, " "));
    try {
      const rows = db.prepare(scoped).all();
      console.log("ROWS  : " + JSON.stringify(rows));
    } catch (e) {
      console.log("RUN-ERR: " + (e as Error).message);
    }
  } catch (e) {
    console.log("REWRITE-ERR: " + (e as Error).message);
  }
}
