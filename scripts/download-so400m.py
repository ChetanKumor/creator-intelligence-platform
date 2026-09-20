"""Explicitly invoked setup for the owner's approved So400m revision; never inference."""
import hashlib
import json
import os
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".reference-cache/models"
MODEL = "google/siglip2-so400m-patch16-naflex"
REVISION = "cc24074f717b612951c2dead130904ab9b65a81e"
FILES = ("README.md", "config.json", "preprocessor_config.json", "model.safetensors")


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    if not CACHE.resolve().is_relative_to(ROOT.resolve()):
        raise RuntimeError("Model cache must remain within the project.")
    os.environ.update({"HF_HOME": str(CACHE), "HF_HUB_CACHE": str(CACHE), "HF_XET_CACHE": str(CACHE / "xet"),
                       "HF_HUB_DISABLE_TELEMETRY": "1", "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1", "HF_HUB_DISABLE_XET": "1",
                       "HF_HUB_DISABLE_PROGRESS_BARS": "1", "HF_HUB_DISABLE_SYMLINKS_WARNING": "1", "HF_HUB_DOWNLOAD_TIMEOUT": "60"})
    from huggingface_hub import HfApi, hf_hub_download
    started = time.perf_counter()
    info = HfApi(token=False).model_info(MODEL, revision=REVISION, files_metadata=True)
    if info.id != MODEL or info.sha != REVISION or info.card_data.license != "apache-2.0":
        raise RuntimeError("Official repository identity, revision or Apache-2.0 license mismatch.")
    entries = {item.rfilename: item for item in info.siblings}
    print(json.dumps({"stage": "verified_metadata", "model": MODEL, "revision": REVISION, "license": info.card_data.license,
                      "selectedBytes": sum(entries[name].size for name in FILES), "files": list(FILES)}), flush=True)
    receipt = {"model": MODEL, "revision": REVISION, "license": info.card_data.license, "files": []}
    for name in FILES:
        print(json.dumps({"stage": "downloading", "file": name, "bytes": entries[name].size}), flush=True)
        path = Path(hf_hub_download(MODEL, name, revision=REVISION, cache_dir=str(CACHE), token=False))
        if not path.resolve().is_relative_to(CACHE.resolve()) or path.stat().st_size != entries[name].size:
            raise RuntimeError("Downloaded model file path or size mismatch.")
        with path.open("rb") as source:
            sha256 = hashlib.file_digest(source, "sha256").hexdigest()
        lfs = entries[name].lfs
        if lfs is not None and sha256 != lfs.sha256:
            raise RuntimeError("Downloaded weights failed the official LFS SHA-256 check.")
        receipt["files"].append({"name": name, "bytes": path.stat().st_size, "sha256": sha256,
                                 "officialLfsSha256": lfs.sha256 if lfs is not None else None,
                                 "cachePath": path.relative_to(CACHE).as_posix()})
        print(json.dumps({"stage": "verified_file", **receipt["files"][-1]}), flush=True)
    receipt["selectedBytes"] = sum(item["bytes"] for item in receipt["files"])
    receipt["elapsedSeconds"] = time.perf_counter() - started
    receipt["verifiedAtUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    (CACHE / "so400m-download-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"stage": "complete", "selectedBytes": receipt["selectedBytes"], "elapsedSeconds": receipt["elapsedSeconds"]}), flush=True)


if __name__ == "__main__":
    main()
