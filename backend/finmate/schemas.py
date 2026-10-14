"""Strict, typed shapes for everything a model extracts or proposes.

Local models cannot always use grammar-constrained decoding, and even Gemini can drift, so the contract is enforced
here with pydantic: messy model output is normalised (currency symbols, DD/MM/YYYY dates, category synonyms) and then
validated hard. Anything that still does not fit raises ValidationError, which the caller turns into one repair retry.
"""
import re
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import db

Category = Literal["Transport", "Food", "Groceries", "Shopping", "Entertainment", "Utilities", "Health", "Other"]
FIELD_NAMES = ("amount", "date", "merchant", "category", "note")

_ALIASES = {
    "grocery": "Groceries", "supermarket": "Groceries", "kirana": "Groceries", "provisions": "Groceries",
    "dining": "Food", "restaurant": "Food", "meal": "Food", "food delivery": "Food", "cafe": "Food", "snacks": "Food",
    "travel": "Transport", "commute": "Transport", "cab": "Transport", "taxi": "Transport", "train": "Transport",
    "railway": "Transport", "bus": "Transport", "metro": "Transport", "fuel": "Transport", "petrol": "Transport",
    "medical": "Health", "pharmacy": "Health", "medicine": "Health", "healthcare": "Health",
    "electricity": "Utilities", "water": "Utilities", "gas": "Utilities", "internet": "Utilities", "recharge": "Utilities",
    "fun": "Entertainment", "movies": "Entertainment", "leisure": "Entertainment",
    "clothes": "Shopping", "clothing": "Shopping", "retail": "Shopping", "electronics": "Shopping",
}


def normalize_category(value: object) -> str:
    v = str(value or "").strip().lower()
    for known in db.CATEGORIES:
        if known.lower() == v:
            return known
    return _ALIASES.get(v, "Other")


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y", "%d %b %Y", "%d %B %Y", "%b %d, %Y")


class ReceiptFields(BaseModel):
    """One expense read from a receipt photo, a ticket or a voice note."""
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    amount: float = Field(gt=0, lt=10_000_000, description="Final amount paid, in rupees")
    date: date
    merchant: str = Field(min_length=1, max_length=80)
    category: Category
    note: str = Field(default="", max_length=140)
    unclear_fields: list[str] = Field(default_factory=list)
    transcript: str = ""

    @field_validator("amount", mode="before")
    @classmethod
    def _amount(cls, v):
        if isinstance(v, str):
            m = re.search(r"\d+(?:\.\d+)?", v.replace(",", ""))  # first number; skips "Rs." / "₹" / trailing "/-"
            if not m:
                raise ValueError(f"cannot read an amount from {v!r}")
            return float(m.group())
        return v

    @field_validator("date", mode="before")
    @classmethod
    def _date(cls, v):
        if isinstance(v, datetime):
            return v.date()
        if isinstance(v, str):
            s = v.strip().split(" ")[0] if re.match(r"^\d{4}-\d{2}-\d{2} ", v.strip()) else v.strip()
            for fmt in _DATE_FORMATS:
                try:
                    return datetime.strptime(s, fmt).date()
                except ValueError:
                    continue
            raise ValueError(f"unrecognised date {v!r}; use YYYY-MM-DD")
        return v

    @field_validator("date")
    @classmethod
    def _not_future(cls, v: date):
        if v > db.today() + timedelta(days=1):
            raise ValueError(f"date {v.isoformat()} is in the future; receipts use DD/MM/YYYY, check day and month")
        return v

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v):
        return normalize_category(v)

    @field_validator("merchant", mode="before")
    @classmethod
    def _merchant(cls, v):
        return re.sub(r"\s+", " ", str(v or "")).strip()

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, v):
        return re.sub(r"\s+", " ", str(v or "")).strip()[:140]

    @field_validator("unclear_fields", mode="before")
    @classmethod
    def _unclear(cls, v):
        if isinstance(v, str):
            v = [v]
        return [f for f in (str(x).strip().lower() for x in (v or [])) if f in FIELD_NAMES]

    def as_json(self) -> dict:
        return self.model_dump(mode="json")


class ExpenseProposal(ReceiptFields):
    """What propose_expense hands to the user for confirmation."""
    source: Literal["receipt", "voice", "form"] = "form"

    @field_validator("source", mode="before")
    @classmethod
    def _source(cls, v):
        s = str(v or "form").strip().lower()
        return s if s in ("receipt", "voice", "form") else "form"
