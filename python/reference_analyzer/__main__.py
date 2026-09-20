import json
import os
from pathlib import Path
import sys
from .offline import enforce_offline

enforce_offline()
import jsonschema
from .media import StageFailure, metadata, detect, sample
from .siglip import SiglipProvider

ROOT = Path(__file__).resolve().parents[2]
REQUEST_SCHEMA = json.loads((ROOT / "schemas/interchange/WorkerRequest.schema.json").read_text(encoding="utf8"))
RESPONSE_SCHEMA = json.loads((ROOT / "schemas/interchange/WorkerResponse.schema.json").read_text(encoding="utf8"))
provider = SiglipProvider()


def dispatch(request):
    jsonschema.Draft202012Validator(REQUEST_SCHEMA).validate(request)
    operation = request["operation"]
    if operation == "embed" and request["config"]["mode"] == "siglip" and os.environ.get("CREATOR_FOOTAGE_MEMORY_GUARD") == "1":
        from .capacity import guarded_footage_inference
        with guarded_footage_inference(provider.loaded_key is None):
            result = provider.embed(request)
    else:
        result = provider.embed(request) if operation == "embed" else {"metadata": metadata, "detect": detect, "sample": sample}[operation](request)
    response = {"protocolVersion": "1.0.0", "operation": operation, **result}
    jsonschema.Draft202012Validator(RESPONSE_SCHEMA).validate(response)
    return response


for line in sys.stdin:
    operation = "protocol"
    try:
        if len(line) > 2 * 1024 * 1024:
            raise StageFailure("protocol", "INTERCHANGE_INVALID", "Request exceeded message limit.")
        request = json.loads(line)
        if isinstance(request, dict) and request.get("operation") in ("metadata", "detect", "sample", "embed"):
            operation = request["operation"]
        response = dispatch(request)
    except StageFailure as exc:
        response = {"protocolVersion": "1.0.0", "error": {"stage": exc.stage, "code": exc.code, "diagnostic": exc.diagnostic}}
    except Exception:
        # Native tool errors can include paths, metadata or other user content. Do not echo them.
        code = {"metadata": "METADATA_EXTRACTION_FAILED", "detect": "SHOT_DETECTION_FAILED", "sample": "FRAME_EXTRACTION_FAILED", "embed": "EMBEDDING_FAILED", "protocol": "INTERCHANGE_INVALID"}[operation]
        response = {"protocolVersion": "1.0.0", "error": {"stage": operation, "code": code, "diagnostic": "Local analysis failed validation or execution."}}
    sys.stdout.write(json.dumps(response, allow_nan=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()
