# Nexus AI — Unified Chat v2 plan

## Product rule
Nexus should feel like one conversation, not a collection of mini-apps. Chat is the operating surface. Models and tools are infrastructure behind it.

## Primary experience
1. User opens Nexus and lands in one chat.
2. Auto mode inspects the request and chooses a suitable model/capability.
3. Attachments are uploaded once and become multimodal context in the same conversation.
4. Research, Python, image/video generation, artifact creation, voice and memory happen inline.
5. Outputs that are files are stored in Puter cloud storage and rendered as file cards with a direct read link.
6. Conversations persist and can be resumed/exported.

## Modes inside the composer
- Auto: default routing and tool use.
- Research: enables web search and asks for sourced, current answers.
- Code: stronger software-engineering prompt and Python execution tool.
- Create: favors images, videos and work artifacts.
- Council: queries several capable models and synthesizes a final answer.

These are not separate pages. They only change how the same chat behaves.

## Tools available to the model
- Web search when supported by the selected OpenAI model.
- `create_artifact`: TXT, Markdown, HTML, JSON, CSV, PDF, DOCX, XLSX and PPTX.
- `run_python`: lazy-loaded Pyodide sandbox in the browser.
- `generate_image`: Puter AI image generation.
- `generate_video`: Puter AI text-to-video.
- `remember_fact`: persistent Puter KV memory.

## Files
- Multiple local uploads.
- Puter cloud upload.
- PDF/image/video/file context through `puter_path` content blocks.
- Attachment chips in composer.
- Generated-file cards in the transcript.
- Direct read URLs with expiration.
- Copy-link action.
- Export current chat to Markdown and receive a direct URL.

## Voice
- Browser microphone recording.
- Puter speech-to-text transcription.
- Puter text-to-speech playback for assistant messages.
- Voice input lands in the normal composer instead of a separate voice page.

## Memory and conversations
- Cloud-backed chat list via Puter KV.
- New chat and resume data model.
- Auto-save after each turn.
- Long-term facts stored separately from transcript history.
- Recent memories injected into the system context.

## Responsive/mobile design
- `100dvh` app shell and safe-area support.
- Desktop history rail; mobile slide-over drawer.
- Sticky compact top bar.
- Composer fixed to the bottom of the chat region.
- Horizontal mode/tool rail instead of separate feature pages.
- Large tap targets, no hover-only actions.
- Attachment tray that wraps/scrolls on phones.
- Result media constrained to viewport width.
- PWA manifest + service worker as a follow-up shell improvement.

## Quality/security guardrails
- No API secrets in the repository.
- Generated cloud links are bearer links and surface an expiry note.
- Python runs in WebAssembly/Pyodide rather than arbitrary host shell access.
- Tool loop has an execution cap to avoid runaway calls.
- Destructive local-device/computer control is not exposed in this browser build.

## v2 implementation scope
- Unified chat UI.
- Mobile redesign.
- Dynamic model catalog and Auto routing.
- Attachments and multimodal messages.
- Research web search.
- Council mode.
- Python tool.
- Image/video tools.
- Work artifact generation + direct links.
- Voice transcription + TTS.
- Persistent sessions + memory.
- Export conversation.

## Next expansion after v2
- Hosted Python backend connected to the same UI for stronger sandboxing.
- Realtime speech-to-speech with interruption.
- Full Deep Research manager with parallel agents/citation inspector.
- Browser/computer-use agent with explicit confirmations.
- MCP connector manager.
- GitHub coding agent with branches/tests/PRs from inside Nexus.
- Rich artifact previews/editors.
- Collaborative shared projects and team permissions.
- Background tasks/notifications where the hosting platform supports them.
