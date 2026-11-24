"""Seed produces expected shape of data for Marcus."""

from __future__ import annotations

from datetime import datetime

import pytest

import seed
from db import connect, init_db


@pytest.fixture
def fresh_db(tmp_path):
    # Tests pass tmp_db to init_db/connect explicitly - no need to patch module DB_PATH.
    return tmp_path / "seed-test.db"


def test_seed_inserts_marcus_and_account(fresh_db) -> None:
    init_db(fresh_db)
    conn = connect(fresh_db)
    try:
        cust_id, account_id, card_id = seed.setup_customer_and_account(conn)
        conn.commit()
        cust = conn.execute(
            "SELECT name, home_city FROM customers WHERE id = ?", (cust_id,)
        ).fetchone()
    finally:
        conn.close()
    assert cust["name"] == "Marcus Chen"
    assert "Houston" in cust["home_city"]


def test_generate_transactions_produces_plausible_volume() -> None:
    txs = seed.generate_transactions("card-x", "acct-x", days=30)
    assert 100 <= len(txs) <= 220, f"expected ~150 txs, got {len(txs)}"


def test_transactions_are_chronological() -> None:
    txs = seed.generate_transactions("card-x", "acct-x", days=30)
    timestamps = [t["timestamp"] for t in txs]
    assert timestamps == sorted(timestamps)


def test_reconcile_balances_legit_stays_in_revolving_band() -> None:
    """Legit (non-fraud) charges stay within Marcus's revolving band via modeled
    autopay (~$1,800-$3,500). NOT monotonic -- autopay pays the
    statement down to the floor when a legit charge crosses the ceiling."""
    txs = seed.generate_transactions("card-x", "acct-x", days=30)  # clean baseline
    seed.reconcile_balances(txs)  # revolving-autopay model (defaults)
    balances = [t["balance_after"] for t in txs]
    assert all(
        b <= seed.REVOLVING_CEILING + 0.01 for b in balances
    ), "legit balance is capped at the ceiling via autopay"
    assert all(
        b >= seed.REVOLVING_FLOOR - 0.01 for b in balances
    ), "legit balance never drops below the revolving floor"
    assert (
        seed.REVOLVING_FLOOR <= balances[-1] <= seed.REVOLVING_CEILING
    ), "legit closing balance lands in the revolving band"


def _row(ts: str, amount: float, *, fraud: int = 0, auth: str | None = "00") -> dict:
    """The few keys reconcile_balances reads. auth=None leaves the key out altogether."""
    row: dict = {"timestamp": ts, "amount": amount, "is_fraud": fraud}
    if auth is not None:
        row["auth_response_code"] = auth
    return row


def test_reconcile_balances_declined_row_posts_nothing() -> None:
    """A declined authorization posts nothing: the balance stays where it was on that row, and the
    next approved row adds to the balance from before the decline."""
    txs = [
        _row("2026-05-27T07:00:00", 100.0),
        _row("2026-05-27T07:10:00", 580.40, auth="05"),
        _row("2026-05-27T07:20:00", 50.0),
    ]
    seed.reconcile_balances(txs, opening_balance=1000.0, floor=0.0, ceiling=10_000.0)
    assert [t["balance_after"] for t in txs] == [1100.0, 1100.0, 1150.0]


def test_reconcile_balances_declined_row_skips_the_autopay_rule() -> None:
    """A fraud charge lifts the balance past the ceiling and is not auto-paid. A declined legit
    row after it must leave that balance as it is, not pay it down to the floor."""
    txs = [
        _row("2026-05-27T07:00:00", 3000.0, fraud=1),
        _row("2026-05-27T07:10:00", 25.0, fraud=0, auth="05"),
    ]
    seed.reconcile_balances(txs, opening_balance=1000.0, floor=500.0, ceiling=3500.0)
    assert [t["balance_after"] for t in txs] == [4000.0, 4000.0]


def test_reconcile_balances_row_without_an_auth_code_counts_as_approved() -> None:
    """The population's and the tests' rows may carry no auth_response_code at all; those count as
    approved, as they always did. (A pin: green before the declined-row rule and after it.)"""
    txs = [
        _row("2026-05-27T07:00:00", 100.0, auth=None),
        _row("2026-05-27T07:10:00", 50.0, auth=None),
    ]
    seed.reconcile_balances(txs, opening_balance=1000.0, floor=0.0, ceiling=10_000.0)
    assert [t["balance_after"] for t in txs] == [1100.0, 1150.0]


