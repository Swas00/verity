"""Precision/recall per agent on the annotated sets: dev (eval/dataset.json) and held-out (eval/heldout.json).
Run: .venv/bin/python scripts/eval.py [dev] [heldout]
The held-out set was written before the Tier 1 agent changes and is never used to tune a rule or lexicon.
Runs whatever mode is configured (basic mode unless ANTHROPIC_API_KEY + MODEL_FAST are set) and says which."""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.pipeline import review  # noqa: E402
from app.sample_brand import SAMPLE_BIG  # noqa: E402

EVAL_DIR = os.path.join(os.path.dirname(__file__), "..", "eval")
SETS = {"dev": "dataset.json", "heldout": "heldout.json"}
overlap = lambda a, b: a.lower() in b.lower() or b.lower() in a.lower()  # noqa: E731


def run_set(name):
    data = json.load(open(os.path.join(EVAL_DIR, SETS.get(name, name + ".json"))))
    tp, fp, fn, modes = {}, {}, {}, set()
    for item in data:
        res = asyncio.run(review(item["text"], SAMPLE_BIG))
        modes |= {a["mode"] for a in res["agents"] if a["agent"] == "tone"}
        pred = [(f["agent"], f["quoted_text"]) for h in res["highlights"] for f in h["findings"]]
        exp = [(e["agent"], e["quote"]) for e in item["expected"]]
        for ag, q in pred:
            hit = any(a == ag and overlap(q, eq) for a, eq in exp)
            (tp if hit else fp)[ag] = (tp if hit else fp).get(ag, 0) + 1
        for ag, eq in exp:
            if not any(a == ag and overlap(q, eq) for a, q in pred):
                fn[ag] = fn.get(ag, 0) + 1
    print(f"\n[{name}] {len(data)} annotated texts · ToneGuard mode: {', '.join(sorted(modes))}")
    print(f"{'agent':<8}{'precision':>10}{'recall':>8}{'TP':>5}{'FP':>5}{'FN':>5}")
    for ag in ("term", "claim", "tone"):
        t, f, n = tp.get(ag, 0), fp.get(ag, 0), fn.get(ag, 0)
        print(f"{ag:<8}{(t / (t + f) if t + f else 1):>10.2f}{(t / (t + n) if t + n else 1):>8.2f}{t:>5}{f:>5}{n:>5}")


chosen = sys.argv[1:] or list(SETS)
for name in chosen:
    run_set(name)
