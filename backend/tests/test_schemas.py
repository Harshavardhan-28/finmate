"""The strict contract for model output: messy-but-recoverable answers are normalised, everything else is rejected."""
from datetime import date

import pytest
from pydantic import ValidationError

from finmate import vision
from finmate.schemas import ExpenseProposal, ReceiptFields, normalize_category


def make(**kw):
    base = dict(amount=605.86, date="2026-09-28", merchant="DMart", category="Groceries")
    return ReceiptFields(**{**base, **kw})


def test_clean_answer_round_trips():
    f = make()
    assert f.as_json()["date"] == "2026-09-28" and f.amount == 605.86 and f.unclear_fields == []


@pytest.mark.parametrize("raw,expected", [("₹1,045.00", 1045.0), ("Rs. 375.00 /-", 375.0), ("605.86", 605.86), (450, 450.0)])
def test_amount_is_cleaned(raw, expected):
    assert make(amount=raw).amount == expected


@pytest.mark.parametrize("raw", ["28/09/2026", "28-09-2026", "28.09.2026", "2026-09-28", "28 Sep 2026", "2026-09-28 19:34:59"])
def test_indian_and_iso_dates_are_understood(raw):
    assert make(date=raw).date == date(2026, 9, 28)


def test_future_dates_and_junk_are_rejected():
    with pytest.raises(ValidationError, match="future"):
        make(date="2027-09-28")
    with pytest.raises(ValidationError):
        make(date="last Tuesday")


@pytest.mark.parametrize("bad", [0, -5, "abc", None, 10_000_000_000])
def test_bad_amounts_rejected(bad):
    with pytest.raises(ValidationError):
        make(amount=bad)


def test_categories_are_normalised_with_synonyms_and_default_other():
    assert normalize_category("Grocery") == "Groceries"
    assert normalize_category("railway") == "Transport"
    assert normalize_category("mystery") == "Other"
    assert make(category="grocery").category == "Groceries"


def test_extra_keys_dropped_and_unclear_fields_filtered():
    f = ReceiptFields.model_validate({"amount": 10, "date": "2026-10-01", "merchant": "X", "category": "Food",
                                      "unclear_fields": ["Date", "colour", "AMOUNT"], "tax": 1.8})
    assert f.unclear_fields == ["date", "amount"]


def test_proposal_source_is_constrained():
    assert ExpenseProposal(amount=1, date="2026-10-01", merchant="X", category="Food", source="OCR").source == "form"
    assert ExpenseProposal(amount=1, date="2026-10-01", merchant="X", category="Food", source="receipt").source == "receipt"


def test_parser_handles_fences_think_blocks_and_rejects_non_objects():
    raw = '<think>hmm</think>\n```json\n{"amount": "₹450", "date": "28/09/2026", "merchant": "Uber", "category": "cab"}\n```'
    f = vision._parse_fields(raw)
    assert f["amount"] == 450 and f["date"] == "2026-09-28" and f["category"] == "Transport"
    with pytest.raises(ValueError):
        vision._parse_fields("[1, 2]")


def test_one_repair_retry_then_clear_failure():
    calls = []

    def flaky(extra):
        calls.append(extra)
        return '{"amount": 0, "date": "2026-09-28", "merchant": "X", "category": "Food"}' if not extra else \
               '{"amount": 99, "date": "2026-09-28", "merchant": "X", "category": "Food"}'

    assert vision._validated(flaky)["amount"] == 99
    assert "rejected" in calls[1] and "amount" in calls[1]
    with pytest.raises(ValueError, match="Enter it manually"):
        vision._validated(lambda extra: "not json")
