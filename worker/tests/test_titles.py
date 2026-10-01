import pytest

from caraoke_worker.titles import clean_title


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Evidências", "Evidências"),
        ("Evidências (Karaoke Version)", "Evidências"),
        ("Bohemian Rhapsody [Official Video]", "Bohemian Rhapsody"),
        ("Tempo Perdido (Com Letra)", "Tempo Perdido"),
        ("Hello (Instrumental) (HD)", "Hello"),
        ("Música - Karaoke Version", "Música"),
        ("Música (Ao Vivo)", "Música (Ao Vivo)"),
        ("Video Killed the Radio Star", "Video Killed the Radio Star"),
        ("A", "A"),
    ],
)
def test_removes_karaoke_noise_but_keeps_meaningful_text(raw, expected):
    assert clean_title(raw) == expected


def test_never_returns_an_empty_title():
    assert clean_title("(Karaoke Version)") == "(Karaoke Version)"
    assert clean_title("  Karaoke  ") == "Karaoke"
