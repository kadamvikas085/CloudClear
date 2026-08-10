FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install everything except torch first...
RUN pip install --no-cache-dir -r requirements.txt

# ...then install the CPU-only torch build (much smaller than the
# default CUDA build, and this environment has no GPU anyway).
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY . .

# Pre-download the real LaMa weights (~196MB) at build time so the
# first real request doesn't pay that cost. If the build environment
# has no network access to GitHub, this is allowed to fail silently —
# cloud_ops.py falls back to classical inpainting automatically if the
# model isn't available at runtime.
RUN python -c "import lama_model; lama_model.is_available()" || true

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]