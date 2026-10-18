FROM python:3.11-slim

WORKDIR /app

# Install system libraries required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install CPU-only PyTorch
RUN pip install --no-cache-dir \
    torch \
    --index-url https://download.pytorch.org/whl/cpu

COPY . .

# Verify required libraries
RUN python -c "import cv2, torch; print('OpenCV:', cv2.__version__); print('PyTorch:', torch.__version__)"

# Pre-download LaMa weights when available
RUN python -c "import lama_model; print('LaMa available:', lama_model.is_available())" || true

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]