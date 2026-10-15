"""OCR and speech-to-text for the Receipt Agent: Gemini multimodal, or local Ollama vision + Whisper (see llm.py).

Both functions read a previously uploaded file by attachment_id and return *proposed* data: one expense for a
voice note, a whole bill (header plus every line item) for a photo. Nothing is saved here; the user must confirm first.
"""
import base64
import json
import os
import re
import urllib.request
from pathlib import Path

from pydantic import ValidationError

from . import db, llm, stt
from .schemas import BillFields, ReceiptFields

UPLOADS = Path(os.environ.get("FINMATE_UPLOADS", Path(__file__).resolve().parent.parent / "uploads"))

_FIELDS_PROMPT = (
    "Extract ONE expense from this {kind}. Reply with a single JSON object and nothing else, with exactly these keys:\n"
    '- "amount": number, the FINAL total actually paid in rupees (the grand total / "Amount received" / "Card Payment" / '
    "bold total; never a subtotal, tax, item price, quantity or discount)\n"
    '- "date": the bill date as YYYY-MM-DD. Indian receipts print DD/MM/YYYY (28/09/2026 means 28 September 2026). '
    "Today is {today}; if no date is visible use today\n"
    '- "merchant": the store or service brand a person would recognise (for example DMart, RajKamal Oils, Central Railway), '
    "not the legal company name, branch or address\n"
    '- "category": exactly one of Transport, Food, Groceries, Shopping, Entertainment, Utilities, Health, Other '
    "(train/bus/cab tickets and fuel are Transport; supermarkets, oils, dairy and kirana are Groceries)\n"
    '- "note": at most 10 words naming the main items or the route\n'
    '- "unclear_fields": list of the keys above you are not sure about, else []\n'
    '- "transcript": the spoken words if this is audio, else ""'
)


_BILL_PROMPT = (
    "Read this bill / receipt completely and reply with a single JSON object and nothing else, with exactly these keys:\n"
    '- "merchant": the store or service brand a person would recognise (for example DMart, RajKamal Oils, Central Railway), '
    "not the legal company name, branch or address\n"
    '- "date": the date printed on the bill, copied exactly as printed (for example 30/09/2026 or 28/09/2026). '
    'Indian bills use DD/MM/YYYY. Use "" only if no date is printed anywhere; never guess today\'s date\n'
    '- "total": number, the FINAL amount actually paid in rupees (grand total / "Amount received" / "Card Payment")\n'
    '- "bill_number": the bill or invoice number, else ""\n'
    '- "payment_method": Card, Cash or UPI if shown, else ""\n'
    '- "items": a list with EVERY purchased line, top to bottom, none skipped and none repeated. Each item is an object '
    '{{"name": the product name as printed, written out in plain words (for example "Amul Fresh Cream 250ml"), '
    '"quantity": number or null, "unit_price": the rate (price of one unit) or null, "amount": the value of the whole line, '
    'which is the right-most number on that line and equals quantity x rate (for 2 pieces at 18.60 the amount is 37.20), '
    '"category": exactly one of Transport, Food, Groceries, Shopping, Entertainment, Utilities, Health, Other}}\n'
    '- "unclear_fields": the keys above you are not sure about, else []\n'
    "Rules: judge each item's category from the item itself. Staples, dairy, oil, spices, fruit, vegetables and household "
    "goods are Groceries; sweets, snacks, instant noodles, cooked food and drinks are Food; tickets and fuel are Transport. "
    "Never list totals, tax or GST summary rows, 'Items: / Qty:' count lines, payment lines, savings or MRP lines as items. "
    "A ticket or a one-line bill has exactly one item."
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
    return {"merchant": "Uber", "date": db.today().isoformat(), "total": 450, "bill_number": "", "payment_method": "UPI",
            "items": [{"name": "Home to Office", "quantity": 1, "unit_price": 450, "amount": 450, "category": "Transport"}],
            "unclear_fields": []}


def register_attachment(attachment_id: str, user_id: str) -> None:
    """Record who uploaded a file, so only that user's agents can read it."""
    with db.connect() as c:
        c.execute("INSERT INTO attachments (id, user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (attachment_id, user_id))


def _assert_owner(attachment_id: str, user_id: str) -> None:
    with db.connect() as c:
        row = c.execute("SELECT user_id FROM attachments WHERE id=%s", (attachment_id,)).fetchone()
    # Same error for "missing" and "someone else's" so ids can't be probed.
    if row is None or row["user_id"] != user_id:
        raise FileNotFoundError(f"no attachment {attachment_id!r}")


def _parse_fields(text: str) -> dict:
    """Parse a model's raw answer into validated fields (plain dict, JSON-safe). Raises ValidationError/ValueError."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    raw = json.loads(text[start:end + 1] if start != -1 and end != -1 else text)
    if not isinstance(raw, dict):
        raise ValueError("model did not return a JSON object")
    return ReceiptFields.model_validate(raw).as_json()


def _parse_bill(text: str) -> dict:
    """Parse a model's raw answer into a validated, reconciled bill (plain dict, JSON-safe)."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    raw = json.loads(text[start:end + 1] if start != -1 and end != -1 else text)
    if not isinstance(raw, dict):
        raise ValueError("model did not return a JSON object")
    return BillFields.model_validate(raw).as_json()


def _validated(ask, repair: bool = True, parse=_parse_fields) -> dict:
    """Run `ask(extra_prompt)` and validate. On a bad answer, retry ONCE telling the model exactly what was wrong.
    An empty answer is not repairable (the model ran out of tokens), so it fails straight away."""
    try:
        return parse(ask(""))
    except (ValueError, ValidationError) as first:  # JSONDecodeError is a ValueError
        if isinstance(first, json.JSONDecodeError) and not first.doc.strip():
            raise ValueError("the model returned no answer") from first
        problem = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in first.errors()) \
            if isinstance(first, ValidationError) else str(first)
        if not repair:
            raise ValueError(problem) from first
        try:
            return parse(ask(f"\n\nYour previous answer was rejected: {problem}. Reply again with corrected JSON only."))
        except (ValueError, ValidationError) as second:
            raise ValueError(f"Could not read a valid bill from this file ({problem}). Enter it manually.") from second


def _gemini_extract(path: Path, kind: str) -> dict:
    from google import genai
    from google.genai import types

    mime = _MIME.get(path.suffix.lower())
    if mime is None:
        raise ValueError(f"unsupported file type {path.suffix!r}")
    data = path.read_bytes()
    bill = kind != "voice note"
    prompt = (_BILL_PROMPT if bill else _FIELDS_PROMPT).format(kind=kind, today=db.today().isoformat())

    def ask(extra: str) -> str:
        resp = genai.Client().models.generate_content(
            model=llm.gemini_model(), contents=[types.Part.from_bytes(data=data, mime_type=mime), prompt + extra],
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0))
        return resp.text

    return _validated(ask, parse=_parse_bill if bill else _parse_fields)


