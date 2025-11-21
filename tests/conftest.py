# tests/conftest.py
import os, json, pytest
from unittest.mock import patch

# -----------------------------
# 1) ENV + DB ชั่วคราว (SQLite)
# -----------------------------
@pytest.fixture(autouse=True, scope="session")
def env_and_db(tmp_path_factory):
    os.environ.setdefault("DB_BACKEND", "sqlite")
    db_file = tmp_path_factory.mktemp("db") / "wms_test.sqlite3"
    os.environ["DB_PATH"] = str(db_file)
    os.environ.setdefault("DECISION_THRESHOLD", "0.5")
    yield

# -----------------------------
# 2) สร้างสคีมา + seed คลัง
# -----------------------------
@pytest.fixture(autouse=True, scope="session")
def init_seed():
    from core.db import init_db, seed_warehouses
    init_db()
    seed_warehouses()      # ถ้าเล็กเพิ่ม W1..W5 ไว้แล้วจะถูกโหลดด้วย
    yield

# -----------------------------
# 3) Mock OpenAI (ให้ deterministic)
#    - ไม่ฟันธงคลัง เพื่อให้การเลือกไปตัดสินจาก scoring/fallback
# -----------------------------
# tests/conftest.py (เฉพาะฟิกซ์เจอร์ mock_openai_minimal)

@pytest.fixture(autouse=True)
def mock_openai_minimal():
    import json
    from core.pricing import load_rate, quote_price
    from core.db import list_active_warehouses
    # หมายเหตุ: route/geocode ถูก mock แล้วโดยฟิกซ์เจอร์ mock_location ในไฟล์นี้

    class _Msg:
        def __init__(self, content=None, tool_calls=None):
            self.content = content
            self.tool_calls = tool_calls or []

    class _Choice:
        def __init__(self, message):
            self.message = message

    class _Resp:
        def __init__(self, msg):
            self.choices = [_Choice(msg)]

    def _last_user_offer(kwargs):
        # ดึง offer dict จากข้อความ user ล่าสุดใน messages
        msgs = kwargs.get("messages", [])
        for m in reversed(msgs):
            if m.get("role") == "user":
                try:
                    return json.loads(m.get("content", "{}"))
                except Exception:
                    return {}
        return {}

    def fake_create(**kwargs):
        # ถ้าขอผลแบบ JSON ตาม schema (DECISION_SCHEMA)
        if kwargs.get("response_format"):
            offer = _last_user_offer(kwargs)
            vol = float(offer.get("volume_cbm", 100))
            days = int(offer.get("duration_days", 30))

            # ใช้ warehouse แรก ๆ มาสร้าง candidate จำลองสักราย (หรือจะวนทำหลายคลังก็ได้)
            rate = load_rate()
            whs = list_active_warehouses()
            cands = []
            # สร้าง 1 แคนดิเดตง่าย ๆ (W1) พร้อม cost/profit ที่คำนวณจริง
            if whs:
                w = whs[0]
                util = float(w["used_cbm"] / max(1.0, w["capacity_cbm"]))
                km = 5.0     # route ถูก mock ให้ 5/15 กับคลังหนึ่งอยู่แล้ว ถ้าอยากสมจริงให้ดึงจาก mock route ก็ได้
                mins = 15.0
                q = quote_price(vol, days, km, util, rate)
                price_amount = q["price_amount"]
                cost = q["cost"]
                profit = round(price_amount - cost, 2)

                cands.append({
                    "warehouse_id": w["warehouse_id"],
                    "route": {"km": km, "minutes": mins},
                    "available_cbm": float(w["capacity_cbm"] - w["used_cbm"]),
                    "price_amount": price_amount,
                    "cost": cost,
                    "profit": profit,
                    "margin": q["margin"],
                    "utilization": util,
                    "sla_fit": 1.0,
                    "score": 0.9
                })

            decision = {
                "accept": True,
                # ตั้ง None เพื่อปล่อยให้ pipeline/auction ตัดสินต่อ (หรือจะล็อก W1 ก็เปลี่ยนเป็น "W1")
                "chosen_warehouse": None,
                "reason": "unit_test_with_cost_profit",
                "priced_amount": cands[0]["price_amount"] if cands else None,
                "candidates": cands
            }
            return _Resp(_Msg(content=json.dumps(decision)))

        # กรณีไม่ได้ขอ JSON schema (เช่น คุยทั่วไป)
        return _Resp(_Msg(content="OK", tool_calls=[]))

    with patch("core.llm_tools.CLIENT.chat.completions.create", side_effect=fake_create):
        yield

