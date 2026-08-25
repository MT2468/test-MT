from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_code_runner():
    response = client.post("/api/code/run", json={"code": "print(6 * 7)"})
    assert response.status_code == 200
    assert "42" in response.json()["stdout"]


def test_memory_roundtrip():
    saved = client.post("/api/memory", json={"text": "Nexus test memory"})
    assert saved.status_code == 200
    listed = client.get("/api/memory")
    assert any(item["text"] == "Nexus test memory" for item in listed.json()["items"])
