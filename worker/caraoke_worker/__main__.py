import logging
import time

import requests

from .api import Api
from .config import BACKEND_RETRY_SECONDS, Config
from .device import detect_hardware
from .heartbeat import HeartbeatThread
from .runner import run_job

logger = logging.getLogger("caraoke_worker")


def poll_forever(api: Api, hardware: dict, poll_interval_seconds: float) -> None:
    while True:
        try:
            claim = api.claim()
        except requests.RequestException as error:
            logger.warning("Backend unavailable (%s); retrying in %ss", error, BACKEND_RETRY_SECONDS)
            time.sleep(BACKEND_RETRY_SECONDS)
            continue

        if claim is None:
            time.sleep(poll_interval_seconds)
            continue

        try:
            run_job(api, claim, hardware)
        except Exception:
            logger.exception("Could not finish job handling; continuing with the queue")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [worker] %(levelname)s %(message)s",
    )
    config = Config.load()
    api = Api(config.api_url, config.worker_token)
    hardware = detect_hardware()
    logger.info("Worker started: %s", hardware)

    heartbeat = HeartbeatThread(api, hardware, config.heartbeat_interval_seconds)

    try:
        while not heartbeat.send_once():
            time.sleep(BACKEND_RETRY_SECONDS)
        heartbeat.start()
        poll_forever(api, hardware, config.poll_interval_seconds)
    except KeyboardInterrupt:
        logger.info("Worker stopped")
    finally:
        heartbeat.stop()


if __name__ == "__main__":
    main()
