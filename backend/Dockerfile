# Recipe for packing the FastAPI backend into a Docker container (used on Render).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# install Python packages first (this layer is cached between builds)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# run as a non-admin user for safety
RUN useradd --create-home appuser
USER appuser

# Render tells us which port to use through the PORT variable
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
