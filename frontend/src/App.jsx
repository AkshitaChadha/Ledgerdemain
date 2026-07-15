import { useEffect, useRef, useState } from "react";
import coinDropSound from "./assets/coin_sound.mp3";
const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Bonus",
  "Refund",
  "Interest"
];

const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Education",
  "Travel",
  "Other"
];

const CATEGORY_SIGILS = {
  Salary: "💼",
  Freelance: "🧑‍💻",
  Bonus: "🎁",
  Refund: "↩️",
  Interest: "📈",
  Food: "🍔",
  Transport: "🚕",
  Shopping: "🛍️",
  Bills: "🧾",
  Entertainment: "🎬",
  Health: "❤️",
  Education: "📚",
  Travel: "✈️",
  Other: "✨"
};

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
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [serverError, setServerError] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [showOmens, setShowOmens] = useState(false);
  const [toast, setToast] = useState(null);
  const [deletingIds, setDeletingIds] = useState([]);
  const [sparklingIds, setSparklingIds] = useState([]);
  const [coinRain, setCoinRain] = useState(false);
  const toastTimerRef = useRef(null);
  const coinSound = useRef(null);
  const bellRef = useRef(null);
  

  const categories = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    coinSound.current = new Audio(coinDropSound);
    coinSound.current.volume = 0.35;
  }, []);
  useEffect(() => {
    if (!categories.includes(form.category)) {
      setForm((current) => ({ ...current, category: categories[0] }));
    }
  }, [form.type]);

  useEffect(() => {
    function handleWindowClick(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setShowOmens(false);
      }
    }

    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    []
  );

  async function loadBootstrap() {
    setLoading(true);
    setServerError("");
    try {
      const response = await fetch("/api/bootstrap");
      if (!response.ok) {
        throw new Error("Failed to load dashboard data.");
      }
      const data = await response.json();
      setTransactions(data.transactions);
      setSummary(data.summary);
      setNotifications(data.notifications);
      setForm((current) => ({
        ...current,
        category: current.type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]
      }));
    } catch (error) {
      setServerError(error.message);
    } finally {
      setLoading(false);
    }
  }

  function showToast(payload) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(payload);
    toastTimerRef.current = window.setTimeout(
      () => setToast(null),
      payload?.persistent ? 5200 : 3200
    );
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

      setTransactions(data.transactions || [data.transaction, ...transactions]);
      setSummary(data.summary);
      setNotifications(data.notifications);
      if (!isEditing && data.transaction?.type === "income") {
        if (coinSound.current) {
            coinSound.current.currentTime = 0;
            coinSound.current.play().catch(() => {});
        }
        setCoinRain(true);
        setTimeout(() => {
          setCoinRain(false);
        }, 1200);
        setSparklingIds((current) => [...current, data.transaction.id]);
        window.setTimeout(() => {
          setSparklingIds((current) =>
            current.filter((id) => id !== data.transaction.id)
          );
        }, 1400);
      }
