# Egress capture (mitmweb). Built from python:slim so it runs on the Pi's ARM CPU.
FROM python:3.12-slim
RUN pip install --no-cache-dir mitmproxy==11.0.2
USER 10001
ENV HOME=/tmp
