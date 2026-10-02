import logging
import shutil
from collections.abc import Callable
from typing import Any

from .api import Api
from .context import JobContext
from .errors import JobCanceled
from .steps import cover, download, lyrics, melody, separate

logger = logging.getLogger(__name__)

CANCELED_MARKER = "CANCELED"
MAX_ERROR_LENGTH = 2000

StepHandler = Callable[[JobContext], None]


def finalize(context: JobContext) -> None:
    context.report("FINALIZE", 100, "Finalizando")
    if context.downloaded_file:
        context.downloaded_file.unlink(missing_ok=True)


STEP_HANDLERS: dict[str, StepHandler] = {
    "DOWNLOAD": download.run,
    "SEPARATE": separate.run,
    "LYRICS": lyrics.run,
    "COVER": cover.run,
    "MELODY": melody.run,
    "FINALIZE": finalize,
}


def describe_error(error: Exception) -> str:
    return f"{type(error).__name__}: {error}"[:MAX_ERROR_LENGTH]


def cleanup(context: JobContext, succeeded: bool) -> None:
    shutil.rmtree(context.tmp_dir, ignore_errors=True)
    if not succeeded and context.downloaded_file:
        context.downloaded_file.unlink(missing_ok=True)
    if not succeeded and context.process and context.process.poll() is None:
        context.process.kill()


def run_job(api: Api, claim: dict[str, Any], hardware: dict[str, Any]) -> None:
    context = JobContext(api, claim, api.settings(), hardware)
    job_id = context.job["id"]
    succeeded = False

    try:
        for step in context.job["steps"]:
            handler = STEP_HANDLERS.get(step)
            if handler is None:
                logger.warning("Step %s is not implemented yet; skipping", step)
                continue
            context.current_step = step
            handler(context)
        api.complete(job_id, context.result)
        succeeded = True
    except JobCanceled:
        logger.info("Job %s canceled", job_id)
        api.fail(job_id, CANCELED_MARKER, context.current_step)
    except Exception as error:
        logger.exception("Job %s failed", job_id)
        api.fail(job_id, describe_error(error), context.current_step)
    finally:
        cleanup(context, succeeded)
