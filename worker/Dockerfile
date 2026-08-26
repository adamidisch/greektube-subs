FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && python -m pip install --index-url https://download.pytorch.org/whl/cpu \
      torch==2.8.0+cpu torchaudio==2.8.0+cpu torchvision==0.23.0+cpu \
    && python -m pip install -r requirements.txt

COPY greektube_worker ./greektube_worker
COPY fixtures ./fixtures

ENV PORT=8080 \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8 \
    WHISPER_MODEL=large-v3 \
    WHISPER_LANGUAGE=en

EXPOSE 8080
CMD ["python", "-m", "greektube_worker.main"]
