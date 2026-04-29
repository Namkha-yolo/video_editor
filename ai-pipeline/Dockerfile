FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 clipvibe

WORKDIR /app

COPY --chown=clipvibe:clipvibe requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=clipvibe:clipvibe . .

USER clipvibe

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
