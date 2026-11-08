FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /data/vaults && chown 10001 /data/vaults
USER 10001
# ONE worker: tokens, drop boxes and account sessions live in this process's RAM. Threads give concurrency. No access log.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:8000", "app:app"]
