# app.py
import os
import sys
import json
import uuid

# --- 1) ทำให้รูทโปรเจกต์อยู่ใน sys.path ก่อน (กัน import พลาด) ---
ROOT = os.path.dirname(__file__)
if ROOT not in sys.path:
    sys.path.append(ROOT)

# --- 2) โหลด .env ให้เสร็จก่อน แล้วค่อย import โมดูลอื่นที่อ่าน env ---
# app.py (วางไว้บนสุดของไฟล์เลย)
import os
try:
    from dotenv import load_dotenv
    # ระบุไฟล์ .env ในโฟลเดอร์โปรเจกต์ (ถ้าอยู่ไฟล์เดียวกับ app.py ใช้เส้นทางนี้ได้)
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
except Exception as e:
    print(f"[WARN] cannot load .env early: {e}")





from langgraph.graph import StateGraph, END

# (นำเข้า core หลังโหลด .env แล้วเท่านั้น)
from core.db import init_db, seed_warehouses, save_decision_result
from core.schema import Offer
from agents.dispatcher_agent import run as dispatcher_run


# -------- graph nodes --------
def s_dispatch(state: dict) -> dict:
    """เรียก DispatcherAgent ให้ตัดสินใจ (LLM+tools หรือ fallback deterministic ภายใน agent)"""
    decision = dispatcher_run(state["offer"].model_dump())
    state["decision"] = decision
    return state


def s_reserve(state: dict) -> dict:
    # จุดนี้ถ้าต้องการเรียก “จอง capacity” จริง (hold) ให้เพิ่ม tool_call ได้
    return state


def build():
    g = StateGraph(dict)
    g.add_node("dispatch", s_dispatch)
    g.add_node("reserve", s_reserve)
    g.set_entry_point("dispatch")
    g.add_edge("dispatch", "reserve")
    g.add_edge("reserve", END)
    return g.compile()


# -------- main --------
if __name__ == "__main__":
    # 1) เตรียม DB และ seed คลัง
    init_db()
    seed_warehouses()

    # 2) ทดสอบ (offer)
    offer = Offer(
        offer_id=str(uuid.uuid4()),
        customer_id="C12",
        origin_address="Villette Lite, Pattanakar, Suan Luang, Bangkok, Thailand",   # หรือใส่ origin_lat / origin_lng แทน
        # origin_lat=13.668, origin_lng=100.614,
        volume_cbm=120.0,
        start_date="2025-11-20",
        duration_days=30,
        sla={"latest_dropoff_hour": 24, "weekday_only": True},
    )

    # 3) รันกราฟ
    app = build()
    res = app.invoke({"offer": offer})

    # 3.1 บันทึกผลลง DB (sqlite/mongo ตาม DB_BACKEND)
    meta = {
        "source": "app.py",
        "db_backend": os.getenv("DB_BACKEND", "sqlite"),
        "openai_model": os.getenv("OPENAI_MODEL"),
        "auction": {
            "enabled": os.getenv("INTERNAL_AUCTION", "0"),
            "type": os.getenv("AUCTION_TYPE", "first_price"),
            "jitter": os.getenv("BID_JITTER", "0.0"),
        },
    }
    try:
        save_decision_result(offer.model_dump(), res.get("decision", {}), meta)
    except Exception as e:
        # กันล้ม: ถ้าบันทึกไม่สำเร็จให้แค่เตือนใน stdout
        print(f"[WARN] save_decision_result failed: {e}")

    # 4) พิมพ์ JSON คำตัดสินแบบดิบ (debug)
    print(json.dumps(res.get("decision", {}), indent=2, ensure_ascii=False))

    # 5) สรุปผลอ่านง่าย
    dec = res.get("decision", {}) or {}
    print("\n=== RESULT ===")
    print("ACCEPT:", dec.get("accept"))
    print("WAREHOUSE:", dec.get("chosen_warehouse"))
    print("PRICE:", dec.get("priced_amount"))

    cands = dec.get("candidates") or []
    winner_id = dec.get("chosen_warehouse")

    # หา “ผู้ชนะ” จาก chosen_warehouse; ถ้าไม่เจอและยังมีรายชื่อ ให้หยิบตัวแรก
    winner = None
    if cands:
        winner = next((c for c in cands if c.get("warehouse_id") == winner_id), None)
        if winner is None:
            winner = cands[0]

    if winner:
        cost = winner.get("cost")
        profit = winner.get("profit")
        print("PROFIT:", profit, "COST:", cost)
        print(
            "TOP CANDIDATE:",
            winner.get("warehouse_id"),
            f"{(winner.get('route') or {}).get('km')} km",
            "score=",
            round(float(winner.get("score", 0.0)), 3),
        )
    else:
        print("NO CANDIDATES (LLM didn’t produce any).")