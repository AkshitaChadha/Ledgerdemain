from pathlib import Path


class Config:
    BASE_DIR = Path(__file__).resolve().parent.parent
    DATABASE_PATH = BASE_DIR.parent / "data" / "ledger.db"
    DEFAULT_WEBHOOK_URL = ""
