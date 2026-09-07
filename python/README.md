## Inputs

- a tenant-scoped SQLite schema
- a SQLite query pointing to that exact SQLite schema
- a valid tenant id

## Output

- a SQLite query that guarantees that the only rows that can be returned from the query belong to that tenant id

## Dependencies

- sqlglot
