from flask import Flask
from dotenv import load_dotenv

from .config import Config
from .db import close_db, init_app
from .routes import api
from flask_cors import CORS

def create_app() -> Flask:
    load_dotenv(Config.BASE_DIR / ".env")

    app = Flask(__name__)
    CORS(app)
    app.config.from_object(Config)

    init_app(app)
    app.teardown_appcontext(close_db)
    app.register_blueprint(api, url_prefix="/api")

    return app
