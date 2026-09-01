import os
import json
import uuid
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv("backend/.env")
    load_dotenv(".env")
except Exception:
    pass

from .prompts import SYSTEM_PROMPT, build_user_prompt, GEMINI_SYSTEM_INSTRUCTION
from .schemas import AICommandResponse

class AIProvider(ABC):
    @abstractmethod
    async def generate_commands(self, prompt: str, context: Dict[str, Any], history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        """Returns dict with 'message' and 'commands' list"""
        pass

class MockProvider(AIProvider):
    """Deterministic mock for testing frontend pipeline without API key - Phase 2 #26"""

    async def generate_commands(self, prompt: str, context: Dict[str, Any], history=None) -> Dict[str, Any]:
        lower = prompt.lower()
        rooms = context.get("rooms") or []
        def find_room(q):
            q = q.lower()
            for r in rooms:
                if q in (r.get("name") or "").lower() or q in (r.get("type") or "").lower():
                    return r
            return rooms[0] if rooms else None

        # kitchen resize
        if "kitchen" in lower and any(w in lower for w in ["wider", "bigger", "larger", "expand", "increase"]):
            k = find_room("kitchen")
            import re
            m = re.search(r"(\d+(\.\d+)?)\s*(ft|feet|')", lower)
            delta = float(m.group(1)) if m else 2
            # check "make it 1 foot smaller" etc handled via history? simplified
            if "smaller" in lower or "reduce" in lower or "narrower" in lower:
                delta = -abs(delta)
            return {
                "message": f"I'll {'shrink' if delta<0 else 'expand'} the kitchen by {abs(delta)} ft.",
                "commands": [{"type": "RESIZE_ROOM", "parameters": {"roomId": k["id"] if k else "room_kitchen", "widthDelta": delta}}]
            }
        if "bathroom" in lower and any(w in lower for w in ["add", "create", "beside", "next to", "near"]):
            master = find_room("master") or find_room("bedroom")
            return {
                "message": "I'll add a bathroom beside the master bedroom.",
                "commands": [{"type": "CREATE_ROOM", "parameters": {"roomType": "bathroom", "name": "Bathroom", "nearRoomId": master["id"] if master else "room_master"}}]
            }
        if "window" in lower and any(w in lower for w in ["add", "create"]):
            living = find_room("living") or (rooms[0] if rooms else None)
            # need wallId - try to use first wall from context if available
            walls = context.get("walls") or []
            wall_id = walls[0]["id"] if walls else "wall_1"
            # if we have roomId, provider should use roomId to let backend resolve wall
            if living:
                return {
                    "message": "I'll add a window to the living room.",
                    "commands": [{"type": "CREATE_WINDOW", "parameters": {"roomId": living["id"], "width": 4}}]
                }
            return {
                "message": "I'll add a window.",
                "commands": [{"type": "CREATE_WINDOW", "parameters": {"wallId": wall_id, "width": 4}}]
            }
        if any(w in lower for w in ["move", "shift"]) and "bedroom" in lower:
            master = find_room("master") or find_room("bedroom")
            pos = "rear_right"
            if "rear" in lower and "left" in lower:
                pos = "rear_left"
            elif "front" in lower and "right" in lower:
                pos = "front_right"
            elif "front" in lower and "left" in lower:
                pos = "front_left"
            elif "rear" in lower:
                pos = "rear_right"
            return {
                "message": f"I'll move the {master['name'] if master else 'bedroom'} to the rear.",
                "commands": [{"type": "MOVE_ROOM", "parameters": {"roomId": master["id"] if master else "room_1", "position": pos}}]
            }
        if "delete" in lower or "remove" in lower:
            # try to find which room to delete
            for r in rooms:
                if (r.get("name") or "").lower() in lower or (r.get("type") or "").lower() in lower:
                    # handle "second bathroom" -> pick second
                    if "second" in lower and "bathroom" in (r.get("type") or ""):
                        baths = [x for x in rooms if "bathroom" in (x.get("type") or "")]
                        if len(baths) >= 2:
                            r = baths[1]
                    return {
                        "message": f"I'll delete {r['name']}.",
                        "commands": [{"type": "DELETE_ROOM", "parameters": {"roomId": r["id"]}}]
                    }
            # fallback bedroom
            b = find_room("bathroom") or find_room("bedroom")
            if b:
                return {"message": f"I'll delete {b['name']}.", "commands": [{"type": "DELETE_ROOM", "parameters": {"roomId": b["id"]}}]}

        if "living room" in lower and "x" in lower:
            # parse dimensions like 18 x 16
            import re
            m = re.search(r"(\d+(\.\d+)?)\s*[x×]\s*(\d+(\.\d+)?)", lower)
            if m:
                w = float(m.group(1))
                h = float(m.group(3))
                living = find_room("living")
                return {
                    "message": f"I'll resize the living room to {w} × {h} ft.",
                    "commands": [{"type": "RESIZE_ROOM", "parameters": {"roomId": living["id"] if living else "room_living", "width": w, "height": h}}]
                }

        # make bigger/smaller generic
        if any(w in lower for w in ["bigger", "larger", "expand", "wider", "smaller", "narrower"]):
            # find any room mentioned
            for r in rooms:
                if (r.get("name") or "").lower() in lower or (r.get("type") or "").replace("-", " ") in lower:
                    import re
                    m = re.search(r"(\d+(\.\d+)?)", lower)
                    delta = float(m.group(1)) if m else 2
                    if any(w in lower for w in ["smaller", "reduce", "narrower", "shrink"]):
                        delta = -abs(delta)
                    return {
                        "message": f"I'll resize {r['name']} by {delta} ft.",
                        "commands": [{"type": "RESIZE_ROOM", "parameters": {"roomId": r["id"], "widthDelta": delta}}]
                    }

        # luxurious etc -> unsupported
        if any(w in lower for w in ["luxurious", "luxury", "beautiful", "material", "color", "style"]):
            return {
                "message": "I can modify the floor-plan layout, rooms, walls, doors and windows right now. Material and visual-style controls will be added later.",
                "commands": []
            }

        # fallback generic
        return {
            "message": "I can help modify your floor plan. Try: 'Make the kitchen 2 feet wider' or 'Add a bathroom beside the master bedroom'.",
            "commands": []
        }

class OpenAICompatibleProvider(AIProvider):
    """
    Universal OpenAI-compatible provider.
    Works with: OpenAI, OpenRouter, GMI Cloud, any OpenAI API compatible endpoint.
    Configure via env:
      AI_API_KEY, AI_MODEL, AI_BASE_URL
      e.g. GMI Cloud: AI_BASE_URL=https://api.gmicloud.ai/v1, AI_MODEL=your-model-id
      OpenRouter: AI_BASE_URL=https://openrouter.ai/api/v1, AI_MODEL=anthropic/claude-3.5-sonnet etc.
      OpenAI: AI_BASE_URL=https://api.openai.com/v1 (default)
    """
    def __init__(self, api_key: str, model: str, base_url: str, timeout: int = 30):
        self.api_key = api_key
        self.model = model
        # Normalize: strip /chat/completions if user included full endpoint URL
        # Handles https://api.gmi-serving.com/v1/chat/completions -> https://api.gmi-serving.com/v1
        nb = base_url.strip().rstrip("/")
        for suffix in ("/chat/completions", "/completions", "/chat/completion"):
            if nb.endswith(suffix):
                nb = nb[: -len(suffix)].rstrip("/")
                break
        self.base_url = nb
        self.timeout = timeout

    async def generate_commands(self, prompt: str, context: Dict[str, Any], history=None) -> Dict[str, Any]:
        user_content = build_user_prompt(prompt, context, history)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        # OpenRouter recommends extra headers - optional
        extra_headers = {}
        # allow user to set via env if needed
        http_referer = os.getenv("OPENROUTER_REFERER") or os.getenv("AI_REFERER")
        x_title = os.getenv("OPENROUTER_TITLE") or os.getenv("AI_TITLE")
        if http_referer:
            headers["HTTP-Referer"] = http_referer
        if x_title:
            headers["X-Title"] = x_title

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.2,
            "max_tokens": 1500,
        }
        # Only request json_object if provider supports it (OpenAI/OpenRouter/GMI do; some don't)
        # Keep it, but tolerate 400 errors with fallback elsewhere.
        payload["response_format"] = {"type": "json_object"}

        url = f"{self.base_url}/chat/completions"
        # helper to call and parse
        async def _call(client: httpx.AsyncClient, pl: Dict[str, Any]):
            resp = await client.post(url, headers=headers, json=pl)
            resp.raise_for_status()
            data = resp.json()
            # handle both choices[0].message.content and direct
            if "choices" in data and data["choices"]:
                content = data["choices"][0].get("message", {}).get("content") or data["choices"][0].get("text") or ""
            else:
                content = data.get("content") or str(data)
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                import re
                m = re.search(r"\{.*\}", content, re.DOTALL)
                if m:
                    parsed = json.loads(m.group(0))
                else:
                    raise
            message = parsed.get("message") or parsed.get("explanation") or ""
            commands = parsed.get("commands") or []
            if isinstance(commands, dict):
                commands = [commands]
            if not commands and "command" in parsed:
                commands = [parsed["command"]] if isinstance(parsed["command"], dict) else parsed["command"]
            return {"message": message, "commands": commands if isinstance(commands, list) else []}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                try:
                    return await _call(client, payload)
                except httpx.HTTPStatusError as e:
                    # Some providers (e.g. some GMI deployments) reject response_format
                    body = ""
                    try:
                        body = e.response.text[:800]
                    except:
                        pass
                    if e.response.status_code == 400 and "response_format" in body.lower():
                        # retry without response_format
                        pl2 = {k: v for k, v in payload.items() if k != "response_format"}
                        try:
                            return await _call(client, pl2)
                        except Exception as e2:
                            body2 = ""
                            try:
                                body2 = getattr(e2, "response", None).text[:500] if hasattr(e2, "response") else str(e2)[:500]
                            except:
                                body2 = str(e2)[:500]
                            return {"message": f"AI provider error ({e.response.status_code}) at {url}: {body} | retry: {body2}", "commands": [], "_error": str(e)}
                    # include url in error for debugging double-suffix issue
                    if e.response.status_code == 404:
                        return {"message": f"AI provider error (404) at {url}: {body} . Check AI_BASE_URL should be https://api.gmi-serving.com/v1 (without /chat/completions)", "commands": [], "_error": str(e)}
                    return {"message": f"AI provider error ({e.response.status_code}) at {url}: {body}", "commands": [], "_error": str(e)}
        except httpx.HTTPStatusError as e:
            body = ""
            try:
                body = e.response.text[:500]
            except:
                pass
            return {"message": f"AI provider error ({e.response.status_code}) at {url}: {body}", "commands": [], "_error": str(e)}
        except Exception as e:
            return {"message": f"AI provider error at {url}: {str(e)[:400]}", "commands": [], "_error": str(e)}

