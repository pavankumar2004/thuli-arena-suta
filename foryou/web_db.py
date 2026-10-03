"""Create the Task 3 web app's tables in Neon (idempotent): lookbook/db/foryou.sql.

    uv run --env-file .env python -m foryou.web_db
"""

import os

import psycopg

from instagram.importer import ROOT

SQL = ROOT / "lookbook" / "db" / "foryou.sql"


def main() -> None:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute(SQL.read_text(encoding="utf-8"))
        tables = [r[0] for r in conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name = ANY(%s) ORDER BY 1",
            [["product_tags", "ig_profiles", "ig_photos", "wardrobes", "personal_lookbooks",
              "rate_limits"]])]
    print("ready:", ", ".join(tables))


if __name__ == "__main__":
    main()
