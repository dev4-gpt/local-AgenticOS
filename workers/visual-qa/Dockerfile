FROM python:3.12.10-slim

WORKDIR /worker
COPY worker.py /worker/worker.py
RUN chmod 0555 /worker/worker.py \
  && useradd --system --uid 10001 --no-create-home worker
USER 10001
ENTRYPOINT ["python", "/worker/worker.py"]
