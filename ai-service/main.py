"""
CloudVision AI - FastAPI inference service

Two endpoints:
  POST /predict   - production path: real image, real cloud detection +
                     removal, no fake metrics (see note below).
  POST /evaluate   - benchmarking path: synthetically clouds a known-clean
                     image and computes REAL PSNR/SSIM/RMSE/MAE/IoU against
                     the true original.

IMPORTANT: Only LaMa is a real trained neural network (see lama_model.py).
GAN/Diffusion/U-Net use classical OpenCV algorithms — real and working,
just not trained neural networks.
"""

import base64
import io
import os
import time
from typing import Optional

import cv2
import httpx
import numpy as np
from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form
from PIL import Image
from pydantic import BaseModel

from cloud_ops import (
    detect_cloud_mask,
    reconstruct,
    confidence_map,
    add_synthetic_cloud,
    compute_metrics,
)

app = FastAPI(title="CloudVision AI - Inference Service")

# Load environment variables from a .env file if python-dotenv is available.
try:
    from dotenv import load_dotenv

    load_dotenv()  # optional; harmless if no .env exists
except Exception:
    pass

# API key used to protect the inference endpoints. Set the environment variable
# `CLOUDVISION_API_KEY` in production. If not set, we fall back to the placeholder
# value used during development.
API_KEY = os.getenv("CLOUDVISION_API_KEY", "replace_with_shared_secret_between_express_and_fastapi")
ALLOWED_MODELS = {"GAN", "Diffusion", "LaMa", "U-Net"}


class PredictRequest(BaseModel):
    imageUrl: str
    model: str
    imageId: str


class Metrics(BaseModel):
    processingTimeMs: int
    psnr: Optional[float] = None
    ssim: Optional[float] = None
    iou: Optional[float] = None
    rmse: Optional[float] = None
    mae: Optional[float] = None
    confidenceScore: float
    metricsNote: Optional[str] = None


class PredictResponse(BaseModel):
    processedImageBase64: str
    confidenceMapBase64: str
    metrics: Metrics


class EvaluateMetrics(BaseModel):
    processingTimeMs: int
    psnr: float
    ssim: float
    iou: float
    rmse: float
    mae: float
    confidenceScore: float


class EvaluateResponse(BaseModel):
    cloudyImageBase64: str
    processedImageBase64: str
    confidenceMapBase64: str
    metrics: EvaluateMetrics


def verify_api_key(x_api_key: Optional[str]) -> None:
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def bgr_to_base64_png(bgr: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to encode output image")
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def load_bgr_from_bytes(data: bytes) -> np.ndarray:
    pil_img = Image.open(io.BytesIO(data)).convert("RGB")
    rgb = np.array(pil_img)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "cloudvision-ai-inference"}


@app.post("/predict", response_model=PredictResponse)
async def predict(payload: PredictRequest, x_api_key: Optional[str] = Header(default=None)):
    verify_api_key(x_api_key)

    if payload.model not in ALLOWED_MODELS:
        raise HTTPException(status_code=422, detail=f"model must be one of {sorted(ALLOWED_MODELS)}")

    started = time.time()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(payload.imageUrl)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to download source image: {exc}")

    bgr = load_bgr_from_bytes(resp.content)

    mask = detect_cloud_mask(bgr)
    reconstructed = reconstruct(bgr, mask, payload.model)
    conf_map = confidence_map(mask)

    processing_time_ms = int((time.time() - started) * 1000)

    return PredictResponse(
        processedImageBase64=bgr_to_base64_png(reconstructed),
        confidenceMapBase64=bgr_to_base64_png(cv2.cvtColor(conf_map, cv2.COLOR_GRAY2BGR)),
        metrics=Metrics(
            processingTimeMs=processing_time_ms,
            confidenceScore=round(float(conf_map.mean()) / 255.0, 4),
            metricsNote=(
                "psnr/ssim/rmse/mae are omitted here because there is no ground-truth "
                "cloud-free version of this image to compare against. Use POST /evaluate "
                "with a known-clean image to get real, meaningful values for these metrics."
            ),
        ),
    )


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(
    file: UploadFile = File(...),
    model: str = Form(...),
    coverage: float = Form(0.15),
    x_api_key: Optional[str] = Header(default=None),
):
    """
    Upload any clean image; this endpoint synthetically adds a cloud,
    reconstructs it with the chosen model, and returns real PSNR/SSIM/
    RMSE/MAE/IoU computed against the actual original — genuine metrics,
    not placeholders.
    """
    verify_api_key(x_api_key)

    if model not in ALLOWED_MODELS:
        raise HTTPException(status_code=422, detail=f"model must be one of {sorted(ALLOWED_MODELS)}")
    if not (0.02 <= coverage <= 0.6):
        raise HTTPException(status_code=422, detail="coverage must be between 0.02 and 0.6")

    started = time.time()

    content = await file.read()
    original_bgr = load_bgr_from_bytes(content)

    cloudy_bgr, true_mask = add_synthetic_cloud(original_bgr, coverage=coverage)
    pred_mask = detect_cloud_mask(cloudy_bgr)
    reconstructed = reconstruct(cloudy_bgr, pred_mask, model)
    conf_map = confidence_map(pred_mask)

    metrics = compute_metrics(reconstructed, original_bgr, pred_mask, true_mask)
    processing_time_ms = int((time.time() - started) * 1000)

    return EvaluateResponse(
        cloudyImageBase64=bgr_to_base64_png(cloudy_bgr),
        processedImageBase64=bgr_to_base64_png(reconstructed),
        confidenceMapBase64=bgr_to_base64_png(cv2.cvtColor(conf_map, cv2.COLOR_GRAY2BGR)),
        metrics=EvaluateMetrics(
            processingTimeMs=processing_time_ms,
            confidenceScore=round(float(conf_map.mean()) / 255.0, 4),
            **metrics,
        ),
    )