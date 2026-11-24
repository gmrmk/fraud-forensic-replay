# backend/generators/concordia/sim/embedder.py
"""bge-small-en-v1.5 as a Callable[[str], np.ndarray]. Concordia's associative
memory ranks by raw dot product, so we L2-normalize (verified fact #6)."""

from __future__ import annotations

import functools
from collections.abc import Callable

import numpy as np
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "BAAI/bge-small-en-v1.5"


@functools.cache
def _load_model() -> SentenceTransformer:
    # Loading the weights is the expensive part; cache it so repeated run_sim calls
    # in one process (e.g. a future --batch) do not reload per call.
    return SentenceTransformer(_MODEL_NAME)


def build_embedder() -> Callable[[str], np.ndarray]:
    model = _load_model()

    def embed(text: str) -> np.ndarray:
        v = model.encode(text, normalize_embeddings=True)
        return np.asarray(v, dtype=np.float32)

    return embed
