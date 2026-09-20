from pathlib import Path
import re
import time
import numpy as np
from PIL import Image
from .media import StageFailure


class SiglipProvider:
    """Pinned local-only model. One worker retains one loaded model across calls."""
    def __init__(self):
        self.loaded_key, self.model, self.processor = None, None, None
        self.cpu_fallback_keys = set()
        self.last_timings = {}

    def embed(self, request):
        self.last_timings = {"importSeconds": 0.0, "modelLoadSeconds": 0.0, "embeddingSeconds": 0.0}
        config = request["config"]
        root = Path(request["frameRoot"])
        if any(not re.fullmatch(r"sample_[a-f0-9]{64}", sample_id) for sample_id in request["sampleIds"]):
            raise StageFailure("embed", "EMBEDDING_FAILED", "Invalid frame artifact identity.")
        if config["mode"] == "stub":
            values = []
            for sample_id in request["sampleIds"]:
                with Image.open(root / (sample_id + ".png")) as image:
                    pixels = np.asarray(image.convert("RGB"), dtype=np.float64) / 255
                vector = np.concatenate([pixels.mean(axis=(0, 1)), pixels.std(axis=(0, 1)), [1.0, 0.5]])
                values.append({"sampleId": sample_id, "vector": (vector / np.linalg.norm(vector)).tolist()})
            return {"value": values, "toolVersion": "stub-v1", "device": "cpu", "fallback": False}
        import_started = time.perf_counter()
        import torch
        from transformers import AutoImageProcessor, AutoModel
        self.last_timings["importSeconds"] = time.perf_counter() - import_started
        device, fallback = config["device"], False
        fallback_key = (config["model"], config["revision"], config["maxPatches"])
        if device == "cuda" and config["cpuFallback"] and fallback_key in self.cpu_fallback_keys:
            device, fallback = "cpu", True
        if device == "cuda" and not torch.cuda.is_available():
            if not config["cpuFallback"]:
                raise StageFailure("embed", "EMBEDDING_DEVICE_UNAVAILABLE", "A compatible CUDA-enabled PyTorch runtime is unavailable.")
            device, fallback = "cpu", True
            self.cpu_fallback_keys.add(fallback_key)
        model_root = Path(request["modelRoot"])
        key = (config["model"], config["revision"], device)
        try:
            if key != self.loaded_key:
                load_started = time.perf_counter()
                self.model, self.processor, self.loaded_key = None, None, None
                # No trust_remote_code, inference APIs, auto-download, or tokenizer needed.
                self.processor = AutoImageProcessor.from_pretrained(config["model"], revision=config["revision"], cache_dir=str(model_root), local_files_only=True, use_fast=False, trust_remote_code=False, token=False)
                self.model = AutoModel.from_pretrained(config["model"], revision=config["revision"], cache_dir=str(model_root), local_files_only=True, trust_remote_code=False, use_safetensors=True, token=False).eval().to(device)
                if self.model.config.model_type != "siglip2":
                    raise StageFailure("embed", "EMBEDDING_MODEL_UNAVAILABLE", "Cached model architecture does not match SigLIP2.")
                self.loaded_key = key
                self.last_timings["modelLoadSeconds"] = time.perf_counter() - load_started
        except OSError as exc:
            raise StageFailure("embed", "EMBEDDING_MODEL_UNAVAILABLE", "Pinned SigLIP files are absent from the project model cache. Download requires separate authorization.") from exc
        except torch.OutOfMemoryError as exc:
            if device != "cuda" or not config["cpuFallback"]:
                raise StageFailure("embed", "EMBEDDING_OUT_OF_MEMORY", "Model loading exceeded available memory.") from exc
            self.model, self.processor, self.loaded_key = None, None, None
            torch.cuda.empty_cache()
            self.cpu_fallback_keys.add(fallback_key)
            result = self.embed({**request, "config": {**config, "device": "cpu"}})
            return {**result, "fallback": True}
        encode_started = time.perf_counter()
        try:
            values = self.encode(request["sampleIds"], root, config["maxPatches"], device)
        except torch.OutOfMemoryError as exc:
            if device != "cuda" or not config["cpuFallback"]:
                raise StageFailure("embed", "EMBEDDING_OUT_OF_MEMORY", "Embedding exceeded available memory.") from exc
            self.model = self.model.to("cpu")
            self.loaded_key = (config["model"], config["revision"], "cpu")
            torch.cuda.empty_cache()
            device, fallback = "cpu", True
            self.cpu_fallback_keys.add(fallback_key)
            values = self.encode(request["sampleIds"], root, config["maxPatches"], device)
        self.last_timings["embeddingSeconds"] = time.perf_counter() - encode_started
        return {"value": values, "toolVersion": "transformers-4.57.1", "device": device, "fallback": fallback}

    def encode(self, sample_ids, root, max_patches, device):
        import torch
        values = []
        # Batch size one bounds peak activation memory and keeps inference reproducible.
        for sample_id in sample_ids:
            with Image.open(root / (sample_id + ".png")) as image:
                inputs = self.processor(images=image.convert("RGB"), return_tensors="pt", max_num_patches=max_patches)
            inputs = {name: tensor.to(device) for name, tensor in inputs.items()}
            with torch.inference_mode():
                features = self.model.get_image_features(**inputs)
                if not isinstance(features, torch.Tensor):
                    features = features.pooler_output
                features = torch.nn.functional.normalize(features.float(), dim=-1)
            values.append({"sampleId": sample_id, "vector": features[0].cpu().tolist()})
        return values