class GeminiProvider(AIProvider):
    """
    Native Gemini provider via Google Generative Language API.
    Env: AI_API_KEY (Gemini API key), AI_MODEL (e.g., gemini-1.5-flash, gemini-1.5-pro)
    """
    def __init__(self, api_key: str, model: str, timeout: int = 30):
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def generate_commands(self, prompt: str, context: Dict[str, Any], history=None) -> Dict[str, Any]:
        user_content = build_user_prompt(prompt, context, history)
        # Gemini uses systemInstruction separately
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "systemInstruction": {"parts": [{"text": GEMINI_SYSTEM_INSTRUCTION}]},
            "contents": [{"role": "user", "parts": [{"text": user_content}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 1500,
                "responseMimeType": "application/json",
            },
        }
        headers = {"Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                # extract text
                candidates = data.get("candidates") or []
                if not candidates:
                    return {"message": "No response from Gemini", "commands": []}
                parts = candidates[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts)
                parsed = json.loads(text)
                message = parsed.get("message") or ""
                commands = parsed.get("commands") or []
                if isinstance(commands, dict):
                    commands = [commands]
                return {"message": message, "commands": commands if isinstance(commands, list) else []}
        except Exception as e:
            return {"message": f"Gemini error: {str(e)[:300]}", "commands": [], "_error": str(e)}

class AnthropicProvider(AIProvider):
    """
    Native Anthropic provider.
    Env: AI_API_KEY, AI_MODEL (e.g., claude-3-5-sonnet-20240620)
    """
    def __init__(self, api_key: str, model: str, timeout: int = 30):
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def generate_commands(self, prompt: str, context: Dict[str, Any], history=None) -> Dict[str, Any]:
        user_content = build_user_prompt(prompt, context, history)
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": self.model,
            "max_tokens": 1500,
            "temperature": 0.2,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_content}],
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                # content blocks
                blocks = data.get("content") or []
                text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
                # extract JSON
                import re
                m = re.search(r"\{.*\}", text, re.DOTALL)
                if m:
                    parsed = json.loads(m.group(0))
                else:
                    parsed = json.loads(text)
                message = parsed.get("message") or ""
                commands = parsed.get("commands") or []
                if isinstance(commands, dict):
                    commands = [commands]
                return {"message": message, "commands": commands if isinstance(commands, list) else []}
        except Exception as e:
            return {"message": f"Anthropic error: {str(e)[:300]}", "commands": [], "_error": str(e)}

