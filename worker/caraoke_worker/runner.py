import logging
from typing import Any

logger = logging.getLogger(__name__)


def run_job(claim: dict[str, Any]) -> None:
    job_id = claim["job"]["id"]
    logger.warning("Job %s claimed, but no processing steps are implemented yet", job_id)
