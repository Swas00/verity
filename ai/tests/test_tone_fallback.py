import pytest
from app.agents import tone
from app.sample_brand import SAMPLE_BIG


@pytest.fixture(autouse=True)
def _basic_mode(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


def flags(text):
    f, info = tone.run(text, SAMPLE_BIG)
    assert info["mode"] == "fallback"
    return [(x.quoted_text, x.rule_id, x.confidence) for x in f]


def quotes(text):
    return [q for q, _, _ in flags(text)]


def test_a_shouted_sentence_is_one_finding_not_one_per_word():
    assert quotes("OUR COFFEE IS GREAT AND YOU WILL LOVE IT") == ["OUR COFFEE IS GREAT AND YOU WILL LOVE IT"]
    shouted = [x for x in flags("DON'T MISS OUT: our blend is back.") if x[1] == "r_voice_2"]
    assert [q for q, _, _ in shouted] == ["DON'T MISS OUT"]            # the pressure rule also fires; the MetaAgent merges them


def test_two_capital_words_and_acronyms_are_left_alone():
    assert quotes("BUY NOW and enjoy.") == []
    assert quotes("Read the FAQ and the PDF from the USA team.") == []
    assert quotes("A single FANTASTIC word.") == ["FANTASTIC"]          # one long all-caps word still counts


def test_urgency_and_pressure_phrases_are_flagged():
    for text, phrase in [("Act now while stocks last.", "Act now"), ("Don't miss out on spring.", "Don't miss out"),
                         ("Limited time only.", "Limited time only"), ("It is a once in a lifetime roast.", "once in a lifetime"),
                         ("Order before it's too late.", "before it's too late")]:
        assert phrase in quotes(text), text


def test_jargon_is_caught_in_its_inflected_forms():
    assert quotes("Leveraging our supply chain, we cut waste.")[0].startswith("Leveraging")
    assert quotes("We found new synergies.")[0].startswith("synergies")
    assert quotes("It is holistic and seamless.")


def test_best_ever_boasting_is_flagged():
    assert any("most amazing coffee ever made" in q for q in quotes("It is the most amazing coffee ever made."))


def test_corporate_boilerplate_is_advisory_not_a_violation():
    found = flags("We are proud to announce a new blend. We empower our baristas.")
    assert found and all(c < 0.6 for _, _, c in found)                       # shown, but below the 0.6 cutoff


def test_overlapping_matches_of_one_rule_keep_only_the_longer():
    f = tone.run("Leveraging synergistic roasting solutions is key.", SAMPLE_BIG)[0]
    assert len([x for x in f if x.rule_id == "r_voice_1"]) == 1


def test_exclamation_rules_are_unchanged_and_keep_their_punctuation():
    assert quotes("BUY NOW!!!") == ["!!!"]
    assert quotes("Our roasters pick every batch by hand!") == []
    assert quotes("Try it! Really! Truly!").count("!") == 2


def test_plain_warm_copy_is_not_flagged():
    for text in ["Our roasters taste every batch before it ships.", "Stop by on Saturday and tell us what you think.",
                 "We keep things simple: good beans, careful roasting."]:
        assert flags(text) == [], text


# Round 3: more everyday hype words (written for the test, not taken from the independent evaluation set).
import pytest as _pytest
from app.agents import tone as _tone


@_pytest.mark.parametrize("text", [
    "A groundbreaking blend for the new season.",
    "Our cutting-edge roaster arrived today.",
    "A life-changing cup of tea.",
    "This is a state-of-the-art brewing room.",
    "A once-in-a-lifetime harvest.",
])
def test_more_hype_words_are_flagged_by_basic_mode(text):
    findings = _tone.run(text, {"rules": []})
    findings = findings[0] if isinstance(findings, tuple) else findings
    assert findings, text
