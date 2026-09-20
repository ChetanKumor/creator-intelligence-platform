"""Read-only final verification preflight. Does not import torch or load weights."""
import json
from pathlib import Path
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from reference_analyzer.capacity import capacity_report

report = {**capacity_report(), "measuredAt": datetime.now(timezone.utc).isoformat(), "freshInferenceAttempted": False}
report["status"] = "safe_to_attempt" if report["safeToLoad"] else "pending_environment_capacity"
output = ROOT / ".test-artifacts/phase2/final-capacity.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
print(json.dumps(report))
