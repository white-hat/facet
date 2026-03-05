"""
Embedding serialization utilities for Facet.

Convert between numpy arrays and bytes for database storage.
"""

import numpy as np


def embedding_to_bytes(embedding):
    """
    Convert numpy embedding array to bytes for database storage.

    Args:
        embedding: Numpy array (typically 512-dim float32 for faces,
                  768-dim float32 for CLIP)

    Returns:
        bytes: Binary representation of the embedding
    """
    if embedding is None:
        return None
    return embedding.astype(np.float32).tobytes()


def bytes_to_embedding(data, dim=None):
    """
    Convert bytes back to numpy embedding array.

    Args:
        data: Binary embedding data
        dim: Expected dimension (512 for faces, 768 for CLIP). If provided,
             validates the dimension and returns None on mismatch.

    Returns:
        numpy.ndarray: Float32 embedding array, or None if invalid
    """
    if data is None:
        return None

    embedding = np.frombuffer(data, dtype=np.float32)

    if dim is not None and len(embedding) != dim:
        return None

    return embedding


def bytes_to_normalized_embedding(data, dim=None):
    """Convert bytes to a unit-normalized numpy embedding array.

    Returns:
        numpy.ndarray: L2-normalized float32 embedding, or None if invalid/zero-norm
    """
    embedding = bytes_to_embedding(data, dim)
    if embedding is None:
        return None
    embedding = embedding.copy()
    norm = np.linalg.norm(embedding)
    if norm < 1e-10:
        return None
    return embedding / norm
