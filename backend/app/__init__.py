from flask import Flask

from .config import Config
from .db import close_db, init_app
from .routes import api


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    init_app(app)
    app.teardown_appcontext(close_db)
    app.register_blueprint(api, url_prefix="/api")

    return app
