"""Turn a profile's raw images into a small, clean style knowledge base.

    uv run python -m instagram.curate balanvidya masabagupta     # writes kb.json + sheets

Most of what a public figure posts isn't an outfit: film posters, ads with text,
food, cars, baby announcements. Feeding those to the stylist adds noise. So:

1. Every image is embedded with CLIP (ViT-B/32, runs locally, no API key).
2. Zero-shot labels: the image is compared with short descriptions of outfit photos
   and of the usual noise; its "outfit score" is the probability mass on the former.
3. Near-duplicates (several frames of one shoot) are collapsed to the best one.
4. The top images by outfit score are kept, preferring variety (maximal marginal
   relevance), up to KEEP per profile.

Output per handle, in data/instagram/<handle>/:
  kb.json          kept images with caption, post link, label and scores, in rank order
  kb_vectors.npy   their CLIP vectors (same space as the catalogue's, for Task 4 search)
  kb_sheet.jpg     contact sheet: kept on top, rejected below, for a quick human check
"""

import argparse
import json
from pathlib import Path

import numpy as np

from .importer import CACHE, ROOT, normalise_handle

KEEP = 24
DUPLICATE_SIMILARITY = 0.93
MIN_OUTFIT_SCORE = 0.45

# (label, is_outfit, prompt). Several prompts per idea make zero-shot CLIP steadier.
LABELS = [
    ("outfit", True, "a full-length photo of a woman wearing a saree"),
    ("outfit", True, "a photo of a woman wearing a lehenga or an Indian ethnic outfit"),
    ("outfit", True, "a fashion photoshoot of a woman in a dress"),
    ("outfit", True, "a photo of a man wearing a kurta or traditional Indian clothes"),
    ("outfit", True, "a photo of a man wearing a suit, jacket or stylish clothes"),
    ("outfit", True, "a person posing to show off their outfit"),
    ("outfit", True, "a red carpet photo of a celebrity's outfit"),
    ("portrait", False, "a close-up selfie of a face"),
    ("poster", False, "a movie poster with large title text"),
    ("ad", False, "an advertisement with a product and promotional text"),
    ("text", False, "a graphic that is mostly text or a quote"),
    ("product", False, "a product shot of a bottle, box or gadget"),
    ("food", False, "a photo of food"),
    ("vehicle", False, "a photo of a car"),
    ("child", False, "a photo of a baby or a small child"),
    ("group", False, "a group photo of many people at an event"),
    ("scenery", False, "a landscape or a room with no people"),
]


def _models():
    from fastembed import ImageEmbedding, TextEmbedding

    return (ImageEmbedding("Qdrant/clip-ViT-B-32-vision"),
            TextEmbedding("Qdrant/clip-ViT-B-32-text"))


def _unit(x: np.ndarray) -> np.ndarray:
    return x / np.linalg.norm(x, axis=-1, keepdims=True)


def curate(handle: str, image_model, text_model) -> dict:
    folder = CACHE / handle
    profile = json.loads((folder / "profile.json").read_text(encoding="utf-8"))
    posts = [p for p in profile["posts"] if p.get("image_file")]
    files = [str(ROOT / p["image_file"]) for p in posts]

    vectors = _unit(np.array(list(image_model.embed(files)), dtype=np.float32))
    prompts = _unit(np.array(list(text_model.embed([lab[2] for lab in LABELS])), dtype=np.float32))
    logits = 100.0 * vectors @ prompts.T                      # CLIP's own temperature
    probs = np.exp(logits - logits.max(axis=1, keepdims=True))
    probs /= probs.sum(axis=1, keepdims=True)
    is_outfit = np.array([lab[1] for lab in LABELS])
    outfit_score = probs[:, is_outfit].sum(axis=1)
    top_label = [LABELS[i][0] for i in probs.argmax(axis=1)]

    # Collapse near-duplicates: walk from best to worst, drop anything too close to a keeper.
    order = np.argsort(-outfit_score)
    survivors, dropped_dupe = [], set()
    for i in order:
        if survivors and max(float(vectors[i] @ vectors[j]) for j in survivors) > DUPLICATE_SIMILARITY:
            dropped_dupe.add(int(i))
        else:
            survivors.append(int(i))

    # Variety: maximal marginal relevance among images that look like outfits.
    pool = [i for i in survivors if outfit_score[i] >= MIN_OUTFIT_SCORE]
    kept: list[int] = []
    while pool and len(kept) < KEEP:
        def mmr(i: int) -> float:
            redundancy = max((float(vectors[i] @ vectors[j]) for j in kept), default=0.0)
            return 0.75 * float(outfit_score[i]) - 0.25 * redundancy
        best = max(pool, key=mmr)
        kept.append(best)
        pool.remove(best)

    def record(i: int) -> dict:
        p = posts[i]
        return {"image_file": p["image_file"], "caption": p["caption"],
                "post_url": f"https://www.instagram.com/p/{p['code']}/" if p.get("code") else None,
                "taken_at": p.get("taken_at"), "likes": p.get("likes"),
                "is_video": p["is_video"], "label": top_label[i],
                "outfit_score": round(float(outfit_score[i]), 3)}

    rejected = [{**record(i), "reason": "duplicate" if i in dropped_dupe else top_label[i]}
                for i in order if int(i) not in kept]
    kb = {"handle": handle, "full_name": profile["full_name"], "images_seen": len(posts),
          "kept": [record(i) for i in kept], "rejected": rejected}
    (folder / "kb.json").write_text(json.dumps(kb, ensure_ascii=False, indent=1), encoding="utf-8")
    np.save(folder / "kb_vectors.npy", vectors[kept])
    _contact_sheet(folder, kb)
    return kb


def _contact_sheet(folder: Path, kb: dict, cell: int = 150, cols: int = 8) -> None:
    from PIL import Image, ImageDraw

    rows = [("KEPT", kb["kept"]), ("REJECTED", kb["rejected"])]
    height = sum(24 + -(-len(items) // cols) * (cell + 16) for _, items in rows)
    sheet = Image.new("RGB", (cols * cell, height), "white")
    draw = ImageDraw.Draw(sheet)
    y = 0
    for title, items in rows:
        draw.text((6, y + 6), f"{title} ({len(items)})", fill="black")
        y += 24
        for n, item in enumerate(items):
            x, yy = (n % cols) * cell, y + (n // cols) * (cell + 16)
            im = Image.open(ROOT / item["image_file"]).convert("RGB")
            im.thumbnail((cell - 4, cell - 4))
            sheet.paste(im, (x + 2, yy))
            tag = item.get("reason", item["label"])
            draw.text((x + 3, yy + cell - 2), f"{tag} {item['outfit_score']:.2f}", fill="black")
        y += -(-len(items) // cols) * (cell + 16)
    sheet.save(folder / "kb_sheet.jpg", quality=80)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m instagram.curate", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("handles", nargs="+")
    args = parser.parse_args()
    image_model, text_model = _models()
    for raw in args.handles:
        kb = curate(normalise_handle(raw), image_model, text_model)
        reasons: dict[str, int] = {}
        for r in kb["rejected"]:
            reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
        print(f"@{kb['handle']:14s} {kb['images_seen']:3d} images -> kept {len(kb['kept']):2d}; "
              f"rejected {len(kb['rejected'])}: "
              + ", ".join(f"{k} {v}" for k, v in sorted(reasons.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
