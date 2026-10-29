import pytest
from app.agents import claim

BIG = {"claims": [{"id": "c_1", "text": "Our beans are sourced directly from 40 partner farms", "source_doc": "Report", "page": 4}]}


def flagged(text):
    return [f.quoted_text for f in claim.run(text, BIG)]


@pytest.mark.parametrize("text", [
    "We are the best coffee in the world.",
    "We are the only roaster sourcing from 40 farms.",
    "The only coffee you will ever need.",
    "She is the one and only barista we trust.",
    "Every cup is guaranteed fresh.",
])
def test_real_claims_are_still_flagged(text):
    assert flagged(text), text


@pytest.mark.parametrize("text", [
    "Limited time only.",
    "Open Saturdays only.",
    "Available online only.",
    "Our best-in-class paradigm elevates your morning.",
    "Come say hello at the Saturday market.",
])
def test_promo_qualifiers_and_jargon_are_not_claims(text):
    assert flagged(text) == [], text


# Round 3: effects, comparisons, durations and completeness promises. These sentences were written for the tests,
# not taken from the independent evaluation set.
@pytest.mark.parametrize("text", [
    "This tea reduces anxiety within minutes.",
    "Our blend boosts your energy all day.",
    "It lasts three times longer than any other brand.",
    "Twice as smooth as the competition.",
    "Stays fresh for up to eight days.",
    "Offers everything you need to start your day.",
    "Brewed with all the care you need.",
])
def test_effect_comparison_duration_and_completeness_claims_are_flagged(text):
    assert flagged(text), text


@pytest.mark.parametrize("text", [
    "Brew it for three minutes.",
    "We reduced the size of our boxes.",
    "Stir for a few seconds and enjoy.",
    "Our team supports local schools.",
    "Come by after lunch; the door is open until five.",
])
def test_everyday_sentences_with_similar_words_are_not_flagged(text):
    assert flagged(text) == [], text
