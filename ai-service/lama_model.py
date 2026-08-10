"""
lama_model.py — Loads the REAL pretrained LaMa (Suvorov et al., 2021)
inpainting model, published by the simple-lama-inpainting project
(https://github.com/enesmsahin/simple-lama-inpainting), trained on
Places2. This is a genuine trained neural network (Fourier convolutions),
not a classical CV stand-in — the only one of the four selectable models
that currently is.

Why this file exists instead of just using SimpleLama() directly:
simple-lama-inpainting's default loader calls torch.jit.load() without
map_location, so on any machine without a CUDA GPU it crashes with
"Found no NVIDIA driver..." even when you explicitly ask for CPU. This
wrapper fixes that one line and is otherwise a thin, faithful copy of
the same preprocessing/inference the library already uses.

The 196MB checkpoint downloads once on first use (cached under
~/.cache/torch/hub/checkpoints/) and is reused after that.
"""

import threading

import cv2
import numpy as np
import torch
from PIL import Image
from simple_lama_inpainting.models.model import (
    LAMA_MODEL_URL,
    download_model,
    prepare_img_and_mask,
)

_model = None
_load_lock = threading.Lock()
_load_failed = False


def _load():
    global _model, _load_failed
    if _model is not None or _load_failed:
        return
    with _load_lock:
        if _model is not None or _load_failed:
            return
        try:
            model_path = download_model(LAMA_MODEL_URL)
            model = torch.jit.load(model_path, map_location="cpu")
            model.eval()
            model.to("cpu")
            _model = model
        except Exception:
            # If the model can't be downloaded/loaded (e.g. no internet on
            # first run in an offline environment), we fail closed and let
            # the caller fall back to classical inpainting instead of
            # crashing the whole request.
            _load_failed = True
            raise


def is_available() -> bool:
    """Cheap check the caller can use before deciding whether to fall back."""
    if _model is not None:
        return True
    if _load_failed:
        return False
    try:
        _load()
        return _model is not None
    except Exception:
        return False


def run_lama(bgr_image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Runs real LaMa inference. Input/output are BGR numpy arrays (same
    convention as the rest of cloud_ops.py) so this drops straight into
    reconstruct() there. Raises if the model isn't available — callers
    should check is_available() first or catch the exception.
    """
    _load()
    if _model is None:
        raise RuntimeError("LaMa model is not available")

    original_h, original_w = bgr_image.shape[:2]

    rgb = bgr_image[:, :, ::-1]
    pil_image = Image.fromarray(rgb)
    pil_mask = Image.fromarray(mask).convert("L")

    image_t, mask_t = prepare_img_and_mask(pil_image, pil_mask, "cpu")

    with torch.inference_mode():
        inpainted = _model(image_t, mask_t)
        result_rgb = inpainted[0].permute(1, 2, 0).detach().cpu().numpy()
        result_rgb = np.clip(result_rgb * 255, 0, 255).astype(np.uint8)

    result_bgr = result_rgb[:, :, ::-1]  # back to BGR

    # LaMa internally pads the input to a multiple of 8 before inference,
    # so the output can come back slightly larger than the original
    # (e.g. 300x300 -> 304x304). Crop/resize back to the exact original
    # size so callers always get consistent dimensions.
    if result_bgr.shape[:2] != (original_h, original_w):
        result_bgr = cv2.resize(
            result_bgr, (original_w, original_h), interpolation=cv2.INTER_AREA
        )

    return result_bgr