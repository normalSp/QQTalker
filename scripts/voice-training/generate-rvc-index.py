import argparse
import os
from pathlib import Path

import faiss
import numpy as np
from sklearn.cluster import MiniBatchKMeans


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate FAISS index for RVC experiment features.")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--exp", required=True)
    parser.add_argument("--version", choices=["v1", "v2"], default="v2")
    args = parser.parse_args()

    exp_dir = Path(args.project_root) / "logs" / args.exp
    feature_dir = exp_dir / ("3_feature256" if args.version == "v1" else "3_feature768")
    if not feature_dir.exists():
        raise FileNotFoundError(f"Feature directory not found: {feature_dir}")

    feature_files = sorted(feature_dir.glob("*.npy"))
    if not feature_files:
        raise FileNotFoundError(f"No feature files found in: {feature_dir}")

    npys = [np.load(file) for file in feature_files]
    big_npy = np.concatenate(npys, axis=0)
    rng = np.random.default_rng(1234)
    rng.shuffle(big_npy, axis=0)

    if big_npy.shape[0] > 200000:
        batch_size = 256 * max(1, os.cpu_count() or 1)
        big_npy = MiniBatchKMeans(
            n_clusters=10000,
            verbose=True,
            batch_size=batch_size,
            compute_labels=False,
            init="random",
        ).fit(big_npy).cluster_centers_

    np.save(exp_dir / "total_fea.npy", big_npy)
    n_ivf = min(int(16 * np.sqrt(big_npy.shape[0])), big_npy.shape[0] // 39)
    dim = 256 if args.version == "v1" else 768
    index = faiss.index_factory(dim, f"IVF{n_ivf},Flat")
    index_ivf = faiss.extract_index_ivf(index)
    index_ivf.nprobe = 1
    index.train(big_npy)

    trained_path = exp_dir / f"trained_IVF{n_ivf}_Flat_nprobe_{index_ivf.nprobe}_{args.exp}_{args.version}.index"
    added_path = exp_dir / f"added_IVF{n_ivf}_Flat_nprobe_{index_ivf.nprobe}_{args.exp}_{args.version}.index"
    faiss.write_index(index, str(trained_path))

    batch_size_add = 8192
    for i in range(0, big_npy.shape[0], batch_size_add):
        index.add(big_npy[i : i + batch_size_add])
    faiss.write_index(index, str(added_path))

    print(f"trained_index={trained_path}")
    print(f"added_index={added_path}")


if __name__ == "__main__":
    main()