def test_seeded_declined_attempt_leaves_the_card_balance_alone(tmp_path) -> None:
    """In the card story the declined Lagos ATM attempt (auth 05, 580.40) is not added to the
    running balance: its balance_after is the one of the row before it, and the closing balance
    is the figure without it (6,573.76 less 580.40, pinned from the seed itself)."""
    db = tmp_path / "declined.db"
    seed.main(db_path=db)
    conn = connect(db)
    try:
        rows = conn.execute(
            "SELECT id, amount, auth_response_code, balance_after FROM transactions "
            "WHERE card_id = 'card-marcus-visa-001' ORDER BY timestamp, id"
        ).fetchall()
    finally:
        conn.close()
    declined = [i for i, r in enumerate(rows) if r["auth_response_code"] != "00"]
    assert len(declined) == 1, "the card story holds exactly one declined attempt"
    i = declined[0]
    assert rows[i]["amount"] == 580.40
    assert rows[i]["balance_after"] == rows[i - 1]["balance_after"]
    # The next row (the first Lagos success) adds its own 580.40 to the unmoved balance.
    assert rows[i + 1]["balance_after"] == round(rows[i]["balance_after"] + 580.40, 2)
    assert rows[-1]["balance_after"] == 5993.36


def test_generate_transactions_has_no_fraud() -> None:
    """generate_transactions() alone returns Marcus's clean baseline.
    Fraud is added in seed.main() via append_fraud_signature."""
    txs = seed.generate_transactions("card-x", "acct-x", days=30)
    assert all(t["is_fraud"] == 0 for t in txs)


def test_login_session_ids_are_unique() -> None:
    """session_id must be unique across all generated logins.

    Same-second collisions occur when two logins land on the same second
    and the 4-digit random suffix happens to match. The fix must guarantee
    uniqueness regardless of timestamp or suffix coincidence (e.g. a
    per-session monotonic counter embedded in the id).

    We use a collision-forcing RNG (fixed hour/minute/second + fixed suffix)
    to make this test reliably catch the pre-fix format and reliably pass
    after the counter-based fix.
    """
    import random as _random

    class _FixedSecondRng(_random.Random):
        """Forces every login to land at HH:10:30 with suffix 1234."""

        def randint(self, a: int, b: int) -> int:
            if a == 1000 and b == 9999:
                return 1234  # fixed session suffix
            if a == 8 and b == 21:
                return 10  # fixed hour
            if a == 0 and b == 59:
                return 30  # fixed minute / second
            if a == 2 and b == 3:
                return 2  # logins per day
            return super().randint(a, b)

        def choices(self, population, weights=None, **kw):
            return [population[0]]

        def choice(self, seq):
            return seq[0]

    logins = seed.generate_logins("acct-x", days=5, rng=_FixedSecondRng(42))
    session_ids = [login["session_id"] for login in logins]
    assert len(session_ids) == len(set(session_ids)), (
        f"duplicate session_ids found: "
        f"{[sid for sid in session_ids if session_ids.count(sid) > 1]}"
    )


def test_fraud_signature_present_after_main(tmp_path) -> None:
    """seed.main() appends Marcus's full profile-conformant fraud
    signature: 3 CNP precursors + 1 decline + 3 Lagos POS hits (7 total).
    The Cobstead anchor is is_fraud=0 and is NOT counted here."""
    db = tmp_path / "fraud.db"
    seed.main(db_path=db)
    conn = connect(db)
    try:
        rows = conn.execute(
            "SELECT timestamp, amount, merchant_country, is_card_present, "
            "is_fraud, auth_response_code FROM transactions "
            "WHERE is_fraud = 1 AND card_id = 'card-marcus-visa-001' ORDER BY timestamp"
        ).fetchall()
    finally:
        conn.close()
    assert len(rows) == 7, f"expected 7 fraud events, got {len(rows)}"
    # First 3 are CNP precursors (is_card_present=0, US).
    for r in rows[:3]:
        assert r["is_card_present"] == 0
        assert r["merchant_country"] == "US"
    # Remaining 4 are Lagos CP hits (1 decline + 3 successes), all NG.
    for r in rows[3:]:
        assert r["is_card_present"] == 1
        assert r["merchant_country"] == "NG"
    # Total Lagos spend on approved hits matches the fraud-signature constants.
    # Use auth_response_code to distinguish the decline (same amount as first hit).
    lagos_approved = [r for r in rows[3:] if r["auth_response_code"] == "00"]
    lagos_total = sum(r["amount"] for r in lagos_approved)
    assert abs(lagos_total - (580.40 + 1240.00 + 890.50)) < 0.01