setForm({
        ...initialForm,
        category: form.type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0],
        transaction_date: new Date().toISOString().slice(0, 10)
      });
      setEditingId(null);
      showToast({
        message: isEditing ? "The spell shifted - entry updated." : "Abracadabra - entry added."
      });
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
      category: EXPENSE_CATEGORIES[0],
      transaction_date: new Date().toISOString().slice(0, 10)
    });
  }

  async function handleDelete(transaction) {
    // Start the animation immediately
    setDeletingIds((current) => [...current, transaction.id]);

    setServerError("");

    try {
      // Delete in the background while the animation is running
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        setDeletingIds((current) =>
          current.filter((id) => id !== transaction.id)
        );
        setServerError(data.error || "Failed to delete the transaction.");
        return;
      }

      // Wait long enough for the smoke animation to finish
      await wait(600);

      // Remove animation class
      setDeletingIds((current) =>
        current.filter((id) => id !== transaction.id)
      );

      // Now actually remove from the UI
      setTransactions(data.transactions);
      setSummary(data.summary);
      setNotifications(data.notifications);

      if (editingId === transaction.id) {
        cancelEditing();
      }

      showToast({
        message: `Poof. ${transaction.title} vanished.`,
        actionLabel: "Undo",
        persistent: true,
        onAction: async () => {
          setToast(null);

          const undoResponse = await fetch(
            `/api/transactions/undo-delete/${data.undoEventId}`,
            {
              method: "POST",
            }
          );

          const undoData = await undoResponse.json();

          if (!undoResponse.ok) {
            setServerError("The vanished entry refused to return.");
            return;
          }

          setTransactions(undoData.transactions);
          setSummary(undoData.summary);
          setNotifications(undoData.notifications);

          showToast({
            message: "✨ The ledger reversed the spell.",
          });
        },
      });
    } catch (err) {
      setDeletingIds((current) =>
        current.filter((id) => id !== transaction.id)
      );
      setServerError("Failed to delete the transaction.");
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

  const unreadNotifications = notifications.filter((item) => !item.is_read);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <main className="app-shell">
      {coinRain && <CoinRain />}
      <header className="branding-bar">
        <div className="brand-lockup">
          <WandIcon className="brand-icon" />
          <div>
            <h1>Ledgerdemain</h1>
            <p>Your money, made magically simple.</p>
          </div>
        </div>

        <div className="branding-actions">
          <button className="ghost-button compact-ghost demo-button" onClick={loadDemoData} type="button">
            Load demo data
          </button>
          <div className="omen-wrap" ref={bellRef}>
            <button
              className={`bell-button ${showOmens ? "open" : ""}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowOmens((current) => !current);
              }}
            >
              <BellIcon />
              {unreadNotifications.length ? <span className="bell-badge">{unreadNotifications.length}</span> : null}
            </button>
            {showOmens ? (
              <NotificationPanel
                notifications={notifications}
                onReadAll={markNotificationsRead}
              />
            ) : null}
          </div>
        </div>
      </header>

      {serverError ? <div className="banner error">{serverError}</div> : null}

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
            deletingIds={deletingIds}
            sparklingIds={sparklingIds}
            
          />
        </div>
        <div className="stack">
          <TransactionForm
            form={form}
            setForm={setForm}
            categories={categories}
            onSubmit={handleSubmit}
            errors={errors}
            submitting={submitting}
            editingId={editingId}
            onCancel={cancelEditing}
          />
          <CategoryCard categories={summary?.topCategories || []} />
        </div>
      </section>

      {toast ? <Toast toast={toast} onClose={() => setToast(null)} /> : null}
    </main>
  );
}

function LoadingScreen() {
  return (
    <div className="screen-message shimmer-screen">
      <div className="shimmer-bar large" />
      <div className="shimmer-bar medium" />
      <div className="shimmer-grid">
        <div className="shimmer-card" />
        <div className="shimmer-card" />
        <div className="shimmer-card" />
      </div>
    </div>
  );
}

function SummaryCards({ summary }) {
  if (!summary) return null;

  const cards = [
    { label: "Income", value: summary.income, tone: "income" },
    { label: "Expense", value: summary.expense, tone: "expense" },
    { label: "Net", value: summary.net, tone: summary.net >= 0 ? "income" : "expense" },
    { label: "Entries", value: summary.transactionCount, tone: "neutral", raw: true }
  ];

  return (
    <div className="summary-grid">
      {cards.map((card) => (
        <article key={card.label} className={`summary-card ${card.tone}`}>
          <span>{card.label}</span>
          <AnimatedValue value={card.value} raw={card.raw} />
        </article>
      ))}
    </div>
  );
}

function AnimatedValue({ value, raw = false }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frameId;
    const duration = 900;
    const start = performance.now();
    const target = Number(value || 0);

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayValue(target * eased);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <strong>{raw ? Math.round(displayValue) : formatCurrency(displayValue)}</strong>;
}

function PulseCard({ points }) {
  const maxExpense = Math.max(...points.map((point) => point.expense), 1);
  const flaggedPoint = points.find((point) => point.flagged);
  const ratio = flaggedPoint?.ratio || 0;
  const caption = flaggedPoint
    ? `Something stirred on ${prettyDate(flaggedPoint.date)} - spending spiked ${ratio.toFixed(1)}x above average.`
    : "The ledger is calm for now - no anomaly has broken the forecast.";

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">The forecast</p>
          <h2>Spending Pulse</h2>
          <p className="chart-caption">{caption}</p>
        </div>
      </div>

      <div className="pulse-chart">
        {points.map((point) => {
          const height = Math.max((point.expense / maxExpense) * 100, point.expense ? 12 : 4);
          return (
            <div key={point.date} className="pulse-bar-wrap">
              <div className={`pulse-frame ${point.flagged ? "flagged" : ""}`}>
                <div
                  className={`pulse-bar ${point.flagged ? "flagged" : ""}`}
                  style={{ height: `${height}%` }}
                  title={`${point.date}: ${formatCurrency(point.expense)}`}
                />
              </div>
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
  categories,
  onSubmit,
  errors,
  submitting,
  editingId,
  onCancel
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cast a new entry</p>
          <h2>{editingId ? "Rewrite this entry" : "Capture a new spell"}</h2>
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
              onChange={(event) =>
                setForm({
                  ...form,
                  type: event.target.value,
                  category: event.target.value === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]
                })
              }
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

function TransactionsTable({
  transactions,
  filter,
  setFilter,
  onEdit,
  onDelete,
  deletingIds,
  sparklingIds
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">The ledger</p>
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
                <tr
                  key={transaction.id}
                  className={[
                    deletingIds.includes(transaction.id) ? "vanishing-row" : "",
                    sparklingIds.includes(transaction.id) ? "sparkle-row" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td>
                    <strong>{transaction.title}</strong>
                    {transaction.note ? <span>{transaction.note}</span> : null}
                  </td>
                  <td>
                    <CategorySigil category={transaction.category} />
                  </td>
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
                      <button className="edit-link" type="button" onClick={() => onEdit(transaction)}>
                        Edit
                      </button>
                      <button
                        className="smoke-button"
                        type="button"
                        title="Vanish this entry"
                        onClick={() => onDelete(transaction)}
                      >
                        <FlameIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">The ledger awaits its first incantation.</div>
      )}
    </section>
  );
}

function CategoryCard({ categories }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">The breakdown</p>
          <h2>Expense hotspots</h2>
        </div>
      </div>

      <div className="category-list">
        {categories.length ? (
          categories.map((item) => (
            <div key={item.category} className="category-row">
              <CategorySigil category={item.category} />
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

function NotificationPanel({ notifications, onReadAll }) {
  return (
    <section className="omens-panel">
      <div className="omens-head">
        <div>
          <p className="eyebrow">Warnings & Omens</p>
          <h3>Messages from the ledger</h3>
        </div>
        <button className="ghost-button compact-ghost" type="button" onClick={onReadAll}>
          Mark read
        </button>
      </div>
      <div className="omens-list">
        {notifications.length ? (
          notifications.slice(0, 6).map((item) => (
            <article key={item.id} className={`omen-item ${item.severity}`}>
              <p>{formatOmen(item)}</p>
              <span>{formatTimestamp(item.created_at)}</span>
            </article>
          ))
        ) : (
          <div className="empty-state subtle">No ravens yet. The omens are quiet.</div>
        )}
      </div>
    </section>
  );
}

function CategorySigil({ category }) {
  return (
    <span className="category-sigil">
      <span className="sigil-mark">{CATEGORY_SIGILS[category] || category.slice(0, 1)}</span>
      {category}
    </span>
  );
}

function Toast({ toast, onClose }) {
  return (
    <div className={`toast ${toast.actionLabel ? "special" : ""}`}>
      <p>{toast.message}</p>
      <div className="toast-actions">
        {toast.actionLabel ? (
          <button
            className="toast-action"
            type="button"
            onClick={toast.onAction}
          >
            {toast.actionLabel}
          </button>
        ) : null}
        <button className="toast-close" type="button" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function WandIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m15 3 .7 2.3L18 6l-2.3.7L15 9l-.7-2.3L12 6l2.3-.7L15 3Z" fill="currentColor" />
      <path d="m7 11 .5 1.5L9 13l-1.5.5L7 15l-.5-1.5L5 13l1.5-.5L7 11Z" fill="currentColor" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4a4 4 0 0 0-4 4v1.3c0 .9-.3 1.8-.9 2.5L5.7 13.5c-.7.8-.1 2 .9 2h10.8c1 0 1.6-1.2.9-2l-1.4-1.7a4 4 0 0 1-.9-2.5V8a4 4 0 0 0-4-4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12.4 3.4c.4 2.6-1.4 3.8-2.8 5.7-1.2 1.5-1.6 2.6-1.6 4.2a4 4 0 1 0 8 0c0-2.7-1.2-4.5-3.6-6.9.1 1.5-.6 2.6-1.7 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoinRain() {
  const coins = Array.from({ length: 14 });
  return (
    <div className="coin-rain">
      {coins.map((_, index) => {
        const left = 45 + (Math.random() - 0.5) * 12;
        const size = 34 + Math.random() * 18;
        const delay = Math.random() * 450;
        const duration = 1800 + Math.random() * 900;
        const drift = -80 + Math.random() * 160;
        const rotate = 400 + Math.random() * 500;
        return (
          <svg
            key={index}
            className="coin-svg"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDelay: `${delay}ms`,
              animationDuration: `${duration}ms`,
              "--drift": `${drift}px`,
              "--rotate": `${rotate}deg`
            }}
            viewBox="0 0 64 64"
          >
            <defs>
              <linearGradient id={`gold${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF7BF"/>
                <stop offset="40%" stopColor="#FFD54A"/>
                <stop offset="100%" stopColor="#C98900"/>
              </linearGradient>
            </defs>
            <circle
              cx="32"
              cy="32"
              r="26"
              fill={`url(#gold${index})`}
              stroke="#B97A00"
              strokeWidth="3"
            />
            <text
              x="32"
              y="40"
              textAnchor="middle"
              fontWeight="700"
              fontSize="24"
              fill="#8B5A00"
            >
              L
            </text>
          </svg>
        );
      })}
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatTimestamp(value) {
  if (!value) return "Moments ago";
  const parsed = new Date(value.replace(" ", "T"));
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

function formatOmen(item) {
  if (item.severity === "critical") {
    return `A warning arrives by raven - ${item.message}`;
  }
  if (item.severity === "warning") {
    return `The cards tremble - ${item.message}`;
  }
  return `A whisper circles the wand - ${item.message}`;
}

function prettyDate(value) {
  const parsed = new Date(value);
  return new Intl.DateTimeFormat("en-IN", { month: "long", day: "numeric" }).format(parsed);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

