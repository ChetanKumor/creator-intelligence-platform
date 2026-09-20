import os
from pathlib import Path
import sys
import unittest

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "python"))
os.environ["HF_HOME"] = str(root / ".reference-cache/models")
os.environ["HF_HUB_CACHE"] = str(root / ".reference-cache/models")
os.environ["OMP_NUM_THREADS"] = "1"
from reference_analyzer.offline import enforce_offline
enforce_offline()
suite = unittest.defaultTestLoader.discover(str(root / "python/tests"))
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
