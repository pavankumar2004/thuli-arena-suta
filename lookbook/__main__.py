"""Build the lookbook as a static site, optionally deploying it to Cloudflare Pages.

    uv run --env-file .env python -m lookbook            # build site/dist from Neon
    uv run --env-file .env python -m lookbook --deploy   # ...and publish it
"""

import argparse
import subprocess
from pathlib import Path

from .chapters import LOOKS_PER_CHAPTER
from .data import load_products
from .render import render
from .select import build_edit

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "dist"
PROJECT = "suta-lookbook"


def deploy(out: Path) -> None:
    # Creating the project fails harmlessly if it already exists.
    subprocess.run(["npx", "-y", "wrangler", "pages", "project", "create", PROJECT,
                    "--production-branch", "main"], capture_output=True)
    subprocess.run(["npx", "-y", "wrangler", "pages", "deploy", str(out),
                    "--project-name", PROJECT, "--branch", "main", "--commit-dirty=true"],
                   check=True)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m lookbook", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--deploy", action="store_true", help="publish to Cloudflare Pages")
    args = parser.parse_args()

    products, source = load_products()
    edit = build_edit(products)
    scraped_at = max(p["scraped_at"] for p in products.values())
    pages = render(edit, scraped_at, OUT)

    print(f"built {pages} pages from {source} into {OUT.relative_to(ROOT)}/")
    for chapter, looks in edit:
        used = {lk.slug for lk in looks}
        dropped = [h.partition("#")[0] for h in chapter.picks if h.partition("#")[0] not in used]
        flag = "" if len(looks) == LOOKS_PER_CHAPTER else f"  (only {len(looks)})"
        print(f"  {chapter.numeral:>3} {chapter.title:20s} {len(looks)} looks{flag}"
              + (f"  picks unavailable, backfilled: {', '.join(dropped)}" if dropped else ""))
    if args.deploy:
        deploy(OUT)


if __name__ == "__main__":
    main()
