# Ledger Pulse

Ledger Pulse is a lightweight full-stack mini-ledger built for the Bytex challenge. It helps users record income and expenses, review categories, see instant summaries, and receive smart notifications when spending patterns look risky or unusual.

## Why this project fits the challenge

This app covers the required ledger flow:

- Add and view transactions
- Categorize income and expenses
- See summary insights
- Trigger internal notifications

It also adds a unique twist:

- A rule-based smart alert engine that detects duplicate entries, broad categorization, spending spikes, and negative weekly cashflow
- A custom `Spending Pulse` visualization that highlights unusually heavy expense days over the last 14 days

## Tech stack

### Backend

- Flask
- SQLite
- Standard-library service layers for rules and webhook delivery

### Frontend

- React
- Vite
- Custom CSS

## Project structure

```text
backend/
  app/
    services/
frontend/
```

## Features

- Add transactions with validation
- View transaction history
- Get income, expense, net balance, and category summaries
- Read smart in-app alerts
- Optionally send alert payloads to a webhook URL
- Spot anomaly days in the Spending Pulse chart

## AI usage

This submission is intentionally built with AI assistance, but not blindly generated.

### AI tools used

- ChatGPT / Codex for scaffolding, component drafting, and implementation acceleration

### How AI accelerated the work

- Generated the initial full-stack project scaffold faster than manual setup
- Helped draft form structure, API route shapes, and summary calculations
- Accelerated repetitive UI and CRUD boilerplate

### Where AI fell short

- AI tends to over-engineer simple apps with unnecessary abstractions or suggest heavier stacks
- AI often produces generic dashboards that look interchangeable
- AI can miss finance-specific edge cases like duplicate entries, future dates, or broad category misuse
- AI often mixes business rules into route handlers and creates code that becomes harder to maintain

### Human engineering decisions that improved the result

- Chose Flask because it fits the project scale and aligns better with my existing backend experience
- Added a dedicated rule engine so anomaly detection logic stays separate from CRUD code
- Replaced generic charts with a custom-built Spending Pulse visualization
- Added user-facing validation and polished error states instead of relying on raw API failures
- Designed notifications as meaningful financial signals rather than simple “transaction added” messages

## Local setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the Flask server on `http://127.0.0.1:5000`.

## Future improvements

- Edit and delete transactions
- User authentication
- Budget goals per category
- Scheduled digest notifications
- Export reports as PDF or CSV
