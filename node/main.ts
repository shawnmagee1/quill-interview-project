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

export function main(schema: Schema, query: string, tenantId: number): string {
  const parser = new Parser();
  const opt = { database: "Sqlite" };

  const ast = parser.astify(query, opt);
  // TODO: gurantee tenant scoping on the query.
  const sql = parser.sqlify(ast, opt);

  return sql;
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] === import.meta.filename) {
  console.log(main(schema, query, 1));
}
