Run migrations from this folder using Alembic. The environment is wired to the app's SQLAlchemy Base and reads DATABASE_URL from settings.

Typical commands:

alembic revision --autogenerate -m "initial"
alembic upgrade head

