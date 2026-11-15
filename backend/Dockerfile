# One image for all backend services; SERVICE picks which one runs:
#   auth_service | document_service | gateway
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production PORT=8000
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY common ./common
COPY auth_service ./auth_service
COPY document_service ./document_service
COPY gateway ./gateway
RUN useradd --create-home app && mkdir -p /app/data && chown app /app/data
USER app
ARG SERVICE=gateway
ENV SERVICE=${SERVICE}
CMD ["sh", "-c", "exec uvicorn ${SERVICE}:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
