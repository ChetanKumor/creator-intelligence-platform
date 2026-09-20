import json
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

import jsonschema
from PIL import Image
import torch
from transformers import AutoImageProcessor, AutoModel, Siglip2Config, Siglip2Model, Siglip2ImageProcessor
from reference_analyzer.siglip import SiglipProvider
from reference_analyzer.media import StageFailure

ROOT = Path(__file__).resolve().parents[2]
CONFIG = {"mode": "siglip", "model": "google/siglip2-base-patch16-naflex", "revision": "b53b807d3a2d5e2b3911292f2d69e5341cdc064c", "device": "cpu", "cpuFallback": False, "maxPatches": 256}


class LocalSiglipTests(unittest.TestCase):
    def setUp(self):
        directory = ROOT / ".test-artifacts/python"
        directory.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=directory)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.sample_id = "sample_" + "a" * 64
        Image.new("RGB", (40, 80), (180, 20, 80)).save(self.root / (self.sample_id + ".png"))
        self.request = {"protocolVersion": "1.0.0", "operation": "embed", "frameRoot": str(self.root), "modelRoot": str(self.root / "models"), "sampleIds": [self.sample_id], "config": CONFIG}

    def test_actual_siglip_processor_and_forward_with_generated_tiny_parameters(self):
        # Generated parameters exercise the installed API. This is NOT pretrained verification.
        torch.manual_seed(7)
        torch.set_num_threads(1)
        config = Siglip2Config(text_config={"vocab_size": 32, "hidden_size": 16, "intermediate_size": 32, "num_hidden_layers": 1, "num_attention_heads": 2},
                              vision_config={"hidden_size": 16, "intermediate_size": 32, "num_hidden_layers": 1, "num_attention_heads": 2, "patch_size": 16, "num_patches": 256})
        model = Siglip2Model(config).eval()
        processor = Siglip2ImageProcessor(patch_size=16, max_num_patches=256)
        with patch.object(AutoImageProcessor, "from_pretrained", return_value=processor) as load_processor, patch.object(AutoModel, "from_pretrained", return_value=model) as load_model:
            provider = SiglipProvider()
            first = provider.embed(self.request)
            self.assertGreater(provider.last_timings["modelLoadSeconds"], 0)
            self.assertGreater(provider.last_timings["embeddingSeconds"], 0)
            second = provider.embed(self.request)
            self.assertEqual(provider.last_timings["modelLoadSeconds"], 0)
            self.assertEqual(first, second)
            self.assertEqual(len(first["value"][0]["vector"]), 16)
            self.assertAlmostEqual(sum(v*v for v in first["value"][0]["vector"]), 1, places=5)
            self.assertEqual(load_model.call_count, 1)
            self.assertTrue(load_model.call_args.kwargs["local_files_only"])
            self.assertTrue(load_processor.call_args.kwargs["local_files_only"])
            self.assertFalse(load_model.call_args.kwargs["trust_remote_code"])
            self.assertEqual(load_model.call_args.kwargs["revision"], CONFIG["revision"])

    def test_missing_weights_fail_without_download(self):
        with self.assertRaises(StageFailure) as error:
            SiglipProvider().embed(self.request)
        self.assertEqual(error.exception.code, "EMBEDDING_MODEL_UNAVAILABLE")
        self.assertFalse(list(self.root.rglob("*.safetensors")))

    def test_synthetic_embedding_stub_and_interchange(self):
        request = {**self.request, "config": {**CONFIG, "mode": "stub", "model": "synthetic-frame-statistics", "revision": "stub-v1"}}
        result = SiglipProvider().embed(request)
        self.assertEqual(len(result["value"][0]["vector"]), 8)
        for filename, value in [("WorkerRequest", request), ("WorkerResponse", {"protocolVersion": "1.0.0", "operation": "embed", **result})]:
            schema = json.loads((ROOT / "schemas/interchange" / (filename + ".schema.json")).read_text(encoding="utf8"))
            jsonschema.Draft202012Validator(schema).validate(value)
            with self.assertRaises(jsonschema.ValidationError):
                jsonschema.Draft202012Validator(schema).validate({**value, "rawProviderPayload": {}})

    def test_network_guard_blocks_before_io(self):
        with self.assertRaisesRegex(RuntimeError, "Network access is disabled"):
            socket.create_connection(("example.invalid", 443))
        with self.assertRaisesRegex(RuntimeError, "Network access is disabled"):
            socket.getaddrinfo("example.invalid", 443)

    def test_gpu_unavailable_and_oom_fallback_are_explicit(self):
        request = {**self.request, "config": {**CONFIG, "device": "cuda"}}
        with patch("torch.cuda.is_available", return_value=False):
            with self.assertRaises(StageFailure) as error:
                SiglipProvider().embed(request)
            self.assertEqual(error.exception.code, "EMBEDDING_DEVICE_UNAVAILABLE")
        # Exercise the fallback path with controlled model doubles; no CUDA installation.
        class ModelDouble:
            config = type("Config", (), {"model_type": "siglip2"})()
            def eval(self): return self
            def to(self, device):
                if device == "cuda": raise torch.OutOfMemoryError("Synthetic OOM")
                return self
        with patch("torch.cuda.is_available", return_value=True), patch("torch.cuda.empty_cache"), patch.object(AutoImageProcessor, "from_pretrained", return_value=object()), patch.object(AutoModel, "from_pretrained", side_effect=lambda *args, **kwargs: ModelDouble()) as load_model, patch.object(SiglipProvider, "encode", return_value=[{"sampleId": self.sample_id, "vector": [1.0, 0.0]}]):
            provider = SiglipProvider()
            fallback_request = {**request, "config": {**request["config"], "cpuFallback": True}}
            response = provider.embed(fallback_request)
            self.assertEqual(response["device"], "cpu")
            self.assertTrue(response["fallback"])
            self.assertEqual(provider.embed(fallback_request), response)
            self.assertEqual(load_model.call_count, 2)  # One failed GPU load, one retained CPU load.

    def test_frame_artifact_ids_cannot_escape_the_cache(self):
        with self.assertRaises(StageFailure):
            SiglipProvider().embed({**self.request, "sampleIds": ["../private"]})
