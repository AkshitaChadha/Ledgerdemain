import { useEffect, useState } from "react";

const initialForm = {
  title: "",
  amount: "",
  type: "expense",
  category: "Food",
  note: "",
  transaction_date: new Date().toISOString().slice(0, 10)
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [serverError, setServerError] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadBootstrap();
  }, []);

  async function loadBootstrap() {
    setLoading(true);
    setServerError("");
    try {
      const response = await fetch("/api/bootstrap");
      if (!response.ok) {
        throw new Error("Failed to load dashboard data.");
      }
      const data = await response.json();
      setCategories(data.categories);
      setTransactions(data.transactions);
      setSummary(data.summary);
      setNotifications(data.notifications);
      setForm((current) => ({
        ...current,
        category: data.categories[0] || current.category
      }));
    } catch (error) {
      setServerError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setServerError("");

    try {
      const isEditing = editingId !== null;
      const response = await fetch(isEditing ? `/api/transactions/${editingId}` : "/api/transactions", {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = await response.json();
      if (!response.ok) {
        setErrors(data.errors || {});
        throw new Error("Please review the transaction details.");
      }

      if (data.transactions) {
        setTransactions(data.transactions);
      } else {
        setTransactions((current) => [data.transaction, ...current]);
      }
      setSummary(data.summary);
      setNotifications(data.notifications);
      setForm({
        ...initialForm,
        category: form.category,
        transaction_date: new Date().toISOString().slice(0, 10)
      });
      setEditingId(null);
    } catch (error) {
      setServerError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(transaction) {
    setEditingId(transaction.id);
    setErrors({});
    setServerError("");
    setForm({
      title: transaction.title,
      amount: String(transaction.amount),
      type: transaction.type,
      category: transaction.category,
      note: transaction.note || "",
      transaction_date: transaction.transaction_date
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setErrors({});
    setServerError("");
    setForm({
      ...initialForm,
      category: categories[0] || initialForm.category,
      transaction_date: new Date().toISOString().slice(0, 10)
    });
  }

  async function handleDelete(transaction) {
    const shouldDelete = window.confirm(`Delete "${transaction.title}" from the ledger?`);
    if (!shouldDelete) return;

    setServerError("");
    const response = await fetch(`/api/transactions/${transaction.id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      setServerError(data.error || "Failed to delete the transaction.");
      return;
    }

    setTransactions(data.transactions);
    setSummary(data.summary);
    setNotifications(data.notifications);
    if (editingId === transaction.id) {
      cancelEditing();
    }
  }

  async function markNotificationsRead() {
    const response = await fetch("/api/notifications/read-all", { method: "POST" });
    const data = await response.json();
    setNotifications(data.notifications);
  }

  async function loadDemoData() {
    setServerError("");
    const response = await fetch("/api/seed", { method: "POST" });
    const data = await response.json();
    setTransactions(data.transactions);
    setSummary(data.summary);
    setNotifications(data.notifications);
    setEditingId(null);
  }

  const filteredTransactions = transactions.filter((transaction) => {
    if (filter === "all") return true;
    return transaction.type === filter;
  });

  if (loading) {
    return <div className="screen-message">Loading Ledger Pulse...</div>;
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy-block">
          <p className="eyebrow">Smart mini-ledger</p>
          <h1>Ledger Pulse</h1>
          <p className="hero-copy">
            Track money, spot unusual spending, and surface action-worthy insights
            before a simple ledger turns noisy.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={loadDemoData} type="button">
              Load demo data
            </button>
          </div>
        </div>
      </section>

      {serverError ? <div className="banner error">{serverError}</div> : null}

      <InsightsCenter notifications={notifications} onReadAll={markNotificationsRead} />

      <section className="dashboard-grid">
        <div className="stack">
          <SummaryCards summary={summary} />
          <PulseCard points={summary?.pulse || []} />
          <TransactionsTable
            transactions={filteredTransactions}
            filter={filter}
            setFilter={setFilter}
            onEdit={startEditing}
            onDelete={handleDelete}
          />
        </div>
        <div className="stack">
          <TransactionForm
            form={form}
            setForm={setForm}
            onSubmit={handleSubmit}
            categories={categories}
            errors={errors}
            submitting={submitting}
            editingId={editingId}
            onCancel={cancelEditing}
          />
          <CategoryCard categories={summary?.topCategories || []} />
        </div>
      </section>
    </main>
  );
}

function SummaryCards({ summary }) {
  if (!summary) return null;

  const cards = [
    { label: "Income", value: summary.income, tone: "income" },
    { label: "Expense", value: summary.expense, tone: "expense" },
    { label: "Net", value: summary.net, tone: summary.net >= 0 ? "income" : "expense" },
    { label: "Entries", value: summary.transactionCount, tone: "neutral" }
  ];

  return (
    <div className="summary-grid">
      {cards.map((card) => (
        <article key={card.label} className={`summary-card ${card.tone}`}>
          <span>{card.label}</span>
          <strong>{card.label === "Entries" ? card.value : formatCurrency(card.value)}</strong>
        </article>
      ))}
    </div>
  );
}

function InsightsCenter({ notifications, onReadAll }) {
  const unreadInsights = notifications.filter((item) => !item.is_read);
  const activeInsights = unreadInsights.slice(0, 3);
  const historyInsights = notifications.filter((item) => item.is_read).slice(0, 6);

  return (
    <section className="insights-panel">
      <div className="insights-head">
        <div>
          <p className="eyebrow">Insights center</p>
          <h2>{activeInsights.length ? "Active signals" : "No active signals"}</h2>
        </div>
        <div className="insight-actions">
          <span className="insight-count">{unreadInsights.length} unread</span>
          <button className="ghost-button" onClick={onReadAll} type="button">
            Mark all read
          </button>
        </div>
      </div>

      {activeInsights.length ? (
        <div className="insight-grid">
          {activeInsights.map((item) => (
            <article key={item.id} className={`insight-card ${item.severity}`}>
              <div className="insight-topline">
                <span className={`severity-pill ${item.severity}`}>{item.severity}</span>
                <span className="status-label">Needs attention</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              <div className="insight-source">
                <span>Triggered by</span>
                <strong>{item.source_transaction_title || "System insight"}</strong>
              </div>
              <div className="insight-action-block">
                <span>{item.action_label || "Suggested action"}</span>
                <strong>{item.action_text || "Review this insight."}</strong>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state subtle">
          No alerts are active right now. Add a transaction or load demo data to surface
          insights.
        </div>
      )}

      {historyInsights.length ? (
        <div className="history-block">
          <div className="history-head">
            <h3>Read history</h3>
            <span>{historyInsights.length} archived insights</span>
          </div>
          <div className="history-list">
            {historyInsights.map((item) => (
              <article key={item.id} className={`history-item ${item.severity}`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                </div>
                <span>{item.source_transaction_title || "System"}</span>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PulseCard({ points }) {
  const maxExpense = Math.max(...points.map((point) => point.expense), 1);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Unique twist</p>
          <h2>Spending Pulse</h2>
        </div>
        <p className="muted">A custom 14-day pulse chart with anomaly highlights.</p>
      </div>

      <div className="pulse-chart">
        {points.map((point) => {
          const height = Math.max((point.expense / maxExpense) * 100, point.expense ? 12 : 4);
          return (
            <div key={point.date} className="pulse-bar-wrap">
              <div
                className={`pulse-bar ${point.flagged ? "flagged" : ""}`}
                style={{ height: `${height}%` }}
                title={`${point.date}: ${formatCurrency(point.expense)}`}
              />
              <span>{point.date.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TransactionForm({
  form,
  setForm,
  onSubmit,
  categories,
  errors,
  submitting,
  editingId,
  onCancel
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{editingId ? "Edit transaction" : "Add transaction"}</p>
          <h2>{editingId ? "Update this entry" : "Capture a new entry"}</h2>
        </div>
      </div>

      <form className="transaction-form" onSubmit={onSubmit}>
        <label>
          <span>Title</span>
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Monthly salary, groceries, cab ride..."
          />
          {errors.title ? <small>{errors.title}</small> : null}
        </label>

        <div className="dual-grid">
          <label>
            <span>Amount</span>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
            {errors.amount ? <small>{errors.amount}</small> : null}
          </label>

          <label>
            <span>Type</span>
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            {errors.type ? <small>{errors.type}</small> : null}
          </label>
        </div>

        <div className="dual-grid">
          <label>
            <span>Category</span>
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {errors.category ? <small>{errors.category}</small> : null}
          </label>

          <label>
            <span>Date</span>
            <input
              type="date"
              value={form.transaction_date}
              onChange={(event) => setForm({ ...form, transaction_date: event.target.value })}
            />
            {errors.transaction_date ? <small>{errors.transaction_date}</small> : null}
          </label>
        </div>

        <label>
          <span>Note</span>
          <textarea
            rows="3"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Optional context for future you"
          />
        </label>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : editingId ? "Update transaction" : "Save transaction"}
          </button>
          {editingId ? (
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function TransactionsTable({ transactions, filter, setFilter, onEdit, onDelete }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2>Transaction history</h2>
        </div>
        <div className="filter-group" role="tablist" aria-label="Transaction type filter">
          <button
            className={`filter-pill ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
            type="button"
          >
            All
          </button>
          <button
            className={`filter-pill ${filter === "income" ? "active" : ""}`}
            onClick={() => setFilter("income")}
            type="button"
          >
            Income
          </button>
          <button
            className={`filter-pill ${filter === "expense" ? "active" : ""}`}
            onClick={() => setFilter("expense")}
            type="button"
          >
            Expense
          </button>
        </div>
      </div>

      {transactions.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Type</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <strong>{transaction.title}</strong>
                    {transaction.note ? <span>{transaction.note}</span> : null}
                  </td>
                  <td>{transaction.category}</td>
                  <td>
                    <span className={`chip ${transaction.type}`}>{transaction.type}</span>
                  </td>
                  <td>{transaction.transaction_date}</td>
                  <td className={transaction.type === "income" ? "positive" : "negative"}>
                    {transaction.type === "income" ? "+" : "-"}
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action"
                        type="button"
                        onClick={() => onEdit(transaction)}
                      >
                        Edit
                      </button>
                      <button
                        className="table-action danger"
                        type="button"
                        onClick={() => onDelete(transaction)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No transactions yet. Add the first entry to wake up the pulse.</div>
      )}
    </section>
  );
}

function CategoryCard({ categories }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Where money goes</p>
          <h2>Expense hotspots</h2>
        </div>
      </div>

      <div className="category-list">
        {categories.length ? (
          categories.map((item) => (
            <div key={item.category} className="category-row">
              <span>{item.category}</span>
              <strong>{formatCurrency(item.amount)}</strong>
            </div>
          ))
        ) : (
          <div className="empty-state subtle">Expense categories appear here after the first spend.</div>
        )}
      </div>
    </section>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}
