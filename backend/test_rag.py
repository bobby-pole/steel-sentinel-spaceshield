"""
test_rag.py
===========
Weryfikuje pipeline RAG:  Ollama embed → ChromaDB query → scoring → Bielik generate.
Uruchom po zbudowaniu bazy:  uv run python test_rag.py
"""

import sys
import httpx
import chromadb

OLLAMA_URL      = "http://localhost:11434"
EMBED_MODEL     = "bge-m3"
GEN_MODEL       = "SpeakLeash/bielik-minitron-7B-v3.0-instruct:Q4_K_M"
CHROMA_DIR      = "./chroma"
COLLECTION_NAME = "steelsentinel"

# Zapytania testowe: (pytanie, oczekiwane słowo kluczowe w wyniku)
TEST_QUERIES = [
    ("szpital zasilanie elektryczne",       "szpital"),
    ("procedury ewakuacji ludności",        "ewakuac"),
    ("przepompownia wody Stalowa Wola",     "wody"),
    ("zasady użycia siły ROE",              "AJP"),
    ("dron UAV rozpoznanie",                "dron"),
]

ok = True

# ---------------------------------------------------------------------------
print("=== Test RAG — Steel Sentinel ===\n")

# 1. Test Ollama embedding
print("1. Test embeddingu (mxbai-embed-large)…")
try:
    resp = httpx.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": EMBED_MODEL, "input": "test połączenia"},
        timeout=30,
    )
    resp.raise_for_status()
    embedding = resp.json()["embeddings"][0]
    print(f"   OK — wektor {len(embedding)} wymiarów")
except Exception as e:
    print(f"   BŁĄD: {e}")
    sys.exit(1)

# 2. Test ChromaDB
print("\n2. Test ChromaDB…")
try:
    client = chromadb.PersistentClient(path=CHROMA_DIR)
    col    = client.get_collection(COLLECTION_NAME)
    total  = col.count()
    print(f"   OK — kolekcja '{COLLECTION_NAME}', {total} dokumentów")
    if total == 0:
        print("   UWAGA: baza jest pusta — uruchom najpierw build_rag.py")
        sys.exit(1)
except Exception as e:
    print(f"   BŁĄD: {e}")
    print("   Uruchom najpierw:  uv run python build_rag.py")
    sys.exit(1)

# 3. Statystyki źródeł
print("\n3. Statystyki indeksu…")
meta_result = col.get(include=["metadatas"])
sources: dict[str, int] = {}
for m in meta_result["metadatas"]:
    src = m.get("source", "?")
    sources[src] = sources.get(src, 0) + 1
for src, cnt in sorted(sources.items(), key=lambda x: -x[1])[:10]:
    print(f"   {cnt:5d}  {src}")

# 4. Test wyszukiwania z scoringiem
print("\n4. Test wyszukiwania semantycznego…")
all_passed = True
for question, keyword in TEST_QUERIES:
    q_resp = httpx.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": EMBED_MODEL, "input": question},
        timeout=30,
    )
    q_resp.raise_for_status()
    q_vec = q_resp.json()["embeddings"][0]

    results = col.query(
        query_embeddings=[q_vec],
        n_results=3,
        include=["documents", "metadatas", "distances"],
    )

    docs      = results["documents"][0]
    metas     = results["metadatas"][0]
    distances = results["distances"][0]

    top_doc   = docs[0]
    top_score = round(1 - distances[0] / 2, 3)   # cosine dist ∈ [0,2]
    top_src   = metas[0].get("source", "?")
    found     = keyword.lower() in top_doc.lower() or keyword.lower() in top_src.lower()

    status = "✓" if found else "?"
    if not found:
        all_passed = False

    print(f"\n   {status} [{top_score:.3f}]  Q: '{question}'")
    print(f"       Źródło: {top_src}")
    print(f"       Fragment: {top_doc[:120].strip()}…")

    if not found:
        print(f"       UWAGA: oczekiwane słowo '{keyword}' nie znaleziono w top-1")

if all_passed:
    print("\n   Wszystkie zapytania znalazły dopasowanie.")
else:
    print("\n   Część zapytań nie znalazła słowa kluczowego w top-1 — może warto sprawdzić jakość embeddingów.")
    ok = False

# 5. Test generowania (opcjonalny)
print("\n5. Test generowania odpowiedzi (Bielik)…")
try:
    # Pobierz kontekst dla konkretnego pytania
    ctx_resp = httpx.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": EMBED_MODEL, "input": "procedury ewakuacji"},
        timeout=30,
    )
    ctx_resp.raise_for_status()
    ctx_vec = ctx_resp.json()["embeddings"][0]

    ctx_results = col.query(query_embeddings=[ctx_vec], n_results=3, include=["documents", "metadatas"])
    context = "\n\n---\n\n".join(
        f"[{m.get('source','?')}]: {d[:400]}"
        for d, m in zip(ctx_results["documents"][0], ctx_results["metadatas"][0])
    )

    prompt = (
        "Na podstawie poniższego kontekstu odpowiedz zwięźle na pytanie.\n\n"
        f"KONTEKST:\n{context}\n\n"
        "PYTANIE: Jakie są procedury ewakuacji?\n\n"
        "ODPOWIEDŹ:"
    )

    gen_resp = httpx.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": GEN_MODEL, "prompt": prompt, "stream": False},
        timeout=120,
    )
    gen_resp.raise_for_status()
    answer = gen_resp.json().get("response", "").strip()
    print(f"   OK — odpowiedź ({len(answer)} znaków):")
    print(f"   {answer[:300]}{'…' if len(answer) > 300 else ''}")
except Exception as e:
    print(f"   POMINIĘTO (model generacji niedostępny): {e}")

# ---------------------------------------------------------------------------
print("\n" + ("=== RAG działa poprawnie ===" if ok else "=== RAG zbudowany, ale wyniki wymagają uwagi ==="))
