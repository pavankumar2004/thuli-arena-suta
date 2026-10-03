"""The edit: four chapters, their copy, and which looks belong in each.

A look is a saree plus the pieces Suta's own product copy says it was photographed
with ("the model is wearing a blouse called ..."), so every outfit here is one the
brand actually styled. Nothing is invented or recombined.

`picks` are hand-curated looks, shown first in that order (a "#n" suffix chooses which
of the saree's photos leads). If a pick sells out, the chapter backfills by rank.
"""

from dataclasses import dataclass, field
from typing import Callable

EDIT = {
    "title": "The Festive Edit",
    "season": "Autumn 2026",
    "intro": "Four chapters for the season that runs from Mahalaya to Diwali. Every look "
             "is styled the way Suta photographed it: the saree, the blouse beside it, "
             "nothing invented.",
}


def _styles(p: dict) -> set[str]:
    return set(p["attributes"].get("style", []))


@dataclass(frozen=True)
class Chapter:
    slug: str
    numeral: str
    title: str
    occasion: str
    intro: str
    belongs: Callable[[dict], bool]
    picks: tuple[str, ...] = field(default=())


CHAPTERS = [
    Chapter(
        slug="agomoni",
        numeral="I",
        title="Agomoni",
        occasion="Durga Puja",
        intro="Agomoni is the song that welcomes the goddess home. Five days of "
              "pandal-hopping, dhunuchi smoke and sindoor khela ask for cotton that "
              "breathes, borders that glow, and reds that mean something.",
        belongs=lambda p: "agomoni-puja-collection" in p["edits"],
        picks=("doshobhuja-tussar-silk-saree", "bari-fera-red-cotton-saree",
               "daaker-saaj-offwhite-cotton-saree", "shonkho-sindoor-cotton-saree",
               "phooler-mala-white-red-bandhani-saree", "rokto-joba",
               "ashtomi-purple-embroidered-saree", "pujor-rong-makha-wine-cotton-saree"),
    ),
    Chapter(
        slug="wedding-guest",
        numeral="II",
        title="The Wedding Guest",
        occasion="Mehendi · Sangeet · Day weddings",
        intro="Not the bride, but never forgotten. Tissue, silk and organza that catch the "
              "light at a mehendi afternoon, and drape well enough to dance in at the sangeet.",
        belongs=lambda p: "Wedding Wear" in _styles(p),
        picks=("chaand-chandrama-gold-tissue-tussar-silk-saree", "phool-shool",
               "raga-sahana-saree", "laila", "anandi", "manjaadi", "rust-e-chumki",
               "dipped-in-blush"),
    ),
    Chapter(
        slug="festive-nights",
        numeral="III",
        title="Festive Nights",
        occasion="Diwali · Evenings",
        intro="Diyas on every ledge, cards on the floor, the whole family in one room. "
              "Jewel-toned mul under a single spotlight, for the nights the house glows.",
        belongs=lambda p: bool({"Festive Wear", "Evening Wear", "Party Wear"} & _styles(p)),
        picks=("caramel-star", "mor-star", "gulabi-star", "junglee-star", "sunshine-star",
               "moss-star", "sea-star", "pinky-star"),
    ),
    Chapter(
        slug="city",
        numeral="IV",
        title="The City Saree",
        occasion="Office · Local trains · Weekends",
        intro="Festivals end; the city doesn't. Printed mul cotton for the 8:12 local, the "
              "office, the chai stall and the sea face after, with a taxi, a mango and an "
              "evil eye or two.",
        belongs=lambda p: bool({"Casual Wear", "Office Wear", "Summer Wear", "Comfort Wear"}
                               & _styles(p)),
        picks=("meter-down-taxi-print", "bombae-local-print", "bindaas-bindu",
               "nazar-andaaz-evil-eye-print", "mugshot-coffee-print", "aamchi-mango-print",
               "choti-bindu", "kas-kay-mumbai-mumbai-print"),
    ),
]

LOOKS_PER_CHAPTER = 8
