"""ClaimGuard: finds claim-like sentences and checks them against the approved claims register.
Retrieval is BM25 plus weighted coverage with a numeric-conflict check (app/retrieval.py); embeddings can replace it later."""
import re
from ..models import Finding, Span
from ..retrieval import Retriever

# "best" is a claim on its own ("the best coffee") but not inside the compound "best-in-class", which is jargon for ToneGuard.
# "only" is a claim as an exclusivity statement ("the only roaster"), not as a promo qualifier ("Limited time only", "Online only").
# Percentages sit outside the \b group: there is no word boundary between "%" and a following space.
# Four more families of claim need support whatever the product: a health or performance effect ("lowers blood pressure"),
# a comparison ("twice as strong", "than any other brand", "than the industry average"), a stated duration ("for up to six
# hours", "for a full year") and a promise of completeness ("everything you need"). They were added in Round 3 after an
# independent test set (ai/eval/heldout2.json) showed that only the keyword patterns above were being examined.
_EFFECT = (r"(?:lowers?|reduces?|cures?|prevents?|treats?|boosts?|improves?|increases?|supports?)\s+(?:your\s+|the\s+)?"
           r"(?:blood pressure|cholesterol|stress|anxiety|focus|energy|memory|metabolism|immunity|immune system|sleep|risk|"
           r"inflammation|weight|digestion|concentration|mood)")
_COMPARISON = (r"(?:(?:twice|thrice|double|triple|\d+x|\d+\s?times)\s+as\s+\w+|than\s+(?:any|all|every)\s+(?:other|competitor|rival|brand)\w*|"
               r"than\s+the\s+(?:regional|industry|market|national|global)\s+average)")
_DURATION = (r"for\s+(?:up\s+to\s+)?(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|\d+)(?:\s+(?:full|entire))?"
             r"\s+(?:hours?|days?|weeks?|months?|years?)")
_COMPLETE = r"(?:everything|all\s+(?:the\s+)?\w+(?:\s+\w+)?)\s+you\s+(?:will\s+)?need"
CLAIM_PATTERNS = re.compile(
    r"\b(best(?![-\u2011])|#1|number one|leading|market-leading|best in class|guarantee[ds]?|proven|the only|one and only|"
    r"\d+\s?(hours?|days?|farms?)|compostable|sustainable|organic)\b|\d+(\.\d+)?\s?%|"
    rf"\b(?:{_EFFECT}|{_COMPARISON}|{_DURATION}|{_COMPLETE})\b", re.IGNORECASE)


def _sentences(text: str):
    for m in re.finditer(r"[^.!?]+[.!?]*", text):
        s = m.group(0)
        if s.strip():
            lead = len(s) - len(s.lstrip())
            yield m.start() + lead, s.strip()


SUPPORTED = 0.75   # coverage of an approved claim needed to count as supported
PARTIAL = 0.35     # below this we say no claim supports the statement at all


def run(text: str, big: dict, support_threshold: float = SUPPORTED) -> list[Finding]:
    retriever = Retriever(big.get("claims", []))
    findings = []
    for start, sent in _sentences(text):
        if not CLAIM_PATTERNS.search(sent):
            continue
        top = retriever.search(sent, k=1)
        m = top[0] if top else None
        # A number mismatch only matters when the sentence is really about that claim.
        conflict = m.conflict if m and m.coverage >= PARTIAL else None
        if m and m.coverage >= support_threshold and not conflict:
            continue  # supported by an approved claim
        claim = m.claim if m and m.coverage >= PARTIAL else None
        quote = sent.rstrip(" .!?") or sent
        if claim and conflict:
            why, conf = (f"Conflicts with approved claim {claim['id']} ('{claim['text']}'): the numbers differ ({conflict}).", 0.9)
        elif claim:
            why, conf = (f"Only partially matches approved claim {claim['id']} ('{claim['text']}'), about {round(m.coverage * 100)}% overlap.", 0.65)
        else:
            why, conf = ("No approved claim supports this statement.", 0.85)
        findings.append(Finding(
            agent="claim", rule_id="r_claim_1", clause_citation="Claims §3.1",
            span=Span(start=start, end=start + len(quote)), quoted_text=quote,
            confidence=conf, severity="high", explanation=why,
            suggestion=(f"Use approved wording: \"{claim['text']}\"" if claim else
                        "Remove the claim or have Legal add it to the approved claims register."),
            replacement=(claim["text"] if claim else None),
            source_ref=(f"{claim['id']} · {claim['source_doc']} p.{claim.get('page')}" if claim else None)))
    return findings
