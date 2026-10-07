"""OCR and speech-to-text for the Receipt Agent, done by Gemini multimodal (no extra installs).

Both functions read a previously uploaded file by attachment_id and return *proposed* expense
fields. Nothing is saved here; the user must confirm first.
"""
import json
import os
from pathlib import Path

from . import db

UPLOADS = Path(os.environ.get("FINMATE_UPLOADS", Path(__file__).resolve().parent.parent / "uploads"))

_FIELDS_PROMPT = (
    "Extract ONE expense from this {kind}. Respond with JSON only, keys: "
    "amount (number, rupees), date (YYYY-MM-DD; today is {today}; if no date is visible use today), "
    "merchant (string), category (one of Transport, Food, Groceries, Shopping, Entertainment, "
    "Utilities, Health, Other), note (short description, e.g. the route or items), "
    "unclear_fields (list of field names you are not sure about), "
    "transcript (the spoken words if audio, else empty string)."
)


def find_attachment(attachment_id: str) -> Path:
    safe = "".join(ch for ch in attachment_id if ch.isalnum() or ch in "-_.")
    matches = list(UPLOADS.glob(f"{safe}.*"))
    if not matches:
        raise FileNotFoundError(f"no attachment {attachment_id!r}")
    return matches[0]


_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
         ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".flac": "audio/flac",
         ".aac": "audio/aac", ".m4a": "audio/aac"}


def _fake(kind: str) -> dict:
    """Deterministic output for offline tests (FINMATE_FAKE_VISION=1)."""
    if kind == "voice note":
        return {"amount": 450, "date": db.today().isoformat(), "merchant": "Uber", "category": "Transport",
                "note": "Home to Office", "unclear_fields": [], "transcript": "spent 450 on cab"}
    return {"amount": 450, "date": db.today().isoformat(), "merchant": "Uber", "category": "Transport",
            "note": "Home to Office", "unclear_fields": [], "transcript": ""}


def extract(attachment_id: str, kind: str) -> dict:
    """kind is 'receipt image' or 'voice note'."""
    path = find_attachment(attachment_id)
    if os.environ.get("FINMATE_FAKE_VISION") == "1":
        return {"fields": _fake(kind), "attachment_id": attachment_id}

    from google import genai
    from google.genai import types

    mime = _MIME.get(path.suffix.lower())
    if mime is None:
        raise ValueError(f"unsupported file type {path.suffix!r}")
    client = genai.Client()
    resp = client.models.generate_content(
        model=os.environ.get("FINMATE_MODEL", "gemini-3.8-flash"),
        contents=[
            types.Part.from_bytes(data=path.read_bytes(), mime_type=mime),
            _FIELDS_PROMPT.format(kind=kind, today=db.today().isoformat()),
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0),
    )
    fields = json.loads(resp.text)
    return {"fields": fields, "attachment_id": attachment_id}
