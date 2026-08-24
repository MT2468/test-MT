import os
import unittest
from unittest.mock import patch

from model_router import ProviderTarget, configured_targets, public_routes, stream_with_fallback


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
        self.assertNotIn("do-not-leak", str(public_routes([target])))

    def test_openai_without_base_is_skipped(self):
        env = {"PYTHON_AI_PROVIDER_ORDER": "openai,ollama"}
        with patch.dict(os.environ, env, clear=True):
            targets = configured_targets()
        self.assertEqual([t.name for t in targets], ["ollama"])


class RouterStreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_falls_back_when_primary_fails_before_first_token(self):
        targets = [
            ProviderTarget("ollama", "http://ollama", "model-a"),
            ProviderTarget("openai", "http://compatible", "model-b"),
        ]

        async def fail_before(*args, **kwargs):
            raise ConnectionError("offline")
            yield "unreachable"

        async def secondary(*args, **kwargs):
            yield "hello"
            yield " world"

        with patch("model_router._stream_ollama", fail_before), patch("model_router._stream_openai", secondary):
            chunks = [item async for item in stream_with_fallback([], targets=targets)]

        self.assertEqual(chunks, [("openai", "hello"), ("openai", " world")])

    async def test_does_not_fallback_after_stream_has_started(self):
        targets = [
            ProviderTarget("ollama", "http://ollama", "model-a"),
            ProviderTarget("openai", "http://compatible", "model-b"),
        ]
        secondary_called = False

        async def fail_after(*args, **kwargs):
            yield "partial"
            raise ConnectionError("dropped")

        async def secondary(*args, **kwargs):
            nonlocal secondary_called
            secondary_called = True
            yield "should-not-appear"

        with patch("model_router._stream_ollama", fail_after), patch("model_router._stream_openai", secondary):
            stream = stream_with_fallback([], targets=targets)
            first = await anext(stream)
            self.assertEqual(first, ("ollama", "partial"))
            with self.assertRaisesRegex(RuntimeError, "após iniciar o streaming"):
                await anext(stream)

        self.assertFalse(secondary_called)

    async def test_model_override_applies_without_mutating_targets(self):
        target = ProviderTarget("ollama", "http://ollama", "default-model")
        seen_model = None

        async def capture(*args, **kwargs):
            nonlocal seen_model
            seen_model = args[1].model
            yield "ok"

        with patch("model_router._stream_ollama", capture):
            chunks = [item async for item in stream_with_fallback([], targets=[target], model_override="chosen-model")]

        self.assertEqual(chunks, [("ollama", "ok")])
        self.assertEqual(seen_model, "chosen-model")
        self.assertEqual(target.model, "default-model")


if __name__ == "__main__":
    unittest.main()
