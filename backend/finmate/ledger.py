"""Direct (non-chat) writes for expenses and budgets, used by the Expenses and Budgets pages."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import auth, services

router = APIRouter(prefix="/api", tags=["ledger"])
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@router.get("/expenses")
def list_expenses(days: int = 90, category: str | None = None, user: dict = Depends(auth.current_user)):
    """The signed-in user's expenses for the last `days` days (1-366), newest first."""
    return services.get_expenses(user["user_id"], min(max(days, 1), 366), category)


class ExpenseIn(BaseModel):
    amount: float
    date: str
    merchant: str
    category: str
    note: str = ""


@router.post("/expenses", status_code=201)
def add_expense(body: ExpenseIn, user: dict = Depends(auth.current_user)):
    if body.amount <= 0:
        raise HTTPException(422, "Amount must be greater than zero")
    if not _ISO.match(body.date):
        raise HTTPException(422, "Date must be YYYY-MM-DD")
    if not body.merchant.strip():
        raise HTTPException(422, "Merchant is required")
    return services.save_expense(user["user_id"], body.amount, body.date, body.merchant.strip(),
                                 body.category, "form", body.note.strip())


@router.delete("/expenses/{expense_id}")
def remove_expense(expense_id: int, user: dict = Depends(auth.current_user)):
    if not services.delete_expense(user["user_id"], expense_id):
        raise HTTPException(404, "Expense not found")
    return {"ok": True}


class BillItemIn(BaseModel):
    name: str = ""
    amount: float
    category: str
    quantity: float | None = None
    unit_price: float | None = None


class BillIn(BaseModel):
    merchant: str
    date: str
    note: str = ""
    items: list[BillItemIn]


@router.post("/bills", status_code=201)
def add_bill(body: BillIn, user: dict = Depends(auth.current_user)):
    if not body.merchant.strip():
        raise HTTPException(422, "Merchant is required")
    if not _ISO.match(body.date):
        raise HTTPException(422, "Date must be YYYY-MM-DD")
    if not body.items:
        raise HTTPException(422, "Add at least one item")
    if len(body.items) > 100:
        raise HTTPException(422, "A bill can have at most 100 items")
    if any(i.amount <= 0 for i in body.items):
        raise HTTPException(422, "Every item needs an amount greater than zero")
    return services.save_bill(user["user_id"], body.merchant.strip(), body.date, [i.model_dump() for i in body.items],
                              body.note.strip())


@router.get("/bills")
def bills(days: int = 90, user: dict = Depends(auth.current_user)):
    return services.list_bills(user["user_id"], max(1, min(days, 3650)))


@router.get("/bills/{bill_id}")
def bill(bill_id: int, user: dict = Depends(auth.current_user)):
    found = services.get_bill(user["user_id"], bill_id)
    if found is None:
        raise HTTPException(404, "Bill not found")
    return found


@router.delete("/bills/{bill_id}")
def remove_bill(bill_id: int, user: dict = Depends(auth.current_user)):
    if not services.delete_bill(user["user_id"], bill_id):
        raise HTTPException(404, "Bill not found")
    return {"ok": True}


class BudgetIn(BaseModel):
    owner_type: str
    category: str
    monthly_limit: float


def _owner_id(user: dict, owner_type: str) -> str:
    if owner_type not in ("user", "family"):
        raise HTTPException(422, "owner_type must be user or family")
    return user["user_id"] if owner_type == "user" else user["family_id"]


@router.put("/budgets")
def put_budget(body: BudgetIn, user: dict = Depends(auth.current_user)):
    if body.monthly_limit <= 0:
        raise HTTPException(422, "Limit must be greater than zero")
    res = services.set_budget(user["user_id"], body.owner_type, _owner_id(user, body.owner_type),
                              body.category, body.monthly_limit)
    if res.get("error"):
        raise HTTPException(403, res["message"])
    return services.budget_status(user["user_id"])


@router.delete("/budgets/{owner_type}/{category}")
def remove_budget(owner_type: str, category: str, user: dict = Depends(auth.current_user)):
    res = services.delete_budget(user["user_id"], owner_type, _owner_id(user, owner_type), category)
    if res.get("error"):
        raise HTTPException(403, res["message"])
    if not res["ok"]:
        raise HTTPException(404, "Budget not found")
    return services.budget_status(user["user_id"])
