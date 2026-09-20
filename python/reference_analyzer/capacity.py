"""Read-only Windows memory observations and the existing 1 GiB safety reserve."""
import ctypes
from ctypes import wintypes
from contextlib import contextmanager
import json
import os
from pathlib import Path
import threading

RESERVE_BYTES = 1024**3
# Measured by the Phase 1 CPU smoke, not the model's weight-file size.
SO400M_OBSERVED_PEAK_COMMIT_BYTES = 10_670_182_400


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
            "totalPhysicalBytes": system.totalPhysical, "commitLimitBytes": system.totalPageFile,
            "committedBytes": system.totalPageFile - system.availablePageFile}


def capacity_report(observation=None):
    current = memory() if observation is None else observation
    required = SO400M_OBSERVED_PEAK_COMMIT_BYTES + RESERVE_BYTES
    return {"policyVersion": "so400m-observed-commit-v1", "safeToLoad": current["availableCommitBytes"] >= required and current["availablePhysicalBytes"] >= 3 * RESERVE_BYTES,
            "requiredCommitHeadroomBytes": required, "requiredPhysicalHeadroomBytes": 3 * RESERVE_BYTES,
            "runtimeGuardReserveBytes": RESERVE_BYTES, "observedPhase1PeakCommitBytes": SO400M_OBSERVED_PEAK_COMMIT_BYTES, "memory": current}


def persist_report(report):
    target = os.environ.get("CREATOR_FOOTAGE_CAPACITY_REPORT")
    if target:
        root = Path(__file__).resolve().parents[2]
        path = Path(target).resolve()
        if path.is_relative_to(root / ".local-runs") or path.is_relative_to(root / ".test-artifacts"):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")


@contextmanager
def guarded_footage_inference(needs_load):
    from .media import StageFailure
    report = capacity_report()
    if (needs_load and not report["safeToLoad"]) or report["memory"]["availablePhysicalBytes"] < RESERVE_BYTES or report["memory"]["availableCommitBytes"] < RESERVE_BYTES:
        persist_report({**report, "status": "pending_environment_capacity"})
        raise StageFailure("embed", "EMBEDDING_ENVIRONMENT_CAPACITY", "Fresh model loading awaits sufficient Windows commit headroom.")
    stopped = threading.Event()

    def watch():
        while not stopped.wait(0.25):
            current = memory()
            if current["availablePhysicalBytes"] < RESERVE_BYTES or current["availableCommitBytes"] < RESERVE_BYTES:
                persist_report({**report, "status": "memory_guard_stop", "memory": current})
                os._exit(75)

    observer = threading.Thread(target=watch, daemon=True)
    observer.start()
    try:
        yield
    finally:
        stopped.set()
        observer.join(timeout=1)
        persist_report({**report, "status": "guarded_operation_finished", "memory": memory()})
