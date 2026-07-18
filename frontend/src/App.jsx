import { useEffect, useRef, useState } from "react";
import coinDropSound from "./assets/coin_sound.mp3";
import logo from "./assets/ledgerdemain-icon.svg";
import API from "./api";
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

function deriveMonthsFromTransactions(items = []) {
  return Array.from(
    new Set(
      items
        .map((item) => item.transaction_date?.slice(0, 7))
        .filter(Boolean)
    )
  )
    .sort()
    .reverse()
    .map((value) => {
      const [year, month] = value.split("-");
      return { value, month, year };
    });
}

const EMAIL_ALERT_SEVERITIES = new Set(["warning", "critical"]);

function emailJsConfigured() {
  return Boolean(
    import.meta.env.VITE_EMAILJS_SERVICE_ID &&
      (import.meta.env.VITE_EMAILJS_TEMPLATE_ID ||
        import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE_ID ||
        import.meta.env.VITE_EMAILJS_ALERT_TEMPLATE_ID) &&
      import.meta.env.VITE_EMAILJS_PUBLIC_KEY &&
      window.emailjs
  );
}

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
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [duplicateReasons, setDuplicateReasons] = useState([]);
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [transactionPage, setTransactionPage] = useState(0);
  const [liveNotifications, setLiveNotifications] = useState([]);
  const notificationIdsRef = useRef(new Set());

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
      const response = await fetch(`${API}/api/bootstrap`);
      if (!response.ok) {
        throw new Error("Failed to load dashboard data.");
      }
      const data = await response.json();
      const settings = await fetch(`${API}/api/settings`);
      const settingsData = await settings.json();

      setNotificationEmail(
          settingsData.notification_email || ""
      );
      const availableMonths = data.months?.length
        ? data.months
        : deriveMonthsFromTransactions(data.transactions);

      setTransactions(data.transactions);
      setSummary(data.summary);
      setNotificationState(data.notifications);
      setMonths(availableMonths);
      setSelectedMonth((current) =>
        current && availableMonths.some((month) => month.value === current)
          ? current
          : availableMonths[0]?.value || ""
      );
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

  function setNotificationState(nextNotifications = [], options = {}) {
    const unread = (nextNotifications || []).filter((item) => !item.is_read);

    if (options.flash) {
      const flashSource = options.flashNotifications || unread;
      const fresh = flashSource.filter(
        (item) => !item.is_read && !notificationIdsRef.current.has(item.id)
      );

      fresh.forEach((item) => {
        setLiveNotifications((current) => [item, ...current].slice(0, 4));
        window.setTimeout(() => {
          setLiveNotifications((current) =>
            current.filter((notification) => notification.id !== item.id)
          );
        }, 4600);
      });
    }

    notificationIdsRef.current = new Set(unread.map((item) => item.id));
    setNotifications(unread);
  }

  async function sendBrowserEmail(payload) {
    if (!notificationEmail || !emailJsConfigured()) {
      return false;
    }

    const templateId =
      payload.templateId ||
      import.meta.env.VITE_EMAILJS_TEMPLATE_ID ||
      import.meta.env.VITE_EMAILJS_ALERT_TEMPLATE_ID ||
      import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE_ID;

    try {
      await window.emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID,
        templateId,
        {
          to_email: notificationEmail,
          user_email: notificationEmail,
          email: notificationEmail,
          subject: payload.subject,
          eyebrow: payload.eyebrow,
          title: payload.title,
          message: payload.message,
          reasons: payload.reasons || payload.message,
          action: payload.action || "Open Ledgerdemain and review the latest entry.",
          app_name: "Ledgerdemain",
        },
        {
          publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
        }
      );
      return true;
    } catch (error) {
      console.warn("EmailJS send failed", error);
      return false;
    }
  }

  async function sendWelcomeEmail(eventType) {
    const isChanged = eventType === "changed";
    return sendBrowserEmail({
      templateId:
        import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE_ID ||
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
      subject: isChanged ? "Ledgerdemain alert email changed" : "Welcome to Ledgerdemain",
      eyebrow: isChanged ? "Alert route changed" : "Welcome omen",
      title: isChanged ? "The ravens have a new route." : "The ledger knows where to find you.",
      message: isChanged
        ? "Your Ledgerdemain alert email was updated successfully. Important omens, duplicate warnings, and spending spikes will now arrive at this address."
        : "Your alert email is connected. Ledgerdemain will stay quiet for ordinary bookkeeping and only send mail when something deserves attention.",
      action: isChanged
        ? "If this was not you, open the app and update the notification email."
        : "Add a few entries to see the warning system come alive.",
    });
  }

  async function sendAlertEmailDigest(alerts = [], transaction = null) {
    const importantAlerts = alerts.filter((alert) =>
      EMAIL_ALERT_SEVERITIES.has(alert.severity)
    );

    if (!importantAlerts.length) {
      return false;
    }

    const transactionLabel = transaction?.title
      ? `${transaction.title} (${formatCurrency(transaction.amount)})`
      : "your latest ledger entry";
    const reasons = importantAlerts
      .map((alert, index) => `${index + 1}. ${alert.title}: ${alert.message}`)
      .join("\n");
    const actions = importantAlerts
      .map((alert) => alert.action_text)
      .filter(Boolean)
      .join(" ");

    return sendBrowserEmail({
      templateId:
        import.meta.env.VITE_EMAILJS_ALERT_TEMPLATE_ID ||
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
      subject:
        importantAlerts.length > 1
          ? `Ledgerdemain found ${importantAlerts.length} omens`
          : importantAlerts[0].title,
      eyebrow: "Warning omen",
      title:
        importantAlerts.length > 1
          ? "The ledger found multiple omens."
          : importantAlerts[0].title,
      message: `Ledgerdemain reviewed ${transactionLabel} and found:\n\n${reasons}\n\nThe ledger is not judging the spend. It is asking you to look twice.`,
      reasons,
      action: actions || "Open Ledgerdemain and review the latest entry.",
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setServerError("");

    try {
      const isEditing = editingId !== null;
      const response = await fetch(isEditing ? `${API}/api/transactions/${editingId}` : `${API}/api/transactions`, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = await response.json();
      if (data.duplicateFound) {
        setNotificationState(data.notifications, { flash: true });
        await sendBrowserEmail({
          templateId:
            import.meta.env.VITE_EMAILJS_ALERT_TEMPLATE_ID ||
            import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
          subject: "Ledgerdemain detected a possible duplicate",
          eyebrow: "Duplicate warning",
          title: "The ledger sensed an echo.",
          message: `${form.title} looks similar to ${data.duplicate?.title || "an existing transaction"}. ${(
            data.matchReasons || []
          ).join(" ")}`,
          action: "Compare the entries before keeping both.",
        });
        setDuplicateModal(data.duplicate);
        setDuplicateReasons(data.matchReasons || []);
        setSubmitting(false);
        return;
      }
      if (!response.ok) {
        setErrors(data.errors || {});
        throw new Error("Please review the transaction details.");
      }

      setTransactions(data.transactions || [data.transaction, ...transactions]);
      setSummary(data.summary);
      setNotificationState(data.notifications, { flash: true });
      await sendAlertEmailDigest(data.alerts || [], data.transaction);
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

  async function forceSaveDuplicate() {
  setSubmitting(true);

  try {
    const response = await fetch(`${API}/api/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...form,
        force_save: true,
      }),
    });

    const data = await response.json();

    setTransactions(data.transactions || [data.transaction, ...transactions]);
    setSummary(data.summary);
    setNotificationState(data.notifications, { flash: true });
    await sendAlertEmailDigest(data.alerts || [], data.transaction);

    setDuplicateModal(null);

    setForm({
      ...initialForm,
      category:
        form.type === "income"
          ? INCOME_CATEGORIES[0]
          : EXPENSE_CATEGORIES[0],
      transaction_date: new Date().toISOString().slice(0, 10),
    });

    showToast({
      message: "The spell was cast anyway.",
    });

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
      const response = await fetch(`${API}/api/transactions/${transaction.id}`, {
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
      setNotificationState(data.notifications, { flash: true });

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
            `${API}/api/transactions/undo-delete/${data.undoEventId}`,
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
          setNotificationState(undoData.notifications, { flash: true });

          showToast({
            message: "The ledger reversed the spell.",
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
    const response = await fetch(`${API}/api/notifications/read-all`, { method: "POST" });
    const data = await response.json();
    setNotificationState(data.notifications);
    setShowOmens(false);
  }

  async function saveNotificationEmail() {
    setServerError("");

    try {
      const response = await fetch(`${API}/api/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          notification_email: notificationEmail
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error("Could not save notification email.");
      }

      let sent = false;
      if (data.emailEvent) {
        sent = await sendWelcomeEmail(data.emailEvent);
      }

      const emailCopy = {
        welcome: sent
          ? "✨ The ledger now knows where to send its whispers."
          : "✨ The ledger now knows where to send its whispers.",
        changed: sent
          ? "Alert email changed. Confirmation sent to the new address."
          : "Notification email updated.",
      };

      showToast({
        message: emailCopy[data.emailEvent] || "Notification email saved."
      });
    } catch (error) {
      setServerError(error.message);
    }
  }

  const filteredTransactions = transactions.filter((transaction) => {

    if (filter !== "all" && transaction.type !== filter)
        return false;
    if (
        selectedMonth &&
        !transaction.transaction_date.startsWith(selectedMonth)
    )
        return false;
    return true;
});


const monthSummary = (() => {
  const income = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expense = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = {};

  filteredTransactions.forEach((t) => {
    if (t.type === "expense") {
      byCategory[t.category] =
        (byCategory[t.category] || 0) + Number(t.amount);
    }
  });

  return {
    income,
    expense,
    net: income - expense,
    transactionCount: filteredTransactions.length,

    topCategories: Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount,
      })),
  };
})();
const monthPulse = (() => {
  const daily = {};

  filteredTransactions.forEach((t) => {
    if (t.type !== "expense") return;

    daily[t.transaction_date] =
      (daily[t.transaction_date] || 0) + Number(t.amount);
  });

  const dates = Object.keys(daily).sort();

  const expenses = Object.values(daily);

  const average =
    expenses.length > 0
      ? expenses.reduce((a, b) => a + b, 0) / expenses.length
      : 0;

  const points = dates.map((date) => ({
    date,
    expense: daily[date],
    flagged: false,
    ratio: average ? daily[date] / average : 0,
  }));

  const standout = points
    .filter((point) => average > 0 && point.expense > average * 1.6)
    .sort((a, b) => b.ratio - a.ratio || b.expense - a.expense || b.date.localeCompare(a.date))[0];

  return points.map((point) => ({
    ...point,
    flagged: standout?.date === point.date,
  }));
})();

  const unreadNotifications = (notifications ?? []).filter(
    (item) => !item.is_read
  );

  useEffect(() => {
    setTransactionPage(0);
  }, [filter, selectedMonth]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <main className="app-shell">
      {coinRain && <CoinRain />}
      <header className="branding-bar">
        <div className="brand-lockup">
          <img
            src={logo}
            alt="Ledgerdemain"
            className="brand-logo"
          />
          <div>
            <h1>Ledgerdemain</h1>
            <p>Your money, made magically simple.</p>
          </div>
        </div>

        <div className="branding-actions">
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
                notifications={unreadNotifications}
                onReadAll={markNotificationsRead}
              />
            ) : null}
          </div>
        </div>
      </header>

      {serverError ? <div className="banner error">{serverError}</div> : null}

      <section className="dashboard-grid">
        <div className="stack">
          <SummaryCards summary={monthSummary} />
          <PulseCard points={monthPulse} />
          <TransactionsTable
            transactions={filteredTransactions}
            filter={filter}
            setFilter={setFilter}
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            onEdit={startEditing}
            onDelete={handleDelete}
            deletingIds={deletingIds}
            sparklingIds={sparklingIds}
            page={transactionPage}
            setPage={setTransactionPage}
            
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
          <CategoryCard categories={monthSummary?.topCategories || []} />
          <NotificationSettings
              notificationEmail={notificationEmail}
              setNotificationEmail={setNotificationEmail}
              onSave={saveNotificationEmail}
          />
        </div>
      </section>

      {toast ? <Toast toast={toast} onClose={() => setToast(null)} /> : null}
      <LiveNotifications notifications={liveNotifications} />
      {duplicateModal ? (
        <DuplicateModal
          transaction={duplicateModal}
          reasons={duplicateReasons}
          onCancel={() => setDuplicateModal(null)}
          onConfirm={forceSaveDuplicate}
        />
      ) : null}
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
  months,
  selectedMonth,
  setSelectedMonth,
  onEdit,
  onDelete,
  deletingIds,
  sparklingIds,
  page,
  setPage
}) {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const startIndex = safePage * pageSize;
  const visibleTransactions = transactions.slice(startIndex, startIndex + pageSize);
  const showingStart = transactions.length ? startIndex + 1 : 0;
  const showingEnd = Math.min(startIndex + pageSize, transactions.length);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">The ledger</p>
          <h2>Transaction history</h2>

          <div className="month-strip">
            {months.map((month) => {
              const date = new Date(month.value + "-01");

              const label = date.toLocaleString("default", {
                month: "short",
                year: "numeric",
              });

              return (
                <button
                  key={month.value}
                  type="button"
                  className={
                    selectedMonth === month.value
                      ? "month-chip active"
                      : "month-chip"
                  }
                  onClick={() => setSelectedMonth(month.value)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="filter-group"
          role="tablist"
          aria-label="Transaction type filter"
        >
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
              {visibleTransactions.map((transaction) => (
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

      <div className="ledger-pagination">
        <span>
          Showing {showingStart}-{showingEnd} of {transactions.length} entries
        </span>
        <div className="pagination-actions">
          <button
            type="button"
            className="pagination-arrow"
            disabled={safePage === 0}
            onClick={() => setPage(Math.max(safePage - 1, 0))}
            aria-label="Previous 10 entries"
          >
            &lt;
          </button>
          <span>
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="pagination-arrow"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(Math.min(safePage + 1, totalPages - 1))}
            aria-label="Next 10 entries"
          >
            &gt;
          </button>
        </div>
      </div>
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
function NotificationSettings({
  notificationEmail,
  setNotificationEmail,
  onSave,
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Alerts</p>
          <h2>Notification Email</h2>
        </div>
      </div>

      <input
        className="notification-input"
        type="email"
        placeholder="you@example.com"
        value={notificationEmail}
        onChange={(e) => setNotificationEmail(e.target.value)}
      />

      <p className="muted">
        Emails send only for duplicate warnings and high-priority spending alerts.
      </p>

      <button
        className="primary-button"
        type="button"
        onClick={onSave}
      >
        Save
      </button>
    </section>
  );
}
function NotificationPanel({ notifications, onReadAll }) {
  const unreadNotifications = (notifications || []).filter((item) => !item.is_read);

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
        {unreadNotifications.length ? (
          unreadNotifications.slice(0, 6).map((item) => (
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

function LiveNotifications({ notifications }) {
  if (!notifications.length) {
    return null;
  }

  return (
    <div className="live-notification-stack" aria-live="polite">
      {notifications.map((item) => (
        <article key={item.id} className={`live-notification ${item.severity}`}>
          <span className="live-notification-kicker">New omen</span>
          <strong>{item.title}</strong>
          <p>{formatOmen(item)}</p>
        </article>
      ))}
    </div>
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
function DuplicateModal({
  transaction,
  reasons,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="modal-backdrop">
      <div className="duplicate-modal">

        <div className="duplicate-icon">🪄</div>

        <h2>The ledger senses an echo...</h2>

        <p className="duplicate-copy">
          A remarkably similar transaction already exists.
          The ledger explains why it believes this may be a duplicate.
        </p>

        <div className="duplicate-card">

          <div className="duplicate-title">
            {transaction.title}
          </div>

          <div className="duplicate-details">

            <span>{transaction.category}</span>

            <span
              className={
                transaction.type === "income"
                  ? "positive"
                  : "negative"
              }
            >
              {transaction.type === "income" ? "+" : "-"}
              {formatCurrency(transaction.amount)}
            </span>

            <span>{transaction.transaction_date}</span>

          </div>

        </div>

        <div className="duplicate-reasons">

          <h4>Why it was flagged</h4>

          {(reasons || []).map((reason, index) => (

            <div
              key={index}
              className="duplicate-reason"
            >
              ✓ {reason}
            </div>

          ))}

        </div>

        <div className="duplicate-actions">

          <button
            type="button"
            className="primary-button"
            onClick={onCancel}
          >
            Return to Ledger
          </button>

          <button
            type="button"
            className="ghost-button"
            onClick={onConfirm}
          >
            Cast Anyway
          </button>

        </div>

      </div>
    </div>
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
