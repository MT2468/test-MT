import os
import unittest
from unittest.mock import patch

from model_router import ProviderTarget, configured_targets


class RouterConfigTests(unittest.TestCase):
    def test_defaults_to_ollama_without_keys(self):
        with patch.dict(os.environ, {}, clear=True):
            targets = configured_targets()
        self.assertEqual([t.name for t in targets], ["ollama"])
        self.assertEqual(targets[0].base_url, "http://localhost:11434")
        self.assertFalse(targets[0].public_dict()["has_api_key"])

    def test_order_and_deduplication(self):
        env = {
            "PYTHON_AI_PROVIDER_ORDER": "openai,ollama,openai,unknown",
            "PYTHON_AI_OPENAI_BASE": "http://localhost:1234/v1/",
            "PYTHON_AI_OPENAI_KEY": "super-secret",
            "PYTHON_AI_OPENAI_MODEL": "local-compatible-model",
            "PYTHON_AI_OLLAMA_MODEL": "qwen2.5:3b",
        }
        with patch.dict(os.environ, env, clear=True):
            targets = configured_targets()
        self.assertEqual([t.name for t in targets], ["openai", "ollama"])
        self.assertEqual(targets[0].base_url, "http://localhost:1234/v1")
        self.assertEqual(targets[0].model, "local-compatible-model")
        self.assertEqual(targets[1].model, "qwen2.5:3b")

    def test_public_metadata_never_returns_secret(self):
        target = ProviderTarget("openai", "http://localhost:1234", "model", "do-not-leak")
        public = target.public_dict()
        self.assertNotIn("api_key", public)
        self.assertNotIn("do-not-leak", str(public))
        self.assertTrue(public["has_api_key"])

    def test_openai_without_base_is_skipped(self):
        env = {"PYTHON_AI_PROVIDER_ORDER": "openai,ollama"}
        with patch.dict(os.environ, env, clear=True):
            targets = configured_targets()
        self.assertEqual([t.name for t in targets], ["ollama"])


if __name__ == "__main__":
    unittest.main()
