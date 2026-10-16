# Generates engine/fixtures/*.json. Edit the specs here, then run:
#   python3 engine/scripts/make-fixtures.py engine/fixtures
import copy, json, os, sys
out = sys.argv[1]

NUMERIC = {
  "specVersion": 1,
  "question": "Will the BTC-USD daily close on 2027-06-30 be above $100,000?",
  "shortDescription": "Tracks whether Bitcoin closes above $100,000 on 30 June 2027.",
  "outcomes": [
    {"id": "yes", "name": "Yes", "winCondition": "The BTC-USD daily close for 2027-06-30 is above $100,000."},
    {"id": "no", "name": "No", "winCondition": "The BTC-USD daily close for 2027-06-30 is $100,000 or lower, or no close is published."}
  ],
  "timing": {
    "tradingStartUTC": "2027-01-01T00:00:00Z",
    "tradingCutoffUTC": "2027-06-30T00:00:00Z",
    "observationStartUTC": "2027-06-30T00:00:00Z",
    "observationEndUTC": "2027-06-30T23:59:59Z",
    "dataDeadlineUTC": "2027-07-01T23:59:59Z"
  },
  "sources": [
    {"id": "coinbase", "description": "Coinbase Exchange BTC-USD daily candles", "url": "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400", "access": "public", "extraction": "Close price of the 2027-06-30 UTC daily candle"},
    {"id": "kraken", "description": "Kraken XBT/USD daily OHLC", "url": "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440", "access": "public", "extraction": "Close price of the 2027-06-30 UTC daily candle"}
  ],
  "sourcePrecedence": ["coinbase", "kraken"],
  "predicate": {
    "kind": "numeric_threshold",
    "metric": "BTC-USD close",
    "unit": "USD",
    "observation": "value_at_end",
    "bands": [
      {"outcomeId": "yes", "min": {"value": 100000, "inclusive": False}},
      {"outcomeId": "no", "max": {"value": 100000, "inclusive": True}}
    ]
  },
  "edgeCases": [
    {"id": "no-close", "kind": "source_unavailable", "scenario": "Neither Coinbase nor Kraken publishes a 2027-06-30 close within 24 hours of the window closing", "resolvesTo": "no"}
  ]
}

CATEGORICAL = {
  "specVersion": 1,
  "question": "Which artist will have the #1 song on the Billboard Hot 100 chart dated 2027-01-02?",
  "shortDescription": "Tracks the first Billboard Hot 100 number one of 2027.",
  "outcomes": [
    {"id": "taylor-swift", "name": "Taylor Swift", "winCondition": "Taylor Swift is the lead artist of the #1 song."},
    {"id": "drake", "name": "Drake", "winCondition": "Drake is the lead artist of the #1 song."},
    {"id": "sabrina-carpenter", "name": "Sabrina Carpenter", "winCondition": "Sabrina Carpenter is the lead artist of the #1 song."},
    {"id": "other", "name": "Other / None", "winCondition": "Any other lead artist has the #1 song, or no chart is published.", "catchAll": True}
  ],
  "timing": {
    "tradingStartUTC": "2026-12-01T00:00:00Z",
    "tradingCutoffUTC": "2026-12-29T00:00:00Z",
    "observationStartUTC": "2026-12-29T00:00:00Z",
    "observationEndUTC": "2026-12-31T23:59:59Z",
    "dataDeadlineUTC": "2026-12-31T23:59:59Z"
  },
  "sources": [
    {"id": "billboard", "description": "Billboard Hot 100 chart page", "url": "https://www.billboard.com/charts/hot-100/2027-01-02/", "access": "public", "extraction": "Lead artist of the song at position 1"}
  ],
  "sourcePrecedence": ["billboard"],
  "predicate": {
    "kind": "categorical",
    "closedSet": False,
    "cases": [
      {"outcomeId": "taylor-swift", "matches": "Taylor Swift"},
      {"outcomeId": "drake", "matches": "Drake"},
      {"outcomeId": "sabrina-carpenter", "matches": "Sabrina Carpenter"}
    ]
  },
  "edgeCases": [
    {"id": "no-chart", "kind": "source_unavailable", "scenario": "Billboard does not publish the 2027-01-02 chart by 2026-12-31T23:59:59Z", "resolvesTo": "other"},
    {"id": "featured", "kind": "other", "scenario": "A listed artist appears only as a featured artist on the #1 song", "resolvesTo": "other"}
  ]
}

