"""Bills: one purchase, many items, each item counted against its own category budget."""
import pytest
from fastapi.testclient import TestClient

from finmate import agents, db, services
from tests.test_agents_e2e import FakeLlm


@pytest.fixture(autouse=True)
def fresh_db():
    db.init_db(reset=True)


def test_bill_items_are_linked_expenses_in_their_own_categories():
    r = services.save_bill("u_priya", "DMart", "2026-10-08", [
        {"name": "Rice 5kg", "amount": 420, "category": "Groceries"},
        {"name": "Vitamin C", "amount": 180, "category": "health"},
        {"name": "Notebook", "amount": 60, "category": "gadgets"},   # unknown -> Other
    ], note="Weekly run")
    bill = r["bill"]
    assert bill["total"] == 660 and len(bill["items"]) == 3
    assert {i["category"] for i in bill["items"]} == {"Groceries", "Health", "Other"}
    assert all(i["bill_id"] == bill["id"] and i["merchant"] == "DMart" for i in bill["items"])
    assert {i["note"] for i in bill["items"]} == {"Rice 5kg", "Vitamin C", "Notebook"}
    # Items are ordinary expenses, so budgets and the ledger see them.
    assert sum(1 for e in services.get_expenses("u_priya", 5) if e["bill_id"] == bill["id"]) == 3


def test_one_alert_per_category_for_the_whole_bill_not_per_item():
    services.set_budget("u_priya", "user", "u_priya", "Shopping", 1000)
    r = services.save_bill("u_priya", "Myntra", "2026-10-08", [
        {"name": "Shirt", "amount": 700, "category": "Shopping"},
        {"name": "Belt", "amount": 500, "category": "Shopping"},
        {"name": "Socks", "amount": 100, "category": "Shopping"},
    ])
    shopping = [a for a in r["alerts"] if a["category"] == "Shopping" and a["scope"] == "user"]
    assert len(shopping) == 1 and shopping[0]["level"] == "exceeded"


def test_bill_validation():
    with pytest.raises(ValueError):
        services.save_bill("u_ravi", "X", "2026-10-08", [])
    with pytest.raises(ValueError):
        services.save_bill("u_ravi", "X", "2026-10-08", [{"name": "a", "amount": 0, "category": "Food"}])
    with db.connect() as c:   # a rejected bill leaves nothing behind
        assert c.execute("SELECT COUNT(*) FROM bills").fetchone()[0] == 0


def test_delete_bill_removes_items_and_only_for_the_owner():
    r = services.save_bill("u_priya", "DMart", "2026-10-08", [
        {"name": "a", "amount": 10, "category": "Food"}, {"name": "b", "amount": 20, "category": "Food"}])
    bid = r["bill"]["id"]
    assert services.delete_bill("u_ravi", bid) is False
    assert services.delete_bill("u_priya", bid) is True
    assert services.delete_bill("u_priya", bid) is False
    with db.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM expenses WHERE bill_id=%s", (bid,)).fetchone()[0] == 0


# ---- HTTP ---------------------------------------------------------------------------------
@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FINMATE_UPLOADS", str(tmp_path / "uploads"))
    monkeypatch.setenv("FINMATE_FAKE_VISION", "1")
    real = agents.build_agents
    monkeypatch.setattr(agents, "build_agents", lambda **kw: real(model=FakeLlm(), **kw))
    from finmate import api
    with TestClient(api.app) as c:
        c.post("/api/auth/login", json={"email": "priya@finmate.dev", "password": "demo1234"})
        yield c


BILL = {"merchant": "Reliance Fresh", "date": "2026-10-08", "note": "Evening shop", "items": [
    {"name": "Milk", "amount": 62, "category": "Groceries"}, {"name": "Paracetamol", "amount": 30, "category": "Health"}]}