# -----------------------------
# 4) จำกัดคลังที่ใช้ตอนเทสต์ (ถ้าตั้ง ENV)
#    - ไม่ตั้ง ENV → เห็นทุกคลัง ACTIVE (เช่น W1..W5)
#    - ตั้ง TEST_ONLY_WH_IDS=W1,W3 → จะกรองเฉพาะที่ระบุ
# -----------------------------
@pytest.fixture(autouse=True)
def _restrict_wh_ids_env(monkeypatch):
    from core import db as coredb
    real_list = coredb.list_active_warehouses

    allow_env = os.getenv("TEST_ONLY_WH_IDS")
    allow = {x.strip() for x in allow_env.split(",")} if allow_env else None

    def filtered_list():
        rows = real_list()
        if allow is None:
            return rows
        return [r for r in rows if r.get("warehouse_id") in allow]

    monkeypatch.setattr(coredb, "list_active_warehouses", filtered_list)
    yield

# -----------------------------
# 5) คุมระยะทาง/เวลา และ geocode
#    - USE_REAL_ROUTE=1      → ไม่ patch route (เรียก provider จริง)
#    - USE_REAL_GEOCODE=1    → ไม่ patch geocode (เรียก provider จริง)
#    - ไม่ตั้ง (ดีฟอลต์)      → ใช้ mock ตามค่าตั้ง
# -----------------------------
def _get_float_env(key, default):
    v = os.getenv(key)
    try:
        return float(v) if v is not None else default
    except Exception:
        return default

@pytest.fixture(autouse=True)
def mock_location(monkeypatch):
    use_real_route   = os.getenv("USE_REAL_ROUTE") == "1"
    use_real_geocode = os.getenv("USE_REAL_GEOCODE") == "1"

    # ถ้าอยากใช้ "ของจริง" ให้ปล่อยผ่านโดยไม่ patch (ตามธงที่ตั้ง)
    if use_real_route and use_real_geocode:
        # ทั้ง geocode และ route เรียก core.location จริงทั้งหมด
        yield
        return

    from unittest.mock import patch
    patches = []

    # --- geocode ---
    if not use_real_geocode:
        # ค่าตัวอย่าง: ระบุ lat/lng ปลายทาง pickup (ต้นทางของลูกค้า)
        # ถ้าอยากให้ geocode จริง ให้ตั้ง USE_REAL_GEOCODE=1
        patches.append(patch("core.location.geocode",
                             return_value=(13.756331, 100.5017651)))  # กลางกรุงเทพ

    # --- route ---
    if not use_real_route:
        # mock route โดย map ด้วย lat/lng "จริง" ของคลังจาก DB
        from core.db import list_active_warehouses
        warehouses = list_active_warehouses()

        # base distance/minutes เมื่อไม่ใช่คลังที่อยากให้ใกล้สุด
        BASE_KM  = _get_float_env("MOCK_BASE_KM", 25.0)
        BASE_MIN = _get_float_env("MOCK_BASE_MIN", 50.0)

        # ระบุคลังที่อยากให้ "ใกล้สุด" โดยง่าย (เช่น MOCK_CLOSEST=W3)
        closest = os.getenv("MOCK_CLOSEST", "W1")

        # สร้าง preset ต่อคลัง (กำหนดเองรายคลังได้ เช่น MOCK_W3_KM=6 MOCK_W3_MIN=16)
        preset = {}
        for w in warehouses:
            wid = w["warehouse_id"]
            km = _get_float_env(f"MOCK_{wid}_KM", BASE_KM)
            mn = _get_float_env(f"MOCK_{wid}_MIN", BASE_MIN)
            preset[wid] = (km, mn)

        # ถ้าไม่ได้ override รายคลัง ให้คลัง closest มีค่า 5/15 เป็นดีฟอลต์
        if closest in preset and os.getenv(f"MOCK_{closest}_KM") is None:
            preset[closest] = (5.0, 15.0)

        # helper: ระบุตัวตนคลังจาก lat/lng “จริง” ใน DB
        eps = 1e-4
        def id_by_coord(lat, lng):
            for w in warehouses:
                if abs(w["lat"] - lat) < eps and abs(w["lng"] - lng) < eps:
                    return w["warehouse_id"]
            return None

        def _route(lat1, lng1, lat2, lng2):
            wid = id_by_coord(lat2, lng2)
            if wid and wid in preset:
                km, mins = preset[wid]
                return float(km), float(mins)
            # ถ้าไม่แมตช์คลังไหนเลย → ตั้งค่าไกลหน่อย
            return 85.0, 80.0

        patches.append(patch("core.location.route", side_effect=_route))

    # apply patches
    ctxs = [p.start() for p in patches]
    try:
        yield
    finally:
        for p in patches:
            p.stop()
