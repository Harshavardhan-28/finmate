"use client";
import { useState } from "react";
import BillForm from "@/components/app/BillForm";
import { useApp } from "@/components/app/AppProvider";
import Expenses from "@/components/Expenses";
import { Notice } from "@/components/ui";
import { toast } from "sonner";
import { deleteBill, deleteExpense } from "@/lib/api";

export default function ExpensesPage() {
  const { dash, expenses, refresh } = useApp();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <title>Expenses · FinMate AI</title>
      <div className="page">
        <header className="page-head">
          <div>
            <p className="eyebrow">Ledger</p>
            <h1>Expenses</h1>
            <p>Everything you&apos;ve recorded, newest first. A bill with several items shows as one entry you can expand. Photograph a receipt or say it out loud from Receipts, or add a bill here.</p>
          </div>
          <button className="btn primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            {adding ? "Close" : "Add a bill"}
          </button>
        </header>
        {adding && <BillForm onCancel={() => setAdding(false)} />}
        {error && <Notice tone="bad">{error}</Notice>}
        <Expenses
          heading={false}
          expenses={expenses}
          month={dash?.budgets.month ?? new Date().toISOString().slice(0, 7)}
          onDeleteBill={async (id) => {
            setError("");
            try { await deleteBill(id); await refresh(); toast.success("Bill deleted"); }
            catch (err) { setError(err instanceof Error ? err.message : "Could not delete"); }
          }}
          onDelete={async (e) => {
            setError("");
            try { await deleteExpense(e.id); await refresh(); toast.success("Expense deleted"); }
            catch (err) { setError(err instanceof Error ? err.message : "Could not delete"); }
          }}
        />
      </div>
    </>
  );
}