JUDGMENTS = ["judgment.objective_source", "judgment.manipulation_resistant", "judgment.atomic_claims"]

fixtures = []
def fx(id, description, base, mutate=None, ported=None, attest=JUDGMENTS, attest_fail=None, expected=None):
    spec = copy.deepcopy(base)
    if mutate: mutate(spec)
    fixtures.append({
        "id": id,
        "description": description,
        "portedFrom": ported,
        "spec": spec,
        "attest": attest,
        **({"attestFail": attest_fail} if attest_fail else {}),
        "expected": expected,
    })

fx("clean-numeric", "Threshold market with a strict/inclusive boundary pair, two public sources, and a source-unavailable fallback.",
   NUMERIC, ported="eval/fixtures/numerical-date/clean-baseline.json",
   expected={"decision": "accept", "failedChecks": []})

fx("clean-categorical", "Open-set categorical market with a catch-all outcome.",
   CATEGORICAL, ported="eval/fixtures/ambiguity/clean-baseline.json",
   expected={"decision": "accept", "failedChecks": []})

fx("judgments-missing", "A spec that passes every deterministic check is still incomplete until reviewers attest the judgment items.",
   NUMERIC, attest=[],
   expected={"decision": "incomplete", "failedChecks": [], "missingIncludes": "judgment.manipulation_resistant"})

def overlap(s):
    s["predicate"]["bands"][0]["min"]["inclusive"] = True
fx("overlapping-outcomes", "Both bands include exactly $100,000.", NUMERIC, overlap,
   ported="eval/fixtures/ambiguity/overlapping-outcomes.json",
   expected={"decision": "blocked", "failedChecks": ["predicate.partition"], "blockingIncludes": "At exactly BTC-USD close = 100000 USD both No and Yes win"})

def gap(s):
    s["predicate"]["bands"][1]["max"]["value"] = 90000
fx("missing-outcome", "Values between $90,000 and $100,000 match no outcome.", NUMERIC, gap,
   ported="eval/fixtures/ambiguity/missing-outcome.json",
   expected={"decision": "blocked", "failedChecks": ["predicate.partition"], "blockingIncludes": "At BTC-USD close = 95000 USD no outcome wins"})

def boundary_gap(s):
    s["predicate"]["bands"][1]["max"]["inclusive"] = False
fx("boundary-excluded", "Neither band includes exactly $100,000.", NUMERIC, boundary_gap,
   ported=None,
   expected={"decision": "blocked", "failedChecks": ["predicate.partition"], "blockingIncludes": "At exactly BTC-USD close = 100000 USD no outcome wins"})

def late_cutoff(s):
    s["timing"]["tradingCutoffUTC"] = "2027-07-01T00:00:00Z"
fx("trading-after-observation", "Trading stays open after the settling close is known.", NUMERIC, late_cutoff,
   ported=None,
   expected={"decision": "blocked", "failedChecks": ["timing.order"], "blockingIncludes": "traders can buy the known winner"})

def early_deadline(s):
    s["timing"]["dataDeadlineUTC"] = "2027-06-30T12:00:00Z"
fx("deadline-before-observation-end", "The outage fallback could fire while the settling close can still be observed.", NUMERIC, early_deadline,
   expected={"decision": "blocked", "failedChecks": ["timing.order"], "blockingIncludes": "outage fallback could settle the market"})

def no_tz(s):
    s["timing"]["observationEndUTC"] = "2027-06-30T23:59:59"
fx("missing-timezone", "Observation end has no timezone designator.", NUMERIC, no_tz,
   ported="eval/fixtures/numerical-date/missing-timezone.json",
   expected={"decision": "blocked", "failedChecks": ["timing.order"]})

def bad_date(s):
    s["timing"]["tradingStartUTC"] = "2027-02-30T00:00:00Z"
fx("invalid-date", "February 30 does not exist; Date.parse would silently roll it to March 2.", NUMERIC, bad_date,
   ported="eval/fixtures/numerical-date/invalid-date.json",
   expected={"decision": "blocked", "failedChecks": ["timing.order"]})

def no_fallback(s):
    s["edgeCases"] = []
fx("unhandled-source-outage", "No outcome is named for a source outage.", NUMERIC, no_fallback,
   ported="eval/fixtures/ambiguity/unhandled-edge.json",
   expected={"decision": "blocked", "failedChecks": ["edge_cases.terminate"]})

