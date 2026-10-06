import json
from unittest.mock import MagicMock

import pytest
import requests

from caraoke_worker import remote_app
from caraoke_worker.remote_app import normalize_address


def response(status: int, body) -> MagicMock:
    reply = MagicMock()
    reply.status_code = status
    reply.json.return_value = body
    return reply


def scripted(answers: list[str]):
    pending = list(answers)
    return lambda _prompt: pending.pop(0)


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    return tmp_path / "ProcessadorKaraoke"


def test_understands_the_address_however_it_is_typed():
    assert normalize_address("192.168.0.10") == "http://192.168.0.10:3333"
    assert normalize_address(" 192.168.0.10:3333/ ") == "http://192.168.0.10:3333"
    assert normalize_address("http://karaoke.local:8080") == "http://karaoke.local:8080"
    assert normalize_address("\ufeff192.168.0.10 ") == "http://192.168.0.10:3333"


def test_pairs_saves_and_starts_processing(home, monkeypatch):
    session = MagicMock()
    session.post.side_effect = [
        response(401, {"error": {"message": "Código errado. Confira o número na tela do karaokê."}}),
        response(201, {"workerId": "w1", "token": "cw_abc", "name": "Notebook"}),
    ]
    monkeypatch.setattr(remote_app.requests, "Session", lambda: session)
    monkeypatch.setattr(remote_app, "is_still_paired", lambda api: True)
    said: list[str] = []
    started = []

    remote_app.run(
        ask=scripted(
            ["192.168.0.10", "12345", "192.168.0.10", "111111", "Notebook", "192.168.0.10", "222222", ""]
        ),
        say=said.append,
        start_worker=lambda config, api: started.append(config),
    )

    assert "O código tem 6 números. Tente de novo." in said
    assert "Não deu certo: Código errado. Confira o número na tela do karaokê." in said
    assert session.post.call_args.args[0] == "http://192.168.0.10:3333/api/workers/pair"
    saved = json.loads((home / "config.json").read_text(encoding="utf-8"))
    assert saved == {"apiUrl": "http://192.168.0.10:3333", "token": "cw_abc", "workerId": "w1", "name": "Notebook"}
    assert started[0].worker_token == "cw_abc"
    assert started[0].work_dir == home / "trabalho"


def test_reuses_the_saved_pairing(home, monkeypatch):
    home.mkdir(parents=True)
    (home / "config.json").write_text(
        json.dumps({"apiUrl": "http://pc:3333", "token": "cw_x", "workerId": "w1", "name": "Sala"}), encoding="utf-8"
    )
    monkeypatch.setattr(remote_app, "is_still_paired", lambda api: True)
    said: list[str] = []

    remote_app.run(ask=scripted([]), say=said.append, start_worker=lambda config, api: None)

    assert any("“Sala” ligado a http://pc:3333" in line for line in said)


def test_pairs_again_when_the_karaoke_removed_this_machine(home, monkeypatch):
    home.mkdir(parents=True)
    (home / "config.json").write_text(json.dumps({"apiUrl": "http://pc:3333", "token": "cw_old", "name": "A"}), encoding="utf-8")
    answers = iter([False, True])
    monkeypatch.setattr(remote_app, "is_still_paired", lambda api: next(answers))
    monkeypatch.setattr(
        remote_app,
        "ask_pairing",
        lambda ask, say: {"apiUrl": "http://pc:3333", "token": "cw_new", "workerId": "w2", "name": "B"},
    )
    said: list[str] = []
    started = []

    remote_app.run(ask=scripted([]), say=said.append, start_worker=lambda config, api: started.append(config))

    assert "Esta máquina foi removida no karaokê. Vamos parear de novo." in said
    assert started[0].worker_token == "cw_new"


def test_tells_a_removed_machine_from_an_offline_karaoke():
    api = MagicMock()
    denied = requests.HTTPError(response=response(401, {}))
    api.settings.side_effect = denied
    assert remote_app.is_still_paired(api) is False

    api.settings.side_effect = requests.ConnectionError("desligado")
    assert remote_app.is_still_paired(api) is True


def test_shows_what_it_is_doing_in_portuguese(monkeypatch):
    said: list[str] = []
    api = remote_app.ConsoleApi("http://pc:3333", "cw", said.append)
    monkeypatch.setattr(remote_app.Api, "progress", lambda *args, **kwargs: False)
    monkeypatch.setattr(remote_app.Api, "complete", lambda *args, **kwargs: None)

    api.progress("j1", "SEPARATE", 10, "Separando voz (cuda)… 10%")
    api.progress("j1", "SEPARATE", 10, "Separando voz (cuda)… 10%")
    api.complete("j1", {})

    assert said == ["   Separando voz (cuda)… 10%", "✓ Pronta e enviada ao karaokê. Aguardando a próxima música…"]
