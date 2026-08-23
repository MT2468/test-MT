# Python AI — edição definitiva

Aplicação web instalável com interface própria, histórico, memória, projetos, arquivos, voz e ferramentas. O frontend é dependency-free para abrir com máxima confiabilidade no GitHub Pages. O backend Python/FastAPI é opcional e oferece SSE, SQLite, uploads, calculadora e conexão com Ollama ou API compatível com OpenAI.

## Link
Após o workflow publicar: **https://mt2468.github.io/test-MT/**

## Provedores de IA
1. **Automático**: tenta `LanguageModel` (Prompt API do Chrome) e cai para modo local demo.
2. **Chrome AI**: modelo nativo, quando disponível no navegador/origem.
3. **Ollama**: por padrão `http://localhost:11434`.
4. **OpenAI compatível**: endpoint `/v1/chat/completions` e chave salva apenas no navegador.
5. **Backend Python AI**: servidor opcional desta pasta.

## Backend
```bash
cd backend
python -m venv .venv
# ative o ambiente
pip install -r requirements.txt
uvicorn server:app --reload
```
Variáveis opcionais: `PYTHON_AI_PROVIDER`, `PYTHON_AI_MODEL`, `PYTHON_AI_OLLAMA_URL`, `PYTHON_AI_OPENAI_BASE`, `PYTHON_AI_OPENAI_KEY`, `PYTHON_AI_CORS_ORIGINS`, `PYTHON_AI_DATA`.

## Segurança
Nenhuma chave está no repositório. O frontend guarda configuração em `localStorage`. O backend normaliza nomes de upload e limita arquivos a 10 MB. Execução Python arbitrária não foi exposta publicamente: isso exigiria sandbox isolada por contêiner para ser seguro.