def test_fraud_signature_has_bank_grade_fields(tmp_path) -> None:
    """Fraud signature carries elevated risk scores,
    chip-fallback-swipe POS entry on Lagos hits, billed in USD.
    3 CNP precursors (USD) + 1 decline (NG) + 3 Lagos success hits (NG)."""
    db = tmp_path / "fraud-fields.db"
    seed.main(db_path=db)
    conn = connect(db)
    try:
        rows = conn.execute(
            "SELECT acquirer, pos_entry_mode, risk_score, currency, "
            "auth_source, merchant_country FROM transactions WHERE is_fraud = 1 "
            "AND card_id = 'card-marcus-visa-001' ORDER BY timestamp"
        ).fetchall()
    finally:
        conn.close()
    assert len(rows) == 7
    # First 3 are CNP precursors: USD, cnp_key, elevated risk
    for r in rows[:3]:
        assert r["currency"] == "USD"
        assert r["pos_entry_mode"] == "cnp_key"
        assert 600 <= r["risk_score"] <= 750
    # 4 Lagos hits (1 decline + 3 success): all billed in USD, all chip-fallback-swipe, all 900+
    for r in rows[3:]:
        assert r["currency"] == "USD"
        assert r["pos_entry_mode"] == "chip_fallback_swipe"
        assert r["risk_score"] >= 900
    # At least one Lagos hit was STIP-routed (network stood in).
    assert any(r["auth_source"] == "stip" for r in rows[3:])


def test_baseline_transactions_have_bank_grade_fields(tmp_path) -> None:
    """Every clean transaction carries auth_response_code='00',
    network_ref_number, terminal_id, and a low-to-moderate risk score."""
    db = tmp_path / "baseline-fields.db"
    seed.main(db_path=db)
    conn = connect(db)
    try:
        rows = conn.execute(
            "SELECT auth_response_code, network_ref_number, terminal_id, "
            "currency, risk_score FROM transactions WHERE is_fraud = 0"
        ).fetchall()
    finally:
        conn.close()
    for r in rows:
        assert r["auth_response_code"] == "00"
        assert r["network_ref_number"].startswith("NRN")
        assert "-" in r["terminal_id"]
        assert r["currency"] == "USD"
        assert 0 <= r["risk_score"] < 300  # baseline never fraud-high


def test_customer_has_bank_grade_fields(tmp_path) -> None:
    """Customers carry kyc_level, dob_year, customer_since.
    Accounts carry risk_tier + segment. Cards carry product_type."""
    db = tmp_path / "kyc-fields.db"
    seed.main(db_path=db)
    conn = connect(db)
    try:
        cust = conn.execute(
            "SELECT kyc_level, dob_year, customer_since "
            "FROM customers WHERE id = 'cust-marcus-chen'"
        ).fetchone()
        acct = conn.execute(
            "SELECT risk_tier, segment FROM accounts " "WHERE customer_id = 'cust-marcus-chen'"
        ).fetchone()
        card = conn.execute(
            "SELECT product_type, funding_type, card_on_file_count "
            "FROM cards WHERE account_id = 'acct-marcus-cc-001'"
        ).fetchone()
    finally:
        conn.close()
    assert cust["kyc_level"] == "enhanced"
    assert cust["dob_year"] == 1988
    assert cust["customer_since"] == "2019-03-14"
    assert acct["risk_tier"] == "low"
    assert acct["segment"] == "premium"
    assert "Visa Signature" in card["product_type"]
    assert card["funding_type"] == "credit"
    assert card["card_on_file_count"] >= 0


def _all_rows(db):
    seed.main(db_path=db)
    conn = connect(db)
    try:
        return conn.execute(
            "SELECT id, timestamp, amount, merchant_name, merchant_lat, "
            "merchant_lng, merchant_country, is_card_present, is_fraud, "
            "auth_response_code, pos_entry_mode, currency "
            "FROM transactions ORDER BY timestamp"
        ).fetchall()
    finally:
        conn.close()


