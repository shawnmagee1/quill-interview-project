import sqlglot
from typing import Literal, TypedDict


class Column(TypedDict):
    name: str
    type: Literal["integer", "text"]


class Table(TypedDict):
    name: str
    columns: list[Column]


Schema = list[Table]

schema: Schema = [
    {
        "name": "organizations",
        "columns": [
            {"name": "id", "type": "integer"},
            {"name": "organization_id", "type": "integer"},
            {"name": "name", "type": "text"},
        ],
    },
    {
        "name": "users",
        "columns": [
            {"name": "id", "type": "integer"},
            {"name": "organization_id", "type": "integer"},
            {"name": "email", "type": "text"},
        ],
    },
    {
        "name": "projects",
        "columns": [
            {"name": "id", "type": "integer"},
            {"name": "organization_id", "type": "integer"},
            {"name": "owner_id", "type": "integer"},
            {"name": "title", "type": "text"},
        ],
    },
]

query = "SELECT COUNT(*) FROM users"


def main(schema: Schema, query: str, tenant_id: int) -> str:
    ast = sqlglot.parse_one(query, read="sqlite")
    sql = ast.sql(dialect="sqlite")

    return sql


if __name__ == "__main__":
    print(main(schema, query, 1))
