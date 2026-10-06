import json
import logging
import os
import platform
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import requests

from .api import Api
from .config import Config, default_work_dir

APP_FOLDER = "ProcessadorKaraoke"
CONFIG_FILE = "config.json"
DEFAULT_PORT = 3333
PAIR_TIMEOUT_SECONDS = 15
UNAUTHORIZED = 401
CODE_PATTERN = re.compile(r"^\d{6}$")
DIVIDER = "─" * 60

Ask = Callable[[str], str]
Say = Callable[[str], None]


def app_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / APP_FOLDER


def clean(text: str) -> str:
    return text.replace("\ufeff", "").strip()


def normalize_address(text: str) -> str:
    address = clean(text).rstrip("/")
    if not re.match(r"^https?://", address):
        address = f"http://{address}"
    host = address.split("://", 1)[1]
    if ":" not in host:
        address = f"{address}:{DEFAULT_PORT}"
    return address


def load_saved(config_path: Path) -> dict[str, Any] | None:
    try:
        saved = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return saved if saved.get("apiUrl") and saved.get("token") else None


def save(config_path: Path, data: dict[str, Any]) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def pair(api_url: str, code: str, name: str, session: requests.Session | None = None) -> dict[str, Any]:
    http = session or requests.Session()
    response = http.post(f"{api_url}/api/workers/pair", json={"code": code, "name": name}, timeout=PAIR_TIMEOUT_SECONDS)
    if response.status_code >= 400:
        try:
            message = response.json()["error"]["message"]
        except (ValueError, KeyError, TypeError):
            message = f"o karaokê respondeu {response.status_code}"
        raise PairingError(message)
    return response.json()


class PairingError(Exception):
    pass


def ask_pairing(ask: Ask, say: Say, session: requests.Session | None = None) -> dict[str, Any]:
    say(DIVIDER)
    say("Vamos ligar esta máquina ao karaokê.")
    say("No PC do karaokê, abra Configurações › Máquinas de processamento › Parear uma máquina.")
    say(DIVIDER)
    default_name = platform.node() or "Outra máquina"
    while True:
        address = normalize_address(ask("Endereço do karaokê (ex.: 192.168.0.10:3333): "))
        code = clean(ask("Código de 6 dígitos que aparece na tela: "))
        if not CODE_PATTERN.match(code):
            say("O código tem 6 números. Tente de novo.")
            continue
        name = clean(ask(f"Nome desta máquina [{default_name}]: ")) or default_name
        try:
            result = pair(address, code, name, session)
        except PairingError as error:
            say(f"Não deu certo: {error}")
            continue
        except requests.RequestException:
            say(f"Não consegui falar com {address}. O karaokê está ligado e nesta mesma rede?")
            continue
        say(f"Pronto! Esta máquina agora se chama “{result['name']}” no karaokê.")
        return {"apiUrl": address, "token": result["token"], "workerId": result["workerId"], "name": result["name"]}


def is_still_paired(api: Api) -> bool:
    try:
        api.settings()
    except requests.HTTPError as error:
        return error.response is None or error.response.status_code != UNAUTHORIZED
    except requests.RequestException:
        return True
    return True


class ConsoleApi(Api):
    def __init__(self, base_url: str, worker_token: str, say: Say) -> None:
        super().__init__(base_url, worker_token)
        self._say = say
        self._last_message: str | None = None

    def claim(self) -> dict[str, Any] | None:
        claim = super().claim()
        if claim:
            song = claim["job"]["song"]
            self._say(f"\n▶ Processando: {song['title']} — {song['artist']}")
        return claim

    def progress(self, job_id: str, step: str, progress: int, message: str | None, device: str | None = None) -> bool:
        if message and message != self._last_message:
            self._last_message = message
            self._say(f"   {message}")
        return super().progress(job_id, step, progress, message, device)

    def complete(self, job_id: str, result: dict[str, Any]) -> None:
        super().complete(job_id, result)
        self._say("✓ Pronta e enviada ao karaokê. Aguardando a próxima música…")

    def fail(self, job_id: str, error: str, step: str | None = None) -> None:
        super().fail(job_id, error, step)
        self._say(f"✗ Não deu certo: {error[:200]}")


def run(ask: Ask = input, say: Say = print, start_worker: Callable[[Config, Api], None] | None = None) -> None:
    config_path = app_dir() / CONFIG_FILE
    saved = load_saved(config_path)
    while True:
        if saved is None:
            saved = ask_pairing(ask, say)
            save(config_path, saved)
        api = ConsoleApi(saved["apiUrl"], saved["token"], say)
        if is_still_paired(api):
            break
        say("Esta máquina foi removida no karaokê. Vamos parear de novo.")
        config_path.unlink(missing_ok=True)
        saved = None

    say(DIVIDER)
    say(f"Processador do Karaokê · “{saved['name']}” ligado a {saved['apiUrl']}")
    say("Aguardando músicas… (feche esta janela para parar)")
    say(DIVIDER)
    config = Config(api_url=saved["apiUrl"], worker_token=saved["token"], work_dir=default_work_dir())
    if start_worker is None:
        from .__main__ import main

        logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")
        main(config, api)
    else:
        start_worker(config, api)


if __name__ == "__main__":
    try:
        run()
    except (EOFError, KeyboardInterrupt):
        print("\nProcessador encerrado.")
