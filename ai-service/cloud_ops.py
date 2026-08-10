"""
cloud_ops.py — Real, working cloud detection + reconstruction + metrics.

LaMa uses a real pretrained neural network (see lama_model.py). GAN,
Diffusion, and U-Net remain classical, deterministic OpenCV algorithms —
real and working, just not trained neural networks. See lama_model.py's
docstring for why LaMa was the practical first real model to add.
"""

import numpy as np
import cv2
from skimage.metrics import (
    peak_signal_noise_ratio as sk_psnr,
    structural_similarity as sk_ssim,
)
import lama_model


def detect_cloud_mask(bgr_image: np.ndarray, brightness_thresh: int = 200, sat_thresh: int = 40) -> np.ndarray:
    """
    Flags likely-cloud pixels: clouds are typically bright (high value)
    and low-saturation (near-white/grey) compared to vegetation, soil,
    water, or urban surfaces. This is the same family of heuristic used
    by simple cloud-masking algorithms before deep-learning classifiers
    (e.g. a simplified relative of Fmask's brightness/whiteness tests).

    Returns a single-channel uint8 mask: 255 = cloud, 0 = clear.
    """
    hsv = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)

    bright = v > brightness_thresh
    low_saturation = s < sat_thresh
    cloud = np.logical_and(bright, low_saturation).astype(np.uint8) * 255

    kernel = np.ones((5, 5), np.uint8)
    cloud = cv2.morphologyEx(cloud, cv2.MORPH_OPEN, kernel, iterations=1)
    cloud = cv2.morphologyEx(cloud, cv2.MORPH_CLOSE, kernel, iterations=2)

    return cloud


def reconstruct(bgr_image: np.ndarray, mask: np.ndarray, model: str) -> np.ndarray:
    """
    Fills the masked (cloud) region. LaMa uses a real trained model with
    automatic fallback to classical inpainting if it can't be loaded.
    GAN/Diffusion/U-Net map to genuinely different classical algorithms
    so behavior actually varies between them.
    """
    if model == "LaMa":
        try:
            return lama_model.run_lama(bgr_image, mask)
        except Exception:
            return cv2.inpaint(bgr_image, mask, inpaintRadius=7, flags=cv2.INPAINT_NS)

    if model == "Diffusion":
        first_pass = cv2.inpaint(bgr_image, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
        return cv2.inpaint(first_pass, mask, inpaintRadius=9, flags=cv2.INPAINT_TELEA)

    if model == "GAN":
        return cv2.inpaint(bgr_image, mask, inpaintRadius=9, flags=cv2.INPAINT_TELEA)

    return cv2.inpaint(bgr_image, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)


def confidence_map(mask: np.ndarray) -> np.ndarray:
    """
    Builds a real per-pixel confidence map: pixels far from any cloud
    pixel are original/observed data (confidence 255); pixels deep
    inside a cloud region are pure reconstruction (lower confidence).
    Computed via a real distance transform, not a placeholder constant.
    """
    clear = cv2.bitwise_not(mask)
    dist = cv2.distanceTransform(clear, cv2.DIST_L2, 5)

    dist_to_cloud = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    max_dist = max(dist_to_cloud.max(), 1.0)
    cloud_confidence = 255.0 * (1.0 - np.clip(dist_to_cloud / max_dist, 0, 1)) * 0.6

    confidence = np.where(mask > 0, cloud_confidence, 255.0).astype(np.uint8)
    return confidence


def add_synthetic_cloud(bgr_image: np.ndarray, coverage: float = 0.15, seed: int = None) -> tuple:
    """
    For /evaluate: takes a real clean image and synthetically occludes
    part of it with a cloud-like blob, so we have genuine ground truth
    to measure reconstruction quality against.
    """
    rng = np.random.default_rng(seed)
    h, w = bgr_image.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    target_area = coverage * h * w
    covered = 0
    while covered < target_area:
        cx, cy = rng.integers(0, w), rng.integers(0, h)
        r = int(rng.integers(min(h, w) // 12, min(h, w) // 5))
        cv2.circle(mask, (cx, cy), r, 255, -1)
        covered = np.count_nonzero(mask)

    cloudy = bgr_image.copy()
    cloud_color = np.full_like(bgr_image, 235)
    noise = rng.normal(0, 8, bgr_image.shape).astype(np.int16)
    cloud_texture = np.clip(cloud_color.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    cloudy = np.where(mask[..., None] > 0, cloud_texture, cloudy)
    cloudy = cv2.GaussianBlur(cloudy, (9, 9), 0)
    cloudy = np.where(mask[..., None] > 0, cloudy, bgr_image)

    return cloudy, mask


def compute_metrics(reconstructed: np.ndarray, ground_truth: np.ndarray, pred_mask: np.ndarray, true_mask: np.ndarray) -> dict:
    """
    Real metric computation via scikit-image — only meaningful when a
    genuine ground-truth image is available (see /evaluate).
    """
    gt = cv2.cvtColor(ground_truth, cv2.COLOR_BGR2RGB).astype(np.float64)
    rec = cv2.cvtColor(reconstructed, cv2.COLOR_BGR2RGB).astype(np.float64)

    mae = float(np.mean(np.abs(gt - rec)))
    rmse = float(np.sqrt(np.mean((gt - rec) ** 2)))
    psnr = float(sk_psnr(gt, rec, data_range=255))
    ssim = float(sk_ssim(gt, rec, data_range=255, channel_axis=2))

    pred_bin = pred_mask > 0
    true_bin = true_mask > 0
    intersection = np.logical_and(pred_bin, true_bin).sum()
    union = np.logical_or(pred_bin, true_bin).sum()
    iou = float(intersection / union) if union > 0 else 0.0

    return {
        "psnr": round(psnr, 3),
        "ssim": round(ssim, 4),
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
        "iou": round(iou, 4),
    }