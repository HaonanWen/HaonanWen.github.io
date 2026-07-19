---
layout: blog_post
title: "Under-Cali: Online Forecasting for Irregular Time Series via Uncertainty-Driven Calibration"
date: 2026-07-18
tag: "Research Note"
summary: "A concise walkthrough of Under-Cali, a lightweight uncertainty-driven calibration framework for online irregular multivariate time series forecasting."
permalink: /blog/under-cali/
---

**Authors:** Haonan Wen, Hanyang Chen, Songhe Feng  
**Affiliation:** Beijing Jiaotong University  
**Conference:** KDD 2026  
**Links:** [Paper](https://arxiv.org/abs/2607.12345) · [Code](https://github.com/HaonanWen/Under-Cali)

---

## TL;DR

We introduce **Under-Cali**, a lightweight plug-in framework for **online irregular multivariate time series (IMTS) forecasting**. Instead of fine-tuning the whole forecaster online, Under-Cali attaches a small, model-agnostic calibration module. It estimates prediction uncertainty, routes each sample to one of two calibration experts, and decides adaptively when to update. Experiments across four IMTS benchmarks and 21+ backbones show consistent MSE/MAE improvements, often large on datasets with strong distribution shift.

---

## Motivation

Real-world time series are often **irregularly sampled**: ICU monitors fire at uneven intervals, weather stations miss readings, and motion-capture sensors drop frames. Offline IMTS forecasters handle this reasonably well at training time, but once deployed their weights are frozen. When the data distribution drifts—new patients, sensor changes, climate anomalies—performance degrades.

<img src="{{ '/assets/blog/under-cali/human_activity_shift.png' | relative_url }}" alt="Train-test distribution shifts in Human Activity and USHCN." width="620" />
*Figure 1: Train-test distribution shifts in the Human Activity dataset; similar drift is observed in USHCN.*

Online learning is a natural fix, but most existing methods assume **regular time series** with dense continuity and periodicity. Those signals are exactly what IMTS lacks. So we ask: *How can we adapt an IMTS forecaster online without relying on periodicity?*

Our answer: **use forecasting uncertainty as the control signal.** If the model’s predicted error is high, the sample likely comes from an unfamiliar distribution and needs careful handling. If the error is low, the sample is familiar and can be used for stable updates.

---

## Our Approach: Under-Cali

Under-Cali wraps around any pretrained IMTS forecaster and adds three lightweight components:

<img src="{{ '/assets/blog/under-cali/framework.png' | relative_url }}" alt="Under-Cali framework overview." />
*Figure 2: Overview of Under-Cali. Each incoming batch is first calibrated by the reliable expert; uncertainty scores then route high-uncertainty samples to the unreliable expert, and the adaptive routing module decides when to update each component.*

### 1. Uncertainty Estimator (UE)

We train a small network to predict the **normalized prediction error** of the current forecaster from the input series and its prediction. Importantly, the UE is *not* used to refine the forecast directly; it only provides a control signal for routing and adaptation.

### 2. Dual-Expert Gated Distribution Calibrator (GDC)

Instead of a single calibration network, we maintain two isolated experts:

- **Reliable expert** calibrates low-uncertainty samples with fine-grained adjustments.
- **Unreliable expert** handles high-uncertainty samples more cautiously, preventing them from corrupting the stable calibration path.

Each expert has an input calibrator (before the frozen forecaster) and an output calibrator (after it). Both are initialized near the identity mapping, so Under-Cali preserves the source model’s behavior until distribution shifts force a meaningful change.

### 3. Adaptive Routing Module (ARM)

The ARM uses two moving thresholds derived from online uncertainty statistics:

- **Allocation threshold** routes each sample to the reliable or unreliable expert.
- **Trigger threshold** decides whether the current batch is unusual enough to warrant an update at all.

This avoids blind, every-batch updates that amplify gradient noise, while still reacting promptly to real distribution shifts.

---

## Key Results

### Main results across 21+ backbones and 4 datasets

We evaluate Under-Cali on **MIMIC**, **PhysioNet**, **Human Activity**, and **USHCN**, covering healthcare, biomechanics, and climate. The framework is applied on top of 9 regular-TS and 12 IMTS forecasters.

Notable MSE reductions (selected):

| Backbone | Dataset | MSE w/o Under-Cali | MSE + Under-Cali | Relative gain |
|---|---|---|---|---|
| mTAN | MIMIC | 1.2596 | **0.8809** | −30.1% |
| Warpformer | Human Activity | 0.3942 | **0.3081** | −21.8% |
| tPatchGNN | Human Activity | 0.1378 | **0.1262** | −8.4% |
| Crossformer | USHCN | 0.5591 | **0.5153** | −7.8% |
| GraFITi | USHCN | 0.5893 | **0.5546** | −5.9% |
| HyperIMTS | MIMIC | 0.5568 | **0.5457** | −2.0% |

Improvements hold for both classic IMTS models (mTAN, GRU-D, Warpformer, GraFITi, HyperIMTS) and regular-TS architectures adapted to IMTS (iTransformer, PatchTST, FEDformer, etc.).

### Why each component matters

An ablation on tPatchGNN confirms that removing any core mechanism hurts performance:

| Variant | MIMIC | PhysioNet | Human Activity | USHCN |
|---|---|---|---|---|
| w/o GDC (single expert, joint) | 0.4902 | 0.3070 | 0.1294 | 0.4549 |
| w/o ARM (random triggering) | 0.4915 | 0.3077 | 0.1371 | 0.4577 |
| w/o ARM (random allocating) | 0.4909 | 0.3069 | 0.1269 | 0.4567 |
| **Under-Cali** | **0.4872** | **0.3066** | **0.1262** | **0.4538** |

The dual-expert design is especially important: about **45% of batches exhibit gradient conflicts** between reliable and unreliable samples, which the isolated experts mitigate.

<img src="{{ '/assets/blog/under-cali/dual_experts_p12.png' | relative_url }}" alt="t-SNE visualization of samples routed to the two experts on PhysioNet." width="620" />
*Figure 3: t-SNE visualization of samples allocated to the reliable (blue) and unreliable (orange) experts on PhysioNet. The two experts clearly separate different data regions.*

### Comparison with online and test-time adaptation methods

We compare with OneNet, FSNet, D3A, and TAFAS. Plugging Under-Cali into OneNet and FSNet gives the best results; transferring regular-TS methods such as D3A and TAFAS to IMTS can actually hurt performance on HyperIMTS.

| Setting | Human Activity MSE | USHCN MSE |
|---|---|---|
| OneNet | 0.3360 | 0.7390 |
| OneNet + online | 0.3151 | 0.7130 |
| **OneNet + Under-Cali** | **0.2780** | **0.5910** |

| Setting | Human Activity MSE | USHCN MSE |
|---|---|---|
| HyperIMTS | 0.0818 | 0.3809 |
| HyperIMTS + D3A | 0.2362 | 0.4418 |
| HyperIMTS + TAFAS | 0.2505 | 0.6376 |
| **HyperIMTS + Under-Cali** | **0.0813** | **0.3754** |

### Efficiency and robustness

- **GPU footprint:** Only a marginal increase over the base model.
- **Inference latency:** Batch-level latency stays within roughly 0.1–0.4 s for common backbones.
- **Uncertainty consistency:** UE outputs track the true prediction-error trend well.

<img src="{{ '/assets/blog/under-cali/uncertainty_humanactivity.png' | relative_url }}" alt="Uncertainty estimator outputs vs. ground-truth prediction errors on Human Activity." width="620" />
*Figure 4: Estimated uncertainty scores (blue) closely follow the ground-truth prediction errors (orange) on Human Activity, validating the UE as a reliable control signal.*

- **Noisy UE:** Even when Gaussian noise is injected into UE outputs, performance re-stabilizes within 1–2 batches.
- **Long horizons and varying lookbacks:** Under-Cali remains robust across different history lengths and forecast horizons, with particularly strong stability on extended horizons.

---

## Takeaway

Online adaptation for irregular time series cannot rely on the periodicity and temporal continuity that regular-TS methods take for granted. Under-Cali shows that **prediction uncertainty is a sufficient and practical signal** for routing, calibration, and sparse online updates. By keeping the source forecaster frozen and updating only a small dual-expert calibrator, it achieves broad compatibility, stable adaptation, and clear forecasting gains across diverse IMTS benchmarks.

If you work with irregularly sampled sensors, clinical signals, or climate stations that drift after deployment, Under-Cali offers a plug-and-play way to keep your forecaster calibrated online.
