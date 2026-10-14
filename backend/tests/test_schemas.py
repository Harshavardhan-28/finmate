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


# ---- bills ------------------------------------------------------------------------------------------------
DMART = {
    "merchant": "DMart", "date": "28/09/2026", "total": "Rs. 605.86 /-", "bill_number": "401809018-003139", "payment_method": "Card",
    "items": [
        {"name": "WARANA PAS HOM 1lt", "quantity": 2, "unit_price": 56, "amount": 112, "category": "dairy"},
        {"name": "AMUL FRESH CR 250ml", "quantity": 1, "unit_price": 70.2, "amount": 70.2, "category": "Groceries"},
        {"name": "MILKY MIST SET 1kg", "quantity": 1, "amount": 105, "category": "Groceries"},
        {"name": "AMUL PROBIOTI 500g", "quantity": 2, "unit_price": 18.6, "amount": "37.20", "category": "Groceries"},
        {"name": "AMUL MASTI DAH 400g", "quantity": 1, "amount": 47, "category": "Groceries"},
        {"name": "MAGGI HOT N SWE 75g", "quantity": 1, "amount": 20.46, "category": "Food"},
        {"name": "DK DRESSING SEAS 50g", "quantity": 1, "amount": 35, "category": "Groceries"},
        {"name": "LAL KAJU KATLI 200g", "quantity": 1, "amount": 179, "category": "Food"},
    ],
}


def test_bill_items_are_normalised_and_add_up_to_the_total():
    from finmate.schemas import BillFields
    b = BillFields.model_validate(DMART)
    assert b.total == 605.86 and len(b.items) == 8 and b.tax_fees == 0 and b.discount == 0
    assert b.items[0].category == "Groceries"          # "dairy" is a synonym
    assert {i.category for i in b.items} == {"Groceries", "Food"}
    assert round(sum(i.amount for i in b.items), 2) == b.total
    assert b.date.isoformat() == "2026-09-28"


def test_bill_missing_charges_become_an_explicit_adjustment_line():
    from finmate.schemas import ADJUSTMENT_NAME, BillFields
    b = BillFields.model_validate({**DMART, "total": 650})
    last = b.items[-1]
    assert last.name == ADJUSTMENT_NAME and last.amount == 44.14 and last.category == "Groceries"
    assert b.tax_fees == 44.14 and round(sum(i.amount for i in b.items), 2) == 650


def test_bill_discount_scales_items_to_what_was_paid():
    from finmate.schemas import BillFields
    b = BillFields.model_validate({**DMART, "total": 580})
    assert b.total == 580 and b.discount == 25.86 and round(sum(i.amount for i in b.items), 2) == 580


def test_bill_drops_negative_and_blank_rows_and_needs_an_item():
    from finmate.schemas import BillFields
    rows = DMART["items"] + [{"name": "Discount", "amount": -5, "category": "Other"}, {"name": "", "amount": 3}]
    assert len(BillFields.model_validate({**DMART, "items": rows}).items) == 8
    with pytest.raises(ValidationError):
        BillFields.model_validate({**DMART, "items": []})


def test_a_one_line_ticket_is_a_valid_bill():
    from finmate.schemas import BillFields
    b = BillFields.model_validate({"merchant": "Central Railway", "date": "2026-10-08", "total": 375,
                                   "items": [{"name": "Mumbai to Thane", "amount": 375, "category": "train"}]})
    assert len(b.items) == 1 and b.items[0].category == "Transport"


def test_rate_copied_into_amount_is_repaired_when_the_total_proves_it():
    from finmate.schemas import BillFields
    wrong = [dict(i) for i in DMART["items"]]
    wrong[0]["amount"], wrong[0]["unit_price"] = 56, None          # 2 x 56 = 112 printed; model gave the rate
    wrong[3]["amount"], wrong[3]["unit_price"] = 18.6, None        # 2 x 18.60 = 37.20
    b = BillFields.model_validate({**DMART, "items": wrong})
    assert [i.amount for i in b.items[:4]] == [112, 70.2, 105, 37.2] and b.tax_fees == 0 and len(b.items) == 8
    assert b.items[0].unit_price == 56 and b.total == 605.86
    # A shortfall that quantities do NOT explain stays an explicit adjustment line instead of being "fixed".
    odd = BillFields.model_validate({**DMART, "items": wrong, "total": 700})
    assert odd.items[-1].name.startswith("Taxes") and odd.tax_fees > 0
