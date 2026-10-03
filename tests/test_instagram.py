import pytest

from instagram.importer import ImportError_, normalise_handle


@pytest.mark.parametrize("raw, handle", [
    ("balanvidya", "balanvidya"),
    ("@BalanVidya ", "balanvidya"),
    ("https://www.instagram.com/masabagupta/", "masabagupta"),
    ("instagram.com/ranveersingh?igsh=abc", "ranveersingh"),
    ("vidya.balan_01", "vidya.balan_01"),
])
def test_accepts_handles_in_the_forms_people_paste(raw, handle):
    assert normalise_handle(raw) == handle


@pytest.mark.parametrize("raw", [
    "", "   ", "@", "../../etc/passwd", "http://169.254.169.254/latest/meta-data",
    "localhost:8000", "a..b", ".hidden", "trailing.", "x" * 31, "emoji😀", "drop table;",
    "https://evil.example/instagram.com/x", "https://instagram.com@evil.example/x",
])
def test_rejects_anything_that_is_not_a_handle(raw):
    with pytest.raises(ImportError_) as exc:
        normalise_handle(raw)
    assert exc.value.status == "invalid"
