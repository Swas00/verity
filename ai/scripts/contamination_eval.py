"""Measures the cross-brand contamination detector on ai/eval/contamination.json.

Run: .venv/bin/python scripts/contamination_eval.py
Uses the two seeded brand guidelines (api/seed/*_big.json) and builds `other_brands` exactly as the API does.
Recall = planted texts where a flagged span overlaps the planted wording. False-flag rate = clean texts with any
brand finding. Misses and false flags are listed, not hidden."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ai"))
from app.agents import contamination  # noqa: E402

NAMES = {"lumina": "Lumina Coffee Co.", "northwind": "Northwind Tea Co."}


def load(brand: str) -> dict:
    return json.loads((ROOT / "api" / "seed" / f"{brand}_big.json").read_text())


def sibling(brand: str) -> dict:
    d = load(brand)
    return {"id": brand, "name": NAMES[brand],
            "terms": [{"id": g["id"], "approved": g["approved"]} for g in d["glossary"]],
            "claims": [{"id": c["id"], "text": c["text"]} for c in d["claims"]],
            "examples": d["tone_profile"]["do_examples"]}


def big_for(brand: str) -> dict:
    other = "northwind" if brand == "lumina" else "lumina"
    return {**load(brand), "brand_name": NAMES[brand], "other_brands": [sibling(other)]}


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "contamination.json"
    samples = json.loads((ROOT / "ai" / "eval" / name).read_text())["samples"]
    stats = {"planted": 0, "caught": 0, "clean": 0, "false": 0}
    by_kind: dict[str, list[int]] = {}
    misses, falses = [], []
    for s in samples:
        findings = contamination.run(s["text"], big_for(s["in"]))
        if s["planted"]:
            lo = s["text"].find(s["expect"])
            hit = any(f.span and f.span.start < lo + len(s["expect"]) and f.span.end > lo for f in findings)
            stats["planted"] += 1
            stats["caught"] += hit
            by_kind.setdefault(s["kind"], [0, 0])
            by_kind[s["kind"]][1] += 1
            by_kind[s["kind"]][0] += hit
            if not hit:
                misses.append(s)
        else:
            stats["clean"] += 1
            if findings:
                stats["false"] += 1
                falses.append((s, findings))
    print(f"Planted samples caught: {stats['caught']}/{stats['planted']} = {stats['caught'] / stats['planted']:.0%}")
    for kind, (c, n) in sorted(by_kind.items()):
        print(f"  {kind:8s} {c}/{n}")
    print(f"Clean samples wrongly flagged: {stats['false']}/{stats['clean']} = {stats['false'] / stats['clean']:.0%}")
    for s in misses:
        print(f"MISS   {s['id']} ({s['kind']}, in {s['in']}): {s['text']}")
    for s, fs in falses:
        print(f"FALSE  {s['id']} (in {s['in']}): {s['text']}  <- {[f.quoted_text for f in fs]}")


if __name__ == "__main__":
    main()
