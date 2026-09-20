"""Explicit offline CPU smoke using real cached weights; excluded from normal tests."""
import ctypes
from ctypes import wintypes
import json
import math
import os
from pathlib import Path
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".reference-cache/models"
sys.path.insert(0, str(ROOT / "python"))
os.environ.update({"HF_HOME": str(CACHE), "HF_HUB_CACHE": str(CACHE), "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1",
                   "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2", "PYTHONDONTWRITEBYTECODE": "1"})
from reference_analyzer.offline import enforce_offline
enforce_offline()


class SystemMemory(ctypes.Structure):
    _fields_ = [("length", wintypes.DWORD), ("load", wintypes.DWORD)] + [(name, ctypes.c_ulonglong) for name in
                  ("totalPhysical", "availablePhysical", "totalPageFile", "availablePageFile", "totalVirtual", "availableVirtual", "extended")]


class ProcessMemory(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in
                  ("PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage",
                   "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage", "PrivateUsage")]


def memory():
    system = SystemMemory(); system.length = ctypes.sizeof(system)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(system)):
        raise ctypes.WinError()
    process = ProcessMemory(); process.cb = ctypes.sizeof(process)
    ctypes.windll.kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    query = ctypes.windll.psapi.GetProcessMemoryInfo
    query.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessMemory), wintypes.DWORD]
    if not query(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(process), ctypes.sizeof(process)):
        raise ctypes.WinError()
    return {"peakWorkingSetBytes": process.PeakWorkingSetSize, "workingSetBytes": process.WorkingSetSize,
            "privateBytes": process.PrivateUsage, "peakPagefileBytes": process.PeakPagefileUsage,
            "availablePhysicalBytes": system.availablePhysical, "availableCommitBytes": system.availablePageFile,
            "totalPhysicalBytes": system.totalPhysical}


def main():
    if len(sys.argv) != 3:
        raise RuntimeError("Usage: smoke-reference-model.py worker-request.json output.json")
    output = Path(sys.argv[2]).resolve()
    if not output.is_relative_to((ROOT / ".test-artifacts").resolve()):
        raise RuntimeError("Smoke evidence must remain within project test artifacts.")
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    initial_memory = memory()
    report = {"status": "running", "offline": True, "device": "cpu", "initialMemory": initial_memory}
    stopped = threading.Event()

    def watch():
        while not stopped.wait(0.25):
            current = memory()
            if current["availablePhysicalBytes"] < 1024**3 or current["availableCommitBytes"] < 1024**3:
                output.write_text(json.dumps({**report, "status": "memory_guard_stop", "memory": current}, indent=2) + "\n", encoding="utf8")
                os._exit(75)

    threading.Thread(target=watch, daemon=True).start()
    try:
        import jsonschema
        from reference_analyzer.siglip import SiglipProvider
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
        schema = json.loads((ROOT / "schemas/interchange/WorkerRequest.schema.json").read_text(encoding="utf8"))
        jsonschema.Draft202012Validator(schema).validate(request)
        config = request["config"]
        if request["operation"] != "embed" or config["device"] != "cpu" or config["mode"] != "siglip" or config["cpuFallback"]:
            raise RuntimeError("The approved smoke must use real CPU inference without fallback.")
        if config["model"] != "google/siglip2-so400m-patch16-naflex" or config["revision"] != "cc24074f717b612951c2dead130904ab9b65a81e":
            raise RuntimeError("Only the explicitly approved pinned So400m candidate is allowed.")
        if Path(request["modelRoot"]).resolve() != CACHE.resolve() or not Path(request["frameRoot"]).resolve().is_relative_to(ROOT.resolve()):
            raise RuntimeError("Model and frame artifacts must remain in the project.")
        print(json.dumps({"stage": "offline_provider_start", "model": config["model"], "revision": config["revision"], "frames": len(request["sampleIds"])}), flush=True)
        provider = SiglipProvider()
        result = provider.embed(request)
        norms = [math.hypot(*item["vector"]) for item in result["value"]]
        dimensions = {len(item["vector"]) for item in result["value"]}
        if dimensions != {1152} or any(abs(norm - 1) > 1e-5 for norm in norms) or result["device"] != "cpu" or result["fallback"]:
            raise RuntimeError("Real embedding dimensions, normalization or device mismatch.")
        report.update({"status": "passed", "model": config["model"], "revision": config["revision"], "config": config,
                       "sampledFrames": len(result["value"]), "embeddingDimension": 1152, "embeddingNorms": norms,
                       "providerTimings": provider.last_timings, "memory": memory(), "totalSeconds": time.perf_counter() - started})
        import torch
        report.update({"torchVersion": torch.__version__, "torchCudaBuild": torch.version.cuda,
                       "parameterCount": sum(parameter.numel() for parameter in provider.model.parameters())})
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
        print(json.dumps(report), flush=True)
    except Exception as error:
        report.update({"status": "failed", "errorType": type(error).__name__, "errorCode": getattr(error, "code", None),
                       "diagnostic": str(error), "memory": memory(), "totalSeconds": time.perf_counter() - started})
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
        raise
    finally:
        stopped.set()


if __name__ == "__main__":
    main()
