# Python AI — v3

Aplicação web instalável com chat, histórico local, memória, projetos, arquivos, voz, ferramentas, command palette e múltiplos provedores de IA. O frontend não exige build e funciona diretamente no GitHub Pages.

## Abrir

Quando o GitHub Pages estiver habilitado:

`https://mt2468.github.io/test-MT/`

A raiz do repositório redireciona para `python-ai/web/`, que também é o diretório publicado pelo workflow de Pages.

## Provedores

- **Automático**: tenta Chrome AI e usa demonstração como fallback.
- **Chrome AI**: Prompt API do navegador, quando disponível.
- **Ollama**: padrão `http://localhost:11434`.
- **OpenAI compatível**: endpoint `/v1/chat/completions` configurado no navegador.
- **Backend Python AI**: FastAPI desta pasta.

Nenhuma chave é versionada. Chaves digitadas na UI ficam apenas no `localStorage` do navegador.

## Backend

```bash
cd python-ai/backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload
```

Principais variáveis:

- `PYTHON_AI_PROVIDER=ollama|openai`
- `PYTHON_AI_MODEL=llama3.2:3b`
- `PYTHON_AI_OLLAMA_URL=http://localhost:11434`
- `PYTHON_AI_OPENAI_BASE=https://...`
- `PYTHON_AI_OPENAI_KEY=...`
- `PYTHON_AI_CORS_ORIGINS=https://mt2468.github.io`
- `PYTHON_AI_DATA=./data`

## Segurança

Uploads são limitados, nomes são normalizados e apenas arquivos textuais pequenos são indexados como texto. Execução arbitrária de Python não é exposta pelo servidor público: isso só deve ser adicionado com sandbox isolada por contêiner.