def void_edge(s):
    s["edgeCases"][0]["resolvesTo"] = "void"
fx("edge-case-to-nowhere", "An edge case resolves to an outcome that does not exist.", NUMERIC, void_edge,
   ported=None,
   expected={"decision": "blocked", "failedChecks": ["edge_cases.terminate"]})

def no_catch_all(s):
    s["outcomes"] = s["outcomes"][:3]
    s["edgeCases"] = [{"id": "no-chart", "kind": "source_unavailable", "scenario": "Billboard does not publish the chart", "resolvesTo": "drake"}]
fx("open-set-without-catch-all", "Any artist outside the three listed strands collateral.", CATEGORICAL, no_catch_all,
   ported="eval/fixtures/ambiguity/missing-outcome.json",
   expected={"decision": "blocked", "failedChecks": ["predicate.partition"], "blockingIncludes": "no outcome wins and collateral is stranded"})

def dup_case(s):
    s["predicate"]["cases"].append({"outcomeId": "other", "matches": "drake"})
fx("result-maps-to-two-outcomes", "\"Drake\" maps to both Drake and Other / None.", CATEGORICAL, dup_case,
   ported=None,
   expected={"decision": "blocked", "failedChecks": ["predicate.partition"]})

def gated(s):
    for src in s["sources"]: src["access"] = "gated"
fx("gated-sources", "Every source needs an API key.", NUMERIC, gated,
   ported=None,
   expected={"decision": "blocked", "failedChecks": ["sources.resolvable"]})

def no_source(s):
    s["sourcePrecedence"] = []
fx("missing-source", "No resolution source is named.", NUMERIC, no_source,
   ported="eval/fixtures/rag-trap/missing-source.json",
   expected={"decision": "blocked", "failedChecks": ["sources.resolvable"]})

def reserved(s):
    s["outcomes"][0]["name"] = "OT Yes"
fx("reserved-token-prefix", "Outcome names may not start with the reserved OT prefix.", NUMERIC, reserved,
   expected={"decision": "blocked", "failedChecks": ["outcomes.identity"]})

def freeform(s):
    s["question"] = "Will the Federal Reserve signal a policy pivot at its June 2027 meeting?"
    s["outcomes"] = [
        {"id": "yes", "name": "Yes", "winCondition": "The FOMC statement signals a pivot."},
        {"id": "no", "name": "No", "winCondition": "The FOMC statement does not signal a pivot."}
    ]
    s["sources"] = [{"id": "fomc", "description": "FOMC statement", "url": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "access": "public", "extraction": "Text of the June 2027 FOMC statement"}]
    s["sourcePrecedence"] = ["fomc"]
    s["predicate"] = {"kind": "freeform", "description": "Whether the statement signals a pivot."}
fx("vague-predicate", "Freeform predicates cannot be proven MECE; a challenger must attest before acceptance.", NUMERIC, freeform,
   ported="eval/fixtures/ambiguity/vague-predicate.json",
   expected={"decision": "incomplete", "failedChecks": [], "missingIncludes": "predicate.partition"})

fx("self-resolving", "Deterministic checks pass, but a reviewer attests that traders can move the settling price.", NUMERIC,
   ported="eval/fixtures/adversarial-factual/self-resolving.json",
   attest=["judgment.objective_source", "judgment.atomic_claims"],
   attest_fail={"judgment.manipulation_resistant": "The settling candle is a single thin-liquidity print that a large trader can move."},
   expected={"decision": "blocked", "failedChecks": [], "blockingIncludes": "single thin-liquidity print"})

def max_during(s):
    s["timing"]["observationStartUTC"] = "2027-01-01T00:00:00Z"
    s["predicate"]["observation"] = "max_during"
fx("locks-before-cutoff", "A running-max market can be decided while trading is still open; reported as a warning for the creator to weigh.", NUMERIC, max_during,
   expected={"decision": "accept", "failedChecks": [], "warningIncludes": "can be decided before trading closes"})

def schema_bad(s):
    del s["outcomes"]
fx("schema-invalid", "A spec without outcomes fails schema validation; every other check reports not_run.", NUMERIC, schema_bad,
   expected={"decision": "blocked", "failedChecks": ["spec.schema"]})

os.makedirs(out, exist_ok=True)
for f in fixtures:
    with open(os.path.join(out, f["id"] + ".json"), "w") as fh:
        json.dump(f, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
print(len(fixtures), "fixtures")
