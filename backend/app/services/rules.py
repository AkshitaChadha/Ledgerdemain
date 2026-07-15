from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import mean


@dataclass
class RuleAlert:
    title: str
    message: str
    severity: str
    action_label: str
    action_text: str
    source_transaction_id: int | None
    source_transaction_title: str
    medium: str = "in-app"


def analyze_transaction(transaction: dict, recent_transactions: list[dict]) -> list[RuleAlert]:
    alerts: list[RuleAlert] = []

    duplicates = [
        item
        for item in recent_transactions
        if item["title"].strip().lower() == transaction["title"].strip().lower()
        and item["category"] == transaction["category"]
        and item["type"] == transaction["type"]
        and abs(float(item["amount"]) - float(transaction["amount"])) < 0.01
        and item["transaction_date"] == transaction["transaction_date"]
    ]
    if duplicates:
        alerts.append(
            RuleAlert(
                title="Possible duplicate detected",
                message="A matching transaction already exists for the same date and amount.",
                severity="warning",
                action_label="Review duplicate",
                action_text="Compare it with the earlier entry before keeping both.",
                source_transaction_id=transaction.get("id"),
                source_transaction_title=transaction["title"],
            )
        )

    if transaction["type"] == "expense":
        recent_expenses = [
            float(item["amount"]) for item in recent_transactions if item["type"] == "expense"
        ]
        if len(recent_expenses) >= 3:
            baseline = mean(recent_expenses)
            if baseline > 0 and float(transaction["amount"]) >= baseline * 2:
                alerts.append(
                    RuleAlert(
                        title="Unusual spending spike",
                        message=(
                            f"This expense is about {round(float(transaction['amount']) / baseline, 1)}x "
                            "your recent average."
                        ),
                        severity="critical",
                        action_label="Check the amount",
                        action_text="Confirm this spend is intentional and not a mistaken entry.",
                        source_transaction_id=transaction.get("id"),
                        source_transaction_title=transaction["title"],
                    )
                )

    if transaction["category"].lower() in {"other", "misc", "uncategorized"}:
        alerts.append(
            RuleAlert(
                title="Loose categorization",
                message="This transaction uses a broad category. Tight categories improve insights.",
                severity="info",
                action_label="Refine category",
                action_text="Use a more specific bucket so trend analysis stays useful.",
                source_transaction_id=transaction.get("id"),
                source_transaction_title=transaction["title"],
            )
        )

    if _weekly_balance_is_negative(transaction, recent_transactions):
        alerts.append(
            RuleAlert(
                title="Weekly cashflow turned negative",
                message="Your last 7 days now show higher expenses than income.",
                severity="warning",
                action_label="Rebalance this week",
                action_text="Review recent spends and delay non-essential expenses if possible.",
                source_transaction_id=transaction.get("id"),
                source_transaction_title=transaction["title"],
            )
        )

    return alerts


def _weekly_balance_is_negative(transaction: dict, recent_transactions: list[dict]) -> bool:
    window_start = datetime.fromisoformat(transaction["transaction_date"]) - timedelta(days=6)

    scoped = [
        item
        for item in recent_transactions + [transaction]
        if datetime.fromisoformat(item["transaction_date"]) >= window_start
    ]

    income = sum(float(item["amount"]) for item in scoped if item["type"] == "income")
    expense = sum(float(item["amount"]) for item in scoped if item["type"] == "expense")
    return expense > income
