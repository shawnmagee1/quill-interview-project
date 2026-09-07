import sqlite3
import unittest

from main import main, schema

TENANT_ID = 1


def seed_database() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")

    for table in schema:
        columns = ", ".join(f"{c['name']} {c['type']}" for c in table["columns"])
        db.execute(f"CREATE TABLE {table['name']} ({columns})")

    for organization_id in [1, 2, 3, 4, 5]:
        db.execute(
            "INSERT INTO organizations (id, organization_id, name) VALUES (?, ?, ?)",
            (organization_id, organization_id, f"Org {organization_id}"),
        )

        for i in range(2):
            user_id = organization_id * 10 + i
            db.execute(
                "INSERT INTO users (id, organization_id, email) VALUES (?, ?, ?)",
                (user_id, organization_id, f"user{user_id}@example.com"),
            )

    return db


class TestTenantScoping(unittest.TestCase):
    def test_select_count_only_counts_rows_belonging_to_the_tenant(self) -> None:
        db = seed_database()

        scoped_sql = main(schema, "SELECT COUNT(*) FROM users", TENANT_ID)
        (row,) = db.execute(scoped_sql).fetchall()

        (expected,) = db.execute(
            "SELECT COUNT(*) FROM users WHERE organization_id = ?", (TENANT_ID,)
        ).fetchone()

        self.assertEqual(row[0], expected)
        self.assertEqual(expected, 2)


if __name__ == "__main__":
    unittest.main()