def test_bill_endpoints_validate_and_scope(client):
    assert client.post("/api/bills", json={**BILL, "items": []}).status_code == 422
    assert client.post("/api/bills", json={**BILL, "merchant": "  "}).status_code == 422
    assert client.post("/api/bills", json={**BILL, "date": "08/10/2026"}).status_code == 422
    assert client.post("/api/bills", json={**BILL, "items": [{"name": "x", "amount": -1, "category": "Food"}]}).status_code == 422
    ok = client.post("/api/bills", json=BILL)
    assert ok.status_code == 201 and ok.json()["bill"]["total"] == 92
    rows = client.get("/api/expenses").json()
    assert {r["note"] for r in rows if r["bill_id"] == ok.json()["bill"]["id"]} == {"Milk", "Paracetamol"}
    bid = ok.json()["bill"]["id"]
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "ravi@finmate.dev", "password": "demo1234"})
    assert client.delete(f"/api/bills/{bid}").status_code == 404          # not Ravi's bill
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "priya@finmate.dev", "password": "demo1234"})
    assert client.delete(f"/api/bills/{bid}").status_code == 200
    assert not [r for r in client.get("/api/expenses").json() if r["bill_id"] == bid]


def test_export_includes_bill_id_and_account_deletion_removes_bills(client):
    bid = client.post("/api/bills", json=BILL).json()["bill"]["id"]
    csv = client.get("/api/account/export").text
    assert csv.splitlines()[0].endswith("note,bill_id,recorded_at") and f",{bid}," in csv
    client.post("/api/auth/register", json={"name": "Solo", "email": "solo2@example.com", "password": "password1"})
    client.post("/api/bills", json=BILL)
    r = client.request("DELETE", "/api/account", json={"confirm_email": "solo2@example.com", "password": "password1"})
    assert r.status_code == 200
    with db.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM bills b JOIN users u ON u.id=b.user_id WHERE u.email='solo2@example.com'").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM bills").fetchone()[0] == 1   # Priya's own bill remains


def test_bill_keeps_quantity_total_and_receipt_link():
    from finmate import vision
    vision.register_attachment("att1", "u_priya")
    r = services.save_bill("u_priya", "DMart", "2026-10-08", [
        {"name": "Milk 1lt", "amount": 112, "category": "Groceries", "quantity": 2, "unit_price": 56},
        {"name": "Kaju katli", "amount": 179, "category": "Food"},
    ], source="receipt", bill_number="B-1", payment_method="Card", tax_fees=3.5, attachment_id="att1")
    bill = services.get_bill("u_priya", r["bill"]["id"])
    assert bill["total"] == 291 and bill["bill_number"] == "B-1" and bill["payment_method"] == "Card"
    assert bill["tax_fees"] == 3.5 and bill["attachment_id"] == "att1" and len(bill["items"]) == 2
    milk = next(i for i in bill["items"] if i["note"] == "Milk 1lt")
    assert milk["quantity"] == 2 and milk["unit_price"] == 56
    assert [b["id"] for b in services.list_bills("u_priya", 5)] == [bill["id"]]
    assert services.get_bill("u_ravi", bill["id"]) is None          # not someone else's


def test_attachment_of_another_user_is_not_linked():
    from finmate import vision
    vision.register_attachment("ravi-att", "u_ravi")
    r = services.save_bill("u_priya", "X", "2026-10-08", [{"name": "a", "amount": 5, "category": "Food"}], attachment_id="ravi-att")
    assert r["bill"]["attachment_id"] is None


def test_deleting_an_item_updates_or_removes_its_bill():
    r = services.save_bill("u_priya", "Shop", "2026-10-08", [
        {"name": "a", "amount": 100, "category": "Food"}, {"name": "b", "amount": 50, "category": "Food"}])
    bill_id, ids = r["bill"]["id"], [i["id"] for i in r["bill"]["items"]]
    assert services.delete_expense("u_priya", ids[0])
    assert services.get_bill("u_priya", bill_id)["total"] == 50
    assert services.delete_expense("u_priya", ids[1])
    assert services.get_bill("u_priya", bill_id) is None


def test_drafts_are_private_to_their_owner():
    services.put_draft("u_ravi", "d1", "proposed", {"merchant": "X"})
    assert services.get_draft("u_ravi", "d1", "proposed") == {"merchant": "X"}
    assert services.get_draft("u_priya", "d1", "proposed") is None
    assert services.get_draft("u_ravi", "d1", "confirmed") is None