def test_houston_anchor_is_last_cp_before_first_lagos(tmp_path) -> None:
    """The last clean CP swipe before any Lagos hit must be the Cobstead Grocers anchor."""
    rows = _all_rows(tmp_path / "anchor.db")
    lagos = [r for r in rows if r["merchant_country"] == "NG"]
    assert lagos, "expected Lagos fraud hits"
    first_lagos = lagos[0]
    before = [
        r for r in rows if r["timestamp"] < first_lagos["timestamp"] and r["is_card_present"] == 1
    ]
    anchor = before[-1]
    assert anchor["merchant_country"] == "US"
    assert anchor["is_fraud"] == 0, "anchor is Marcus's last CLEAN swipe"
    assert anchor["merchant_name"] == "Cobstead Grocers Bunker Hill"


def test_impossible_travel_gap_is_credible(tmp_path) -> None:
    """Houston-to-Lagos gap must be ~9.7h - credible flight time is impossible for CP."""
    rows = _all_rows(tmp_path / "gap.db")
    lagos = [r for r in rows if r["merchant_country"] == "NG"]
    first_lagos = lagos[0]
    before = [
        r for r in rows if r["timestamp"] < first_lagos["timestamp"] and r["is_card_present"] == 1
    ]
    anchor = before[-1]
    gap_h = (
        datetime.fromisoformat(first_lagos["timestamp"])
        - datetime.fromisoformat(anchor["timestamp"])
    ).total_seconds() / 3600
    assert 9.0 <= gap_h <= 10.5, f"expected ~9.7h gap, got {gap_h:.2f}h"


def test_lagos_cluster_is_rapid(tmp_path) -> None:
    """Consecutive Lagos fraud hits must be no more than 5 minutes apart."""
    rows = _all_rows(tmp_path / "cluster.db")
    lagos = sorted((r for r in rows if r["merchant_country"] == "NG"), key=lambda r: r["timestamp"])
    assert len(lagos) >= 3
    for a, b in zip(lagos, lagos[1:]):
        gap_min = (
            datetime.fromisoformat(b["timestamp"]) - datetime.fromisoformat(a["timestamp"])
        ).total_seconds() / 60
        assert gap_min <= 5, f"cluster gap {gap_min:.1f}min exceeds 5"


def test_three_named_precursor_microtests(tmp_path) -> None:
    """CNP precursor micro-charges must be exactly $0.99, $4.99, and $9.99."""
    rows = _all_rows(tmp_path / "precursors.db")
    micro = [
        r for r in rows if r["is_fraud"] == 1 and r["is_card_present"] == 0 and r["amount"] < 10
    ]
    amounts = sorted(round(r["amount"], 2) for r in micro)
    assert amounts == [0.99, 4.99, 9.99], f"got {amounts}"


def test_at_least_one_decline_before_first_success(tmp_path) -> None:
    """Fraud signature must include at least one declined attempt (auth_response_code != '00')."""
    rows = _all_rows(tmp_path / "declines.db")
    declines = [r for r in rows if r["is_fraud"] == 1 and r["auth_response_code"] != "00"]
    assert declines, "expected >=1 declined fraud attempt"


def test_two_seeds_on_fresh_files_give_identical_rows(tmp_path) -> None:
    """seed.main() on two fresh files produces the same row count + same IDs."""
    db = tmp_path / "first.db"
    seed.main(db_path=db)
    conn = connect(db)
    try:
        rows1 = conn.execute(
            "SELECT id, amount, timestamp FROM transactions ORDER BY id"
        ).fetchall()
    finally:
        conn.close()
    assert len(rows1) > 0, "first seed produced no transactions"

    db = tmp_path / "second.db"
    seed.main(db_path=db)
    conn = connect(db)
    try:
        rows2 = conn.execute(
            "SELECT id, amount, timestamp FROM transactions ORDER BY id"
        ).fetchall()
    finally:
        conn.close()
    assert len(rows1) == len(rows2), f"seed not idempotent: {len(rows1)} rows -> {len(rows2)} rows"
    # Every row matches by id+amount+timestamp - i.e. determinism holds.
    for a, b in zip(rows1, rows2):
        assert (a["id"], a["amount"], a["timestamp"]) == (
            b["id"],
            b["amount"],
            b["timestamp"],
        )


