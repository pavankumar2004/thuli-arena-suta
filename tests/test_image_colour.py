from PIL import Image

from catalogue.image_colour import dominant_colours, nearest_shade


def test_nearest_shade():
    assert nearest_shade((200, 25, 35)) == "Red"
    assert nearest_shade((20, 30, 85)) == "Navy"
    assert nearest_shade((240, 240, 238)) == "White"


def test_garment_colour_ignores_backdrop_and_skin():
    img = Image.new("RGB", (100, 100), (250, 250, 250))            # white backdrop
    img.paste((40, 130, 60), (25, 25, 75, 90))                       # green saree, centre
    img.paste((225, 170, 135), (40, 30, 60, 45))                     # a face
    assert dominant_colours(img) == ["Green"]


def test_blank_photo_gives_no_colour():
    assert dominant_colours(Image.new("RGB", (50, 50), (255, 255, 255))) == []
