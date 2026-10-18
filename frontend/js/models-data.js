/* Model catalogue, written from the actual inference service (ai-service/cloud_ops.py,
 * lama_model.py and main.py). The backend accepts exactly four model values:
 * GAN, Diffusion, LaMa, U-Net. Only LaMa is a trained neural network; the other
 * three are classical OpenCV inpainting variants that share a label with a neural
 * architecture. No benchmark numbers are shown because none are produced by the
 * service for real (non-synthetic) uploads. */

export const SELECTABLE_MODELS = [
  {
    id: 'LaMa',
    title: 'LaMa',
    kind: 'Pretrained neural network',
    status: 'Available',
    task: 'Cloud-region inpainting (large masks)',
    summary: 'Resolution-robust large-mask inpainting with Fourier convolutions (Suvorov et al., 2021).',
    detail: 'Runs the published pretrained LaMa checkpoint (trained on Places2, not on satellite imagery) on CPU. If the weights cannot be loaded, the service silently falls back to OpenCV Navier-Stokes inpainting and the result does not record that, so a "LaMa" result is not guaranteed to be neural.',
    neural: true,
  },
  {
    id: 'Diffusion',
    title: 'Diffusion (classical)',
    kind: 'Classical OpenCV inpainting',
    status: 'Available',
    task: 'Cloud-region inpainting',
    summary: 'Two passes of OpenCV Telea inpainting (radius 3, then 9).',
    detail: 'Not a diffusion neural network. The name is a label in the API; the algorithm is a deterministic fast-marching inpaint applied twice.',
    neural: false,
  },
  {
    id: 'GAN',
    title: 'GAN (classical)',
    kind: 'Classical OpenCV inpainting',
    status: 'Available',
    task: 'Cloud-region inpainting',
    summary: 'Single pass of OpenCV Telea inpainting (radius 9).',
    detail: 'Not a GAN. The name is a label in the API; the algorithm is a deterministic fast-marching inpaint with a large radius.',
    neural: false,
  },
  {
    id: 'U-Net',
    title: 'U-Net (classical)',
    kind: 'Classical OpenCV inpainting',
    status: 'Available',
    task: 'Cloud-region inpainting',
    summary: 'Single pass of OpenCV Telea inpainting (radius 3).',
    detail: 'Not a U-Net. The name is a label in the API; the algorithm is a deterministic fast-marching inpaint with a small radius.',
    neural: false,
  },
];

export function modelLabel(id) {
  const m = SELECTABLE_MODELS.find((x) => x.id === id);
  return m ? m.title : id || '—';
}

/* Architectures named on the public site that have no implementation in the service. */
export const NOT_IMPLEMENTED = [
  { title: 'Pix2Pix', task: 'Conditional GAN, cloudy-to-clean translation', note: 'Reference architecture (Isola et al.). No code or weights in the inference service.' },
  { title: 'CycleGAN', task: 'Unpaired image translation', note: 'Reference architecture. No code or weights in the inference service.' },
  { title: 'Trained diffusion model', task: 'Iterative denoising reconstruction', note: 'Reference approach (Ho et al.). The "Diffusion" option above is classical inpainting, not this.' },
  { title: 'U-Net segmentation', task: 'Pixel-wise cloud segmentation', note: 'Not implemented. Cloud masks come from a brightness/saturation threshold.' },
  { title: 'DeepLabV3+', task: 'Multi-scale cloud segmentation', note: 'Not implemented in the inference service.' },
  { title: 'Mask R-CNN', task: 'Instance-level cloud detection', note: 'Not implemented in the inference service.' },
  { title: 'Vision Transformer', task: 'Global-context cloud detection', note: 'Not implemented in the inference service.' },
];

export const CLOUD_DETECTION = {
  title: 'Cloud detection (all models)',
  text: 'Every run first builds a cloud mask with a simple heuristic: pixels that are bright (HSV value > 200) and low-saturation (< 40), cleaned with morphological open/close. It is not a trained segmentation model and can mistake bright snow, sand or buildings for cloud.',
};
