"""Calcula el mapa de embeddings de /ai y escribe Assets/js/embeddings.js.

Uso (desde la raíz del repositorio):
    python -m venv .venv-emb
    .venv-emb/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
    .venv-emb/bin/pip install -r scripts/embeddings/requirements.txt
    .venv-emb/bin/python scripts/embeddings/calcular.py

Qué hace:
1. Embebe cada proyecto ("passage: ...") y cada consulta ("query: ...") con
   multilingual-e5-small, con los prefijos que pide el modelo, y normaliza.
2. Similitud = coseno real en 384 dimensiones. Es la puntuación que enseña la web.
3. Posición en el mapa = PCA a 2D ajustada solo con los proyectos; las consultas
   se proyectan con la misma PCA. El mapa es una aproximación: puede que un
   proyecto cercano por coseno no parezca el más cercano en 2D.
"""
import json
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

RAIZ = Path(__file__).resolve().parents[2]
ENTRADA = RAIZ / "scripts/embeddings/textos.json"
SALIDA = RAIZ / "Assets/js/embeddings.js"
# Caja del viewBox 520x340 de ai/index.html donde caen los puntos (deja sitio a etiquetas).
X0, X1, Y0, Y1 = 70, 450, 50, 290


def main():
    t = json.loads(ENTRADA.read_text(encoding="utf-8"))
    modelo = SentenceTransformer(t["modelo"], device="cpu")
    pid, ptxt = zip(*t["proyectos"].items())
    qid, qtxt = zip(*t["consultas"].items())
    P = modelo.encode([f"passage: {x}" for x in ptxt], normalize_embeddings=True)
    Q = modelo.encode([f"query: {x}" for x in qtxt], normalize_embeddings=True)

    sim = Q @ P.T  # coseno (vectores normalizados)

    media = P.mean(axis=0)
    _, s, vt = np.linalg.svd(P - media, full_matrices=False)
    comp = vt[:2]
    varianza = (s[:2] ** 2).sum() / (s ** 2).sum()
    p2, q2 = (P - media) @ comp.T, (Q - media) @ comp.T

    # Escala común a proyectos y consultas, misma escala en x e y (no deforma distancias).
    todo = np.vstack([p2, q2])
    lo, hi = todo.min(axis=0), todo.max(axis=0)
    esc = min((X1 - X0) / (hi[0] - lo[0]), (Y1 - Y0) / (hi[1] - lo[1]))
    centro = np.array([(X0 + X1) / 2, (Y0 + Y1) / 2])
    mitad = (lo + hi) / 2
    a2d = lambda v: [round(float(c), 1) for c in centro + (v - mitad) * esc]

    datos = {
        "modelo": t["modelo"],
        "dim": int(P.shape[1]),
        "varianza2d": round(float(varianza), 3),
        "proyectos": {k: a2d(v) for k, v in zip(pid, p2)},
        "consultas": {k: a2d(v) for k, v in zip(qid, q2)},
        "sim": {q: {p: round(float(sim[i, j]), 3) for j, p in enumerate(pid)} for i, q in enumerate(qid)},
    }
    SALIDA.write_text(
        "// Generado por scripts/embeddings/calcular.py — no editar a mano.\n"
        f"window.EMB = {json.dumps(datos, ensure_ascii=False, indent=1)};\n",
        encoding="utf-8",
    )
    print(f"escrito {SALIDA.relative_to(RAIZ)} · varianza explicada por 2D: {varianza:.0%}")
    for i, q in enumerate(qid):
        orden = np.argsort(-sim[i])
        print(f"  {q:6} → " + ", ".join(f"{pid[j]} {sim[i, j]:.3f}" for j in orden[:4]))


if __name__ == "__main__":
    main()
