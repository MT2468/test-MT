import asyncio
import io
import tempfile
import unittest
from pathlib import Path

from starlette.datastructures import UploadFile

import server


class ServerUpdateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        server.DATA = Path(self.tmp.name)
        server.FILES = server.DATA / 'files'
        server.FILES.mkdir(parents=True, exist_ok=True)
        server.DB = server.DATA / 'test.db'
        with server.connect() as c:
            c.executescript(server.SCHEMA)
            c.commit()

    def tearDown(self):
        self.tmp.cleanup()

    def test_conversation_patch_preserves_id_and_created_at(self):
        created = server.create_conversation(server.ConversationRequest(title='Original', project_id='p1'))
        updated = server.update_conversation(
            created['id'],
            server.ConversationUpdate(title='Renomeada', project_id='p2'),
        )
        self.assertEqual(updated['id'], created['id'])
        self.assertEqual(updated['created_at'], created['created_at'])
        self.assertEqual(updated['title'], 'Renomeada')
        self.assertEqual(updated['project_id'], 'p2')
        self.assertGreaterEqual(updated['updated_at'], created['updated_at'])

    def test_memory_patch_preserves_id_and_created_at(self):
        created = server.create_memory(server.MemoryRequest(title='Antes', content='conteudo 1'))
        updated = server.update_memory(
            created['id'],
            server.MemoryRequest(title='Depois', content='conteudo 2'),
        )
        self.assertEqual(updated['id'], created['id'])
        self.assertEqual(updated['created_at'], created['created_at'])
        self.assertEqual(updated['title'], 'Depois')
        self.assertEqual(updated['content'], 'conteudo 2')
        with server.connect() as c:
            row = c.execute('select * from memories where id=?', (created['id'],)).fetchone()
        self.assertEqual(row['title'], 'Depois')
        self.assertEqual(row['content'], 'conteudo 2')
        self.assertIsNotNone(row['updated_at'])

    def test_file_put_preserves_id_and_created_at(self):
        original = UploadFile(filename='nota.txt', file=io.BytesIO(b'primeira versao'))
        created = asyncio.run(server.upload(original))
        changed = UploadFile(filename='nota-renomeada.txt', file=io.BytesIO(b'segunda versao'))
        updated = asyncio.run(server.update_file(created['id'], changed))

        self.assertEqual(updated['id'], created['id'])
        self.assertEqual(updated['created_at'], created['created_at'])
        self.assertEqual(updated['name'], 'nota-renomeada.txt')
        self.assertGreaterEqual(updated['updated_at'], created['updated_at'])
        self.assertEqual(server.file_text(created['id']), 'segunda versao')
        with server.connect() as c:
            row = c.execute('select * from files where id=?', (created['id'],)).fetchone()
        self.assertEqual(row['id'], created['id'])
        self.assertEqual(row['name'], 'nota-renomeada.txt')
        self.assertIsNotNone(row['updated_at'])

    def test_file_put_rejects_missing_id(self):
        changed = UploadFile(filename='x.txt', file=io.BytesIO(b'x'))
        with self.assertRaises(server.HTTPException) as file_error:
            asyncio.run(server.update_file('missing', changed))
        self.assertEqual(file_error.exception.status_code, 404)

    def test_missing_records_return_404(self):
        with self.assertRaises(server.HTTPException) as conv_error:
            server.update_conversation('missing', server.ConversationUpdate(title='x', project_id=None))
        self.assertEqual(conv_error.exception.status_code, 404)

        with self.assertRaises(server.HTTPException) as memory_error:
            server.update_memory('missing', server.MemoryRequest(title='x', content='y'))
        self.assertEqual(memory_error.exception.status_code, 404)


if __name__ == '__main__':
    unittest.main()
