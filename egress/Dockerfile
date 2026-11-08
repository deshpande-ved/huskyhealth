# Egress capture (mitmweb). Built from python:slim so it runs on the Pi's ARM CPU.
FROM python:3.12-slim
RUN pip install --no-cache-dir mitmproxy==11.0.2
# redact.py hides API keys in the UI once each request has gone out (see the file)
COPY redact.py /redact.py
USER 10001
ENV HOME=/tmp