def _prepare_image(path: Path, rotate: int = 0) -> bytes:
    """Upright (EXIF) and downscale phone photos. Big images cost far more vision tokens and time with no accuracy gain."""
    data = path.read_bytes()
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return data
    import io

    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    except OSError:
        return data  # not a decodable image; let the model report it
    if rotate:
        img = img.rotate(-rotate, expand=True)  # clockwise degrees
    edge = int(os.environ.get("FINMATE_VISION_MAX_EDGE", "1600"))
    if max(img.size) > edge:
        img.thumbnail((edge, edge))
    out = io.BytesIO()
    img.convert("RGB").save(out, format="JPEG", quality=90)
    return out.getvalue()


def _ollama_chat(model: str, prompt: str, images: list[str] | None = None, num_predict: int | None = None) -> str:
    """One Ollama chat call. Grammar-constrained `format` is not used: vision models in current Ollama builds fail with
    a 500 on it, so strictness comes from the pydantic validation in _validated() instead."""
    body = {"model": model, "stream": False, "think": False,
            "options": {"temperature": 0, "num_predict": num_predict or int(os.environ.get("FINMATE_OLLAMA_NUM_PREDICT", "1400")), **llm.ollama_options()},
            "keep_alive": os.environ.get("FINMATE_OLLAMA_KEEP_ALIVE", "30m"),
            "messages": [{"role": "user", "content": prompt, **({"images": images} if images else {})}]}
    req = urllib.request.Request(f"{llm.ollama_base()}/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=int(os.environ.get("FINMATE_OLLAMA_TIMEOUT", "180"))) as r:
        return json.load(r)["message"]["content"]


def _transcribe(path: Path) -> str:
    """Voice-note transcription for the local (Ollama) path: the shared local Whisper engine in stt.py."""
    return stt.transcribe_local(path)


def _ollama_extract(path: Path, kind: str) -> dict:
    prompt = _FIELDS_PROMPT.format(kind=kind, today=db.today().isoformat())
    if kind == "voice note":
        transcript = _transcribe(path)
        if not transcript:
            raise ValueError("could not hear any speech in the voice note")
        model = llm.ollama_tag("receipt")
        fields = _validated(lambda extra: _ollama_chat(model, f'{prompt}\n\nThe words spoken were: "{transcript}"{extra}'))
        fields["transcript"] = transcript
        return fields
    if path.suffix.lower() not in _MIME:
        raise ValueError(f"unsupported file type {path.suffix!r}")
    model = llm.ollama_vision_tag()
    bill_prompt = _BILL_PROMPT.format(today=db.today().isoformat())
    budget = int(os.environ.get("FINMATE_OLLAMA_BILL_NUM_PREDICT", "3500"))  # a long bill is 30+ lines of JSON
    # Phone photos are often sideways. Read it upright first; only if that yields nothing usable, try the rotations.
    last = "no attempt made"
    for rotate in (0, 90, 270):
        image = base64.b64encode(_prepare_image(path, rotate)).decode()
        try:
            return _validated(lambda extra, image=image: _ollama_chat(model, bill_prompt + extra, [image], budget),
                              repair=(rotate == 0), parse=_parse_bill)
        except ValueError as exc:
            last = str(exc)
    raise ValueError(f"Could not read a valid bill from this photo ({last}). Try a straighter, closer photo or enter it manually.")


def extract(attachment_id: str, kind: str, user_id: str) -> dict:
    """kind is 'receipt image' or 'voice note'. user_id must be the uploader. Provider is chosen by FINMATE_LLM_PROVIDER."""
    _assert_owner(attachment_id, user_id)
    path = find_attachment(attachment_id)
    # A voice note is one expense ("fields"); a photo is a whole bill with line items ("bill").
    key = "fields" if kind == "voice note" else "bill"
    if os.environ.get("FINMATE_FAKE_VISION") == "1":
        return {key: _fake(kind), "attachment_id": attachment_id}
    out = _ollama_extract(path, kind) if llm.provider() == "ollama" else _gemini_extract(path, kind)
    return {key: out, "attachment_id": attachment_id}