# Factory

def get_provider() -> AIProvider:
    """
    Factory that returns configured provider based on env.
    Supports:
      AI_PROVIDER=mock|openai|gemini|anthropic (default mock if no key)
      AI_API_KEY, AI_MODEL, AI_BASE_URL
      AI_TIMEOUT optional
    Universal: Any OpenAI-compatible (OpenRouter, GMI Cloud, etc.) use AI_PROVIDER=openai + AI_BASE_URL
    """
    provider_name = (os.getenv("AI_PROVIDER") or "").strip().lower()
    api_key = os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or os.getenv("GEMINI_API_KEY") or ""
    model = os.getenv("AI_MODEL") or ""
    base_url = os.getenv("AI_BASE_URL") or os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"
    timeout = int(os.getenv("AI_TIMEOUT") or "30")

    # auto-detect: if no provider but key exists, assume openai-compatible
    if not provider_name:
        if api_key and model:
            provider_name = "openai"
        else:
            provider_name = "mock"

    if provider_name in ("mock", "none", "local"):
        return MockProvider()

    if provider_name in ("openai", "openai-compatible", "openrouter", "gmi", "gmicloud"):
        if not api_key:
            print("[AI] Warning: AI_PROVIDER=openai but no AI_API_KEY - falling back to mock")
            return MockProvider()
        if not model:
            model = "gpt-4o-mini"
        return OpenAICompatibleProvider(api_key=api_key, model=model, base_url=base_url, timeout=timeout)

    if provider_name in ("gemini", "google", "google-gemini"):
        if not api_key:
            print("[AI] Warning: AI_PROVIDER=gemini but no key - mock fallback")
            return MockProvider()
        if not model:
            model = "gemini-1.5-flash"
        return GeminiProvider(api_key=api_key, model=model, timeout=timeout)

    if provider_name in ("anthropic", "claude"):
        if not api_key:
            print("[AI] Warning: AI_PROVIDER=anthropic but no key - mock fallback")
            return MockProvider()
        if not model:
            model = "claude-3-5-sonnet-20240620"
        return AnthropicProvider(api_key=api_key, model=model, timeout=timeout)

    print(f"[AI] Unknown AI_PROVIDER={provider_name}, using mock")
    return MockProvider()

# For listing available providers (health/debug)
def get_provider_info() -> Dict[str, Any]:
    provider_name = (os.getenv("AI_PROVIDER") or "mock").lower()
    model = os.getenv("AI_MODEL") or ""
    base_url = os.getenv("AI_BASE_URL") or ""
    has_key = bool(os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY"))
    return {
        "provider": provider_name or ("openai" if has_key else "mock"),
        "model": model or ("gpt-4o-mini" if has_key else "mock"),
        "base_url": base_url or "https://api.openai.com/v1",
        "has_key": has_key,
    }