@pytest.mark.parametrize(
    "first, second",
    [(True, False), (False, False), (False, True)],
    ids=["population-then-plain", "plain-then-plain", "plain-then-population"],
)
def test_seed_refuses_a_database_that_holds_a_story(tmp_path, first, second) -> None:
    """A second seed on one file would keep the first run's rows beside its own: it refuses,
    names the file, and leaves the file's bytes as they were."""
    db = tmp_path / "built.db"
    seed.main(db_path=db, with_population=first)
    before = db.read_bytes()
    with pytest.raises(FileExistsError, match="remove it first") as refused:
        seed.main(db_path=db, with_population=second)
    assert str(db) in str(refused.value)
    assert db.read_bytes() == before


@pytest.mark.parametrize("with_population", [False, True])
def test_seed_fills_a_database_with_its_tables_and_no_rows(tmp_path, with_population) -> None:
    db = tmp_path / "empty.db"
    init_db(db)
    seed.main(db_path=db, with_population=with_population)
    conn = connect(db)
    try:
        cards = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    finally:
        conn.close()
    assert cards == (301 if with_population else 1)


def test_main_seeds_population_and_ring(tmp_path):
    db = tmp_path / "portfolio.db"
    seed.main(db_path=db, with_population=True)
    conn = connect(db)
    try:
        n_cust = conn.execute("SELECT COUNT(*) c FROM customers").fetchone()["c"]
        cpp = conn.execute(
            "SELECT COUNT(DISTINCT card_id) c FROM transactions "
            "WHERE terminal_id = 'ZEL-7731042'"
        ).fetchone()["c"]
        marcus_fraud = conn.execute(
            "SELECT COUNT(*) c FROM transactions "
            "WHERE card_id = 'card-marcus-visa-001' AND is_fraud = 1"
        ).fetchone()["c"]
    finally:
        conn.close()
    assert n_cust >= 300  # Marcus + national population
    assert cpp >= 25  # ~30 ring victims swiped the pump
    assert marcus_fraud == 7  # the canonical 7-row signature, nothing else


def test_population_seed_has_no_row_outside_the_numbering(tmp_path):
    """Every transaction id ends in a four-digit sequence number: the six travel-agency charges
    that once sat outside the numbering are gone, and no canonical id moved."""
    db = tmp_path / "portfolio.db"
    seed.main(db_path=db, with_population=True)
    conn = connect(db)
    try:
        stray = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE id NOT GLOB 'tx-*-[0-9][0-9][0-9][0-9]' "
            "OR category = 'travel_agency' OR mcc = '4722'"
        ).fetchone()[0]
        marcus = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE card_id = 'card-marcus-visa-001'"
        ).fetchone()[0]
        decline = dict(
            conn.execute(
                "SELECT timestamp, auth_response_code FROM transactions "
                "WHERE id = 'tx-card-marcus-visa-001-0140'"
            ).fetchone()
        )
    finally:
        conn.close()
    assert stray == 0
    assert marcus == 144
    assert decline == {"timestamp": "2026-05-27T07:41:00-05:00", "auth_response_code": "05"}


def test_cli_builds_the_population_database(tmp_path):
    """`python -m seed --db PATH --with-population` is the documented recipe for data/replay.db."""
    db = tmp_path / "replay.db"
    assert seed.cli(["--db", str(db), "--with-population"]) == 0
    conn = connect(db)
    try:
        cards = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    finally:
        conn.close()
    assert cards == 301


def test_cli_without_the_flag_builds_marcus_alone(tmp_path):
    db = tmp_path / "marcus.db"
    assert seed.cli(["--db", str(db)]) == 0
    conn = connect(db)
    try:
        cards = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
        rows = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    finally:
        conn.close()
    # 143, not 144: without the ring there is no harvest swipe at the skimmer pump.
    assert (cards, rows) == (1, 143)


def test_main_default_is_marcus_only(fresh_db):
    """The default seed is single-customer Marcus -- no 300-person population,
    no skimmer ring. The card-fraud demo is ONE customer."""
    db = fresh_db
    seed.main(db_path=db)  # default: with_population=False
    conn = connect(db)
    try:
        n_cust = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        n_cards = conn.execute("SELECT COUNT(DISTINCT card_id) FROM transactions").fetchone()[0]
        marcus_fraud = conn.execute(
            "SELECT COUNT(*) FROM transactions "
            "WHERE card_id = 'card-marcus-visa-001' AND is_fraud = 1"
        ).fetchone()[0]
    finally:
        conn.close()
    assert n_cust == 1
    assert n_cards == 1
    assert marcus_fraud == 7
