"""Strict, typed shapes for everything a model extracts or proposes.

Local models cannot always use grammar-constrained decoding, and even Gemini can drift, so the contract is enforced
here with pydantic: messy model output is normalised (currency symbols, DD/MM/YYYY dates, category synonyms) and then
validated hard. Anything that still does not fit raises ValidationError, which the caller turns into one repair retry.
"""
import re
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    "dairy": "Groceries", "milk": "Groceries", "staples": "Groceries", "vegetables": "Groceries", "fruits": "Groceries",
    "household": "Groceries", "oil": "Groceries", "spices": "Groceries",
    "sweets": "Food", "beverages": "Food", "bakery": "Food", "drinks": "Food", "ready to eat": "Food",
    "personal care": "Shopping", "stationery": "Shopping",
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


# ---- Bills: one purchase with many line items, each in its own category -----------------------------------
BILL_FIELD_NAMES = ("merchant", "date", "total", "items", "bill_number", "payment_method")
ADJUSTMENT_NAME = "Taxes, fees & rounding"


def _number(v, what: str):
    """First number in a string ("Rs. 105.00 /-" -> 105.0); numbers pass through; None/"" stay None."""
    if v is None or v == "":
        return None
    if isinstance(v, str):
        m = re.search(r"\d+(?:\.\d+)?", v.replace(",", ""))
        if not m:
            raise ValueError(f"cannot read {what} from {v!r}")
        return float(m.group())
    return v


def _text(v) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


# Small models label every supermarket line "Groceries". Obvious words in the item name correct that; they only ever
# move an item out of the two catch-all categories, never override a specific one the model chose.
_NAME_HINTS = (
    ("Food", ("katli", "sweet", "mithai", "maggi", "noodle", "chips", "biscuit", "cookie", "chocolate", "cola", "juice", "soda",
              "namkeen", "pizza", "burger", "sandwich", "ice cream", "candy", "wafer", "snack", "cake", "pastry", "samosa", "kurkure")),
    ("Health", ("tablet", "syrup", "capsule", "paracetamol", "vitamin", "ointment", "bandage", "sanitizer", "medicine", "crocin")),
    ("Transport", ("ticket", "season", "petrol", "diesel", "toll", "metro", "railway")),
)


def category_from_name(name: str, current: str) -> str:
    if current not in ("Groceries", "Other"):
        return current
    low = name.lower()
    for cat, words in _NAME_HINTS:
        if any(w in low for w in words):
            return cat
    return current


class BillItem(BaseModel):
    """One line on a bill. `amount` is what the line cost (quantity x unit price, after any line discount)."""
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    quantity: float | None = Field(default=None, gt=0, lt=100_000)
    unit_price: float | None = Field(default=None, gt=0, lt=10_000_000)
    amount: float = Field(gt=0, lt=10_000_000)
    category: Category

    @field_validator("amount", mode="before")
    @classmethod
    def _amount(cls, v):
        n = _number(v, "an item amount")
        if n is None:
            raise ValueError("item amount is required")
        return n

    @field_validator("quantity", "unit_price", mode="before")
    @classmethod
    def _optional_numbers(cls, v):
        n = _number(v, "a number")
        return None if n in (None, 0) else n

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return _text(v)[:120]

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v):
        return normalize_category(v)

    @model_validator(mode="after")
    def _refine(self):
        self.category = category_from_name(self.name, self.category)
        # A model often copies the rate into the amount column; for 2 x 18.60 the line is worth 37.20.
        if self.quantity and self.quantity > 1 and self.unit_price and abs(self.amount - self.unit_price) < 0.01:
            self.amount = round(self.quantity * self.unit_price, 2)
        return self


