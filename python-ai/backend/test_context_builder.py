import unittest

from context_builder import ContextConfig, build_context_messages


class ContextBuilderTests(unittest.TestCase):
    def test_relevant_memory_and_file_are_selected(self):
        messages = [{"role": "user", "content": "como programar o robô spike"}]
        memories = [
            {"title": "Robótica", "content": "O robô usa LEGO Spike e sensor de cor.", "created_at": "2"},
            {"title": "Receita", "content": "Arroz e feijão.", "created_at": "3"},
        ]
        files = [
            {"name": "spike.py", "text_content": "motor = Motor('A')", "created_at": "2"},
            {"name": "notes.txt", "text_content": "filmes para assistir", "created_at": "3"},
        ]
        merged, meta = build_context_messages(messages, memories, files, [])
        self.assertEqual(merged[0]["role"], "system")
        self.assertIn("Robótica", merged[0]["content"])
        self.assertIn("spike.py", merged[0]["content"])
        self.assertEqual(meta["memories"], 2)
        self.assertEqual(meta["files"], 2)

    def test_context_is_bounded_and_messages_preserved(self):
        messages = [{"role": "user", "content": "alpha"}]
        memories = [{"title": "alpha", "content": "x" * 1000, "created_at": "1"}]
        merged, meta = build_context_messages(
            messages,
            memories,
            [],
            [],
            ContextConfig(max_chars=200, max_item_chars=500),
        )
        self.assertLessEqual(meta["context_chars"], 200)
        self.assertEqual(merged[-1], messages[0])

    def test_no_context_returns_original_messages(self):
        messages = [{"role": "user", "content": "oi"}]
        merged, meta = build_context_messages(messages)
        self.assertEqual(merged, messages)
        self.assertEqual(meta["context_chars"], 0)


if __name__ == "__main__":
    unittest.main()