class BillFields(BaseModel):
    """A whole bill read from a photo: header facts plus every line item. After validation the items always add up to
    `total` (see _reconcile), so what is saved to the ledger equals what was paid."""
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    merchant: str = Field(min_length=1, max_length=80)
    date: date
    total: float = Field(gt=0, lt=10_000_000, description="Final amount paid, in rupees")
    tax_fees: float = Field(default=0, ge=0)
    discount: float = Field(default=0, ge=0)
    bill_number: str = Field(default="", max_length=40)
    payment_method: str = Field(default="", max_length=30)
    note: str = Field(default="", max_length=140)
    items: list[BillItem] = Field(min_length=1, max_length=100)
    unclear_fields: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _missing_date(cls, data):
        # No printed date: use today, but say so, rather than trusting a guess as if it were read.
        if isinstance(data, dict) and not str(data.get("date") or "").strip():
            flagged = list(data.get("unclear_fields") or []) if not isinstance(data.get("unclear_fields"), str) else [data["unclear_fields"]]
            data = {**data, "date": db.today().isoformat(), "unclear_fields": flagged + ["date"]}
        return data

    _date = field_validator("date", mode="before")(ReceiptFields._date.__func__)
    _not_future = field_validator("date")(ReceiptFields._not_future.__func__)

    @field_validator("total", mode="before")
    @classmethod
    def _total(cls, v):
        n = _number(v, "the total")
        if n is None:
            raise ValueError("total is required")
        return n

    @field_validator("tax_fees", "discount", mode="before")
    @classmethod
    def _extras(cls, v):
        return abs(_number(v, "an amount") or 0)

    @field_validator("merchant", "bill_number", "payment_method", "note", mode="before")
    @classmethod
    def _strings(cls, v):
        return _text(v)

    @field_validator("items", mode="before")
    @classmethod
    def _drop_blank_lines(cls, v):
        # Models sometimes list a discount or a blank row as an item; those cannot be expenses, the total handles them.
        if not isinstance(v, list):
            return v
        keep = []
        for it in v:
            try:
                amount = _number(it.get("amount"), "an item amount") if isinstance(it, dict) else None
            except ValueError:
                amount = None
            if isinstance(it, dict) and (amount is None or amount > 0) and _text(it.get("name")):
                keep.append(it)
        return keep

    @field_validator("unclear_fields", mode="before")
    @classmethod
    def _unclear(cls, v):
        if isinstance(v, str):
            v = [v]
        return [f for f in (str(x).strip().lower() for x in (v or [])) if f in BILL_FIELD_NAMES]

    @model_validator(mode="after")
    def _reconcile(self):
        """Make the items add up to the printed total, without inventing anything silently.

        - within rounding: items are right, total follows them
        - items short of the total (taxes, service charge, packing): one explicit adjustment line
        - items above the total (a discount): scale line amounts down proportionally and record the discount
        """
        spent = round(sum(i.amount for i in self.items), 2)
        diff = round(self.total - spent, 2)
        if diff > 1.0:
            # Models often put the RATE in the amount column for lines with quantity > 1 (2 x 18.60 shown as 18.60). If
            # multiplying exactly those lines by their quantity accounts for the whole shortfall, that was the mistake.
            multi = [i for i in self.items if i.quantity and i.quantity > 1]
            gap = round(sum(i.amount * (i.quantity - 1) for i in multi), 2)
            if multi and abs(gap - diff) <= 0.05:
                for i in multi:
                    i.unit_price = i.unit_price or i.amount
                    i.amount = round(i.amount * i.quantity, 2)
                spent = round(sum(i.amount for i in self.items), 2)
                diff = round(self.total - spent, 2)
        if abs(diff) <= max(1.0, 0.005 * self.total):
            self.total = spent
        elif diff > 0:
            by_cat: dict[str, float] = {}
            for i in self.items:
                by_cat[i.category] = by_cat.get(i.category, 0) + i.amount
            self.items.append(BillItem(name=ADJUSTMENT_NAME, amount=diff, category=max(by_cat, key=by_cat.get)))
            self.tax_fees = round(self.tax_fees + diff, 2)
        else:
            factor = self.total / spent
            for i in self.items:
                i.amount = round(i.amount * factor, 2)
            self.items[-1].amount = round(self.items[-1].amount + (self.total - sum(i.amount for i in self.items)), 2)
            self.discount = round(self.discount + (spent - self.total), 2)
        return self

    def as_json(self) -> dict:
        return self.model_dump(mode="json")


class BillProposal(BillFields):
    """What propose_bill hands to the user for review and confirmation."""
    source: Literal["receipt", "voice", "form"] = "receipt"
    attachment_id: str | None = None

    @field_validator("source", mode="before")
    @classmethod
    def _source(cls, v):
        s = str(v or "receipt").strip().lower()
        return s if s in ("receipt", "voice", "form") else "receipt"
