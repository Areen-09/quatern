import os
import json
import time
import math
import urllib.request
import urllib.parse
import urllib.error
import threading
from pathlib import Path
from typing import List, Dict, Any, Optional

import re
from datetime import datetime
from collections import Counter

from .models import (
    AIConfig, AIStatus, AIRecommendation,
    RefineCopyRequest, RefineCopyResponse, ShopProfile,
    AIAssistantMessage, AIAssistantChatRequest,
    AIAssistantMetricData, AIAssistantChatResponse
)
from . import db

# Model storage directory in %LOCALAPPDATA%\Quatern\models\ (with fallback to Quartern\models and DukaanOS\models)
def get_models_dir() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        quatern_dir = Path(local_app_data) / "Quatern" / "models"
        quartern_dir = Path(local_app_data) / "Quartern" / "models"
        dukaan_dir = Path(local_app_data) / "DukaanOS" / "models"
    else:
        quatern_dir = Path.home() / ".quatern" / "models"
        quartern_dir = Path.home() / ".quartern" / "models"
        dukaan_dir = Path.home() / ".dukaanos" / "models"
    quatern_dir.mkdir(parents=True, exist_ok=True)
    if (quatern_dir / DEFAULT_MODEL_FILENAME).exists():
        return quatern_dir
    if (quartern_dir / DEFAULT_MODEL_FILENAME).exists():
        return quartern_dir
    if (dukaan_dir / DEFAULT_MODEL_FILENAME).exists():
        return dukaan_dir
    return quatern_dir

DEFAULT_MODEL_FILENAME = "google_gemma-4-E2B-it-Q4_K_M.gguf"
# Fast, reliable quantized HuggingFace direct download URL for Gemma 4 E2B
DEFAULT_MODEL_URL = "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf"

# Download thread state
_download_lock = threading.Lock()
_download_state = {
    "downloading": False,
    "progress": 0.0,
    "error": None,
    "total_bytes": 0,
    "downloaded_bytes": 0
}

def get_default_model_path() -> Path:
    return get_models_dir() / DEFAULT_MODEL_FILENAME

_cached_local_llm = None
_cached_local_llm_path = None
_local_llm_lock = threading.Lock()

def get_local_llm():
    global _cached_local_llm, _cached_local_llm_path
    cfg = db.get_ai_config()
    model_path = Path(cfg.model_path) if cfg.model_path else get_default_model_path()
    if not model_path.exists() or model_path.stat().st_size < 100_000_000:
        return None

    with _local_llm_lock:
        if _cached_local_llm is not None and _cached_local_llm_path == str(model_path):
            return _cached_local_llm

        try:
            from llama_cpp import Llama
            _cached_local_llm = Llama(
                model_path=str(model_path),
                n_ctx=2048,
                n_threads=4,
                verbose=False
            )
            _cached_local_llm_path = str(model_path)
            return _cached_local_llm
        except Exception as e:
            print(f"[Quatern AI] Could not load Gemma GGUF model: {e}")
            return None

def get_ai_status() -> AIStatus:
    cfg = db.get_ai_config()
    model_path = Path(cfg.model_path) if cfg.model_path else get_default_model_path()
    installed = model_path.exists() and model_path.stat().st_size > 100_000_000  # >100MB

    if cfg.mode == "local_gguf":
        model_name = "Gemma-4-E2B Q4_K_M (Offline)" if installed else "Gemma-4-E2B (Not Downloaded)"
    elif cfg.mode == "cloud":
        model_name = f"Cloud ({cfg.cloud_provider.title()})"
    else:
        model_name = "Heuristic Baseline (Offline)"

    return AIStatus(
        mode=cfg.mode,
        activeModelName=model_name,
        preferredLanguage=cfg.preferred_language or "hinglish",
        localModelInstalled=installed,
        localModelPath=str(model_path) if installed else "",
        cloudConfigured=bool(cfg.api_key and cfg.api_key.strip()),
        downloading=_download_state["downloading"],
        downloadProgress=round(_download_state["progress"], 1)
    )

def start_model_download() -> Dict[str, Any]:
    global _download_state
    with _download_lock:
        if _download_state["downloading"]:
            return {"ok": True, "message": "Download is already in progress", "progress": _download_state["progress"]}

        _download_state["downloading"] = True
        _download_state["progress"] = 0.0
        _download_state["error"] = None
        _download_state["downloaded_bytes"] = 0

    thread = threading.Thread(target=_run_download_worker, daemon=True)
    thread.start()
    return {"ok": True, "message": "Model download initiated in background"}

def _run_download_worker():
    global _download_state
    target_path = get_default_model_path()
    temp_path = target_path.with_suffix(".downloading")

    try:
        req = urllib.request.Request(
            DEFAULT_MODEL_URL,
            headers={"User-Agent": "Quatern-Desktop/1.0"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            total_size = int(resp.headers.get("Content-Length", 0))
            _download_state["total_bytes"] = total_size

            downloaded = 0
            chunk_size = 1024 * 1024  # 1 MB chunk

            with open(temp_path, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    _download_state["downloaded_bytes"] = downloaded
                    if total_size > 0:
                        _download_state["progress"] = (downloaded / total_size) * 100.0

            if temp_path.exists():
                if target_path.exists():
                    target_path.unlink()
                temp_path.rename(target_path)

            cfg = db.get_ai_config()
            cfg.model_path = str(target_path)
            cfg.mode = "local_gguf"
            db.save_ai_config(cfg)

    except Exception as e:
        _download_state["error"] = str(e)
    finally:
        with _download_lock:
            _download_state["downloading"] = False
            _download_state["progress"] = 100.0 if not _download_state["error"] else 0.0

# -------------------------------------------------------------
# Privacy-Preserving RFM & Archetype Detection Engine
# -------------------------------------------------------------

def analyze_and_get_recommendations() -> List[AIRecommendation]:
    """Analyze local sales history and customer patterns to detect the top 3 targeting archetypes."""
    conn = db.get_connection()
    cur = conn.cursor()
    now_ms = int(time.time() * 1000)
    day_ms = 86400000

    cur.execute("SELECT name, owner_name FROM shop_profile LIMIT 1")
    shop_row = cur.fetchone()
    store_name = (shop_row["name"] if shop_row and shop_row["name"] else "Apki Dukaan")

    # Fetch consented customers
    cur.execute("SELECT id, name, consent, tags, created_at FROM customers WHERE consent = 1")
    consented_custs = cur.fetchall()
    customer_ids = [c["id"] for c in consented_custs]

    recommendations: List[AIRecommendation] = []

    if len(customer_ids) == 0:
        conn.close()
        return []

    # ---------------------------------------------------------
    # 1. Archetype 1: Replenishment Cycle Overdue
    # ---------------------------------------------------------
    # Analyze invoice lines with categories 'Staples', 'Dairy', 'Household'
    cur.execute("""
        SELECT i.customer_id, i.at, l.name, p.category
        FROM invoices i
        JOIN invoice_lines l ON i.id = l.invoice_id
        LEFT JOIN products p ON l.product_id = p.id
        WHERE i.customer_id IS NOT NULL AND i.customer_id != ''
        ORDER BY i.customer_id, i.at ASC
    """)
    inv_rows = cur.fetchall()

    cust_visits: Dict[str, List[int]] = {}
    for r in inv_rows:
        cid = r["customer_id"]
        if cid not in cust_visits:
            cust_visits[cid] = []
        cust_visits[cid].append(r["at"])

    overdue_cids: List[str] = []
    for cid, visits in cust_visits.items():
        if cid not in customer_ids:
            continue
        unique_days = sorted(list(set(v // day_ms for v in visits)))
        if len(unique_days) >= 2:
            intervals = [unique_days[k] - unique_days[k - 1] for k in range(1, len(unique_days))]
            avg_interval = sum(intervals) / len(intervals)
            current_day = now_ms // day_ms
            days_since_last = current_day - unique_days[-1]
            # If past the normal interval by 3+ days
            if days_since_last > avg_interval + 3:
                overdue_cids.append(cid)

    # If small history, take customers whose last purchase was 20+ days ago
    if len(overdue_cids) == 0:
        for cid, visits in cust_visits.items():
            if cid in customer_ids and (now_ms - visits[-1]) > 20 * day_ms:
                overdue_cids.append(cid)

    count_1 = len(overdue_cids)
    copy_hinglish_1 = (
        f"Namaste {{name}}! {store_name} se reminder: lagta hai aapka monthly ration (Atta, Dal, Oil) khatam hone wala hai. "
        f"Iss week aaiye aur lijiye 5% special refill discount! WhatsApp/Call us for delivery."
    )
    copy_hindi_1 = (
        f"नमस्ते {{name}}! {store_name} से सादर प्रणाम। क्या आपके घर का महीने का राशन समाप्त हो रहा है? "
        f"आज ही पधारें और आटा, दाल, तेल पर 5% की विशेष छूट पाएं।"
    )
    copy_english_1 = (
        f"Namaste {{name}}! A gentle reminder from {store_name}: it might be time to restock your monthly essentials (flour, pulses, oil). "
        f"Visit us this week for an exclusive 5% replenishment discount!"
    )

    if count_1 > 0:
        recommendations.append(AIRecommendation(
            id="rec_replenishment_overdue",
            archetype="replenishment_overdue",
            title="Monthly Ration & Staples Refill Overdue",
            rationale=f"Identified {count_1} regular customer(s) whose estimated grocery reorder cycle has elapsed.",
            eligibleCustomerCount=count_1,
            eligibleCustomerIds=overdue_cids,
            suggestedDiscountPct=5,
            suggestedChannel="WhatsApp",
            copyHinglish=copy_hinglish_1,
            copyHindi=copy_hindi_1,
            copyEnglish=copy_english_1,
            tagFilter="All consented"
        ))

    # ---------------------------------------------------------
    # 2. Archetype 2: Win-Back Inactive Shoppers (25-45 days)
    # ---------------------------------------------------------
    inactive_cids: List[str] = []
    for cid in customer_ids:
        visits = cust_visits.get(cid, [])
        if visits:
            last_visit = visits[-1]
            days_ago = (now_ms - last_visit) / day_ms
            if 20 <= days_ago <= 60:
                inactive_cids.append(cid)
        else:
            # Customer registered but never bought or older
            inactive_cids.append(cid)

    count_2 = len(inactive_cids)
    copy_hinglish_2 = (
        f"Namaste {{name}}! Kaafi din ho gaye aap {store_name} nahi aaye, we miss you! "
        f"Aapke agle bill par flat Rs 35 off above Rs 350. Yeh message counter par dikhayein. Visit soon!"
    )
    copy_hindi_2 = (
        f"नमस्ते {{name}}! काफी दिन हो गए आपसे मुलाकात नहीं हुई। हमें आपकी याद आ रही है! "
        f"आपके अगले ₹350 के बिल पर फ्लैट ₹35 की छूट। {store_name} में आपका स्वागत है।"
    )
    copy_english_2 = (
        f"Hi {{name}}! We haven't seen you in a while at {store_name} and we miss having you. "
        f"Enjoy flat Rs 35 off on your next purchase of Rs 350 or more. See you soon!"
    )

    if count_2 > 0:
        recommendations.append(AIRecommendation(
            id="rec_win_back_inactive",
            archetype="win_back_inactive",
            title="Win-Back Inactive Shoppers (20–60 Days)",
            rationale=f"Targets {count_2} valued customer(s) at churn risk who haven't visited in recent weeks.",
            eligibleCustomerCount=count_2,
            eligibleCustomerIds=inactive_cids,
            suggestedDiscountPct=10,
            suggestedChannel="WhatsApp",
            copyHinglish=copy_hinglish_2,
            copyHindi=copy_hindi_2,
            copyEnglish=copy_english_2,
            tagFilter="Regular"
        ))

    # ---------------------------------------------------------
    # 3. Archetype 3: Surplus / Slow-Moving Stock Clearance
    # ---------------------------------------------------------
    cur.execute("SELECT id, name, category, stock, reorder, price FROM products WHERE stock > 5 ORDER BY stock DESC LIMIT 1")
    surplus_prod = cur.fetchone()

    surplus_name = surplus_prod["name"] if surplus_prod else "Snacks & Refreshments"
    surplus_cat = surplus_prod["category"] if surplus_prod else "Snacks"

    # Match past buyers of this category or general customers
    surplus_cids = customer_ids[:max(1, len(customer_ids) // 2)] if customer_ids else []
    count_3 = len(surplus_cids)

    copy_hinglish_3 = (
        f"Namaste {{name}}! {store_name} par special offer: {surplus_name} par iss weekend 10% extra discount! "
        f"Offer valid till Sunday stock lasts. Jaldi aaiye aur fayda uthaiye!"
    )
    copy_hindi_3 = (
        f"नमस्ते {{name}}! {store_name} पर विशेष धमाका ऑफर: {surplus_name} पर इस वीकेंड पाइए 10% की अतिरिक्त छूट। "
        f"ऑफर सीमित समय के लिए उपलब्ध है। धन्यवाद!"
    )
    copy_english_3 = (
        f"Namaste {{name}}! Exclusive limited-time offer at {store_name}: Enjoy 10% off on {surplus_name} this weekend! "
        f"Offer valid while stocks last. Visit us today!"
    )

    if count_3 > 0 and surplus_prod:
        recommendations.append(AIRecommendation(
            id="rec_surplus_clearance",
            archetype="surplus_clearance",
            title=f"Slow-Moving Stock Clearance: {surplus_name}",
            rationale=f"Encourages repeat basket additions for high-inventory item ({surplus_name}) to free up working capital.",
            eligibleCustomerCount=count_3,
            eligibleCustomerIds=surplus_cids,
            suggestedDiscountPct=10,
            suggestedChannel="WhatsApp",
            copyHinglish=copy_hinglish_3,
            copyHindi=copy_hindi_3,
            copyEnglish=copy_english_3,
            tagFilter="All consented"
        ))

    conn.close()

    # If Cloud or Local LLM mode is active, attempt enhancement
    cfg = db.get_ai_config()
    if cfg.mode == "cloud" and cfg.api_key:
        try:
            return enhance_recommendations_with_cloud(recommendations, store_name, cfg)
        except Exception:
            pass  # Fallback to deterministic copy smoothly

    return recommendations

# -------------------------------------------------------------
# Cloud LLM Adapter (Gemini Flash / Groq)
# -------------------------------------------------------------

def enhance_recommendations_with_cloud(
    recs: List[AIRecommendation],
    store_name: str,
    cfg: AIConfig
) -> List[AIRecommendation]:
    """Optional cloud enhancement via Google Gemini 1.5 Flash."""
    if cfg.cloud_provider == "gemini":
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={cfg.api_key.strip()}"
        prompt = (
            f"You are a retail marketing copywriter for an Indian neighborhood store called '{store_name}'. "
            f"Given these 3 retail campaigns, return a JSON array with 3 objects containing 'id', 'copyHinglish', 'copyHindi', and 'copyEnglish'. "
            f"Use warm, courteous retail tone, include 'Namaste {{name}}!', store name, and discount perk.\n\n"
            f"Campaigns: " + json.dumps([{
                "id": r.id,
                "title": r.title,
                "discount": r.suggested_discount_pct
            } for r in recs])
        )

        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 600}
        }

        req = urllib.request.Request(api_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["candidates"][0]["content"]["parts"][0]["text"]
            # Extract JSON from markdown
            cleaned = content.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
            items = json.loads(cleaned.strip())
            for item in items:
                rec = next((r for r in recs if r.id == item.get("id")), None)
                if rec:
                    if item.get("copyHinglish"): rec.copy_hinglish = item["copyHinglish"]
                    if item.get("copyHindi"): rec.copy_hindi = item["copyHindi"]
                    if item.get("copyEnglish"): rec.copy_english = item["copyEnglish"]

    return recs

def refine_message_copy(req: RefineCopyRequest) -> RefineCopyResponse:
    """Refine or re-tone message into Hinglish, Hindi, or English."""
    cfg = db.get_ai_config()

    if cfg.mode == "cloud" and cfg.api_key:
        try:
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={cfg.api_key.strip()}"
            prompt = (
                f"Rewrite this retail WhatsApp offer message in {req.target_language.upper()} with a {req.tone.upper()} tone for '{req.store_name}'. "
                f"Keep '{{name}}' placeholder intact. Output only the final message string without commentary:\n\n{req.message}"
            )
            payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.3}}
            r = urllib.request.Request(api_url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(r, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                return RefineCopyResponse(message=text)
        except Exception:
            pass

    # Heuristic translation fallback
    msg = req.message
    if req.target_language == "hindi":
        msg = f"नमस्ते {name}! {req.store_name} पर आपके लिए विशेष ऑफर उपलब्ध है। आज ही पधारें!"
    elif req.target_language == "english":
        msg = f"Namaste {name}! Exclusive retail offer from {req.store_name}. Visit our store today or order on WhatsApp!"
    else:
        msg = f"Namaste {name}! {req.store_name} par special discount offer active hai. Aaiye aur discount ka fayda uthaiye!"

    return RefineCopyResponse(message=msg)


# -------------------------------------------------------------
# AI Assistant Engine: Business Intelligence & Copilot
# -------------------------------------------------------------

def get_business_intelligence_snapshot() -> Dict[str, Any]:
    """Calculate verified, real-time business metrics directly from local SQLite database."""
    conn = db.get_connection()
    cur = conn.cursor()
    now_dt = datetime.now()
    now_ms = int(now_dt.timestamp() * 1000)
    day_ms = 86400000

    # 1. Shop Profile
    cur.execute("SELECT name, owner_name, phone, gstin, address, country, currency FROM shop_profile LIMIT 1")
    shop_row = cur.fetchone()
    store_name = shop_row["name"] if shop_row and shop_row["name"] else "Quatern Store"
    owner_name = shop_row["owner_name"] if shop_row and shop_row["owner_name"] else "Store Owner"
    store_phone = shop_row["phone"] if shop_row and shop_row["phone"] else ""

    # 2. Timing boundaries
    today_start_dt = datetime(now_dt.year, now_dt.month, now_dt.day)
    today_start_ms = int(today_start_dt.timestamp() * 1000)
    yesterday_start_ms = today_start_ms - day_ms
    yesterday_end_ms = today_start_ms

    this_month_start_dt = datetime(now_dt.year, now_dt.month, 1)
    this_month_start_ms = int(this_month_start_dt.timestamp() * 1000)

    if now_dt.month == 1:
        last_month_start_dt = datetime(now_dt.year - 1, 12, 1)
    else:
        last_month_start_dt = datetime(now_dt.year, now_dt.month - 1, 1)
    last_month_start_ms = int(last_month_start_dt.timestamp() * 1000)
    last_month_end_ms = this_month_start_ms

    last_7d_start_ms = now_ms - (7 * day_ms)
    prior_7d_start_ms = now_ms - (14 * day_ms)

    last_30d_start_ms = now_ms - (30 * day_ms)
    prior_30d_start_ms = now_ms - (60 * day_ms)

    # 3. Invoices query
    cur.execute("SELECT id, number, at, total, tax, payment, customer_name, customer_phone FROM invoices ORDER BY at DESC")
    all_invoices = cur.fetchall()

    today_invs = [i for i in all_invoices if i["at"] >= today_start_ms]
    yesterday_invs = [i for i in all_invoices if yesterday_start_ms <= i["at"] < yesterday_end_ms]
    this_month_invs = [i for i in all_invoices if i["at"] >= this_month_start_ms]
    last_month_invs = [i for i in all_invoices if last_month_start_ms <= i["at"] < last_month_end_ms]
    last_7d_invs = [i for i in all_invoices if i["at"] >= last_7d_start_ms]
    prior_7d_invs = [i for i in all_invoices if prior_7d_start_ms <= i["at"] < last_7d_start_ms]
    last_30d_invs = [i for i in all_invoices if i["at"] >= last_30d_start_ms]
    prior_30d_invs = [i for i in all_invoices if prior_30d_start_ms <= i["at"] < last_30d_start_ms]

    def rev(invs): return sum(i["total"] for i in invs) / 100.0
    def cnt(invs): return len(invs)
    def avg_val(invs): return (rev(invs) / cnt(invs)) if cnt(invs) > 0 else 0.0

    today_rev = rev(today_invs)
    today_cnt = cnt(today_invs)
    today_avg = avg_val(today_invs)
    today_pay_counter = Counter(i["payment"] for i in today_invs)
    today_pay_breakdown = {k: sum(i["total"] for i in today_invs if i["payment"] == k) / 100.0 for k in today_pay_counter}

    yest_rev = rev(yesterday_invs)
    yest_cnt = cnt(yesterday_invs)
    dod_growth = round(((today_rev - yest_rev) / yest_rev) * 100, 1) if yest_rev > 0 else 0.0

    this_month_rev = rev(this_month_invs)
    this_month_cnt = cnt(this_month_invs)
    last_month_rev = rev(last_month_invs)
    last_month_cnt = cnt(last_month_invs)
    mom_growth = round(((this_month_rev - last_month_rev) / last_month_rev) * 100, 1) if last_month_rev > 0 else 0.0

    week_rev = rev(last_7d_invs)
    prior_week_rev = rev(prior_7d_invs)
    wow_growth = round(((week_rev - prior_week_rev) / prior_week_rev) * 100, 1) if prior_week_rev > 0 else 0.0

    r30_rev = rev(last_30d_invs)
    p30_rev = rev(prior_30d_invs)
    r30_growth = round(((r30_rev - p30_rev) / p30_rev) * 100, 1) if p30_rev > 0 else 0.0

    all_time_rev = rev(all_invoices)
    all_time_cnt = cnt(all_invoices)

    # 4. Inventory
    cur.execute("SELECT id, name, category, price, cost, stock, reorder FROM products")
    prods = cur.fetchall()
    total_products = len(prods)
    low_stock = [p for p in prods if p["stock"] <= p["reorder"]]
    out_of_stock = [p for p in prods if p["stock"] <= 0]

    product_analytics = []
    for p in prods:
        price_rs = p["price"] / 100.0
        cost_rs = p["cost"] / 100.0
        profit_rs = price_rs - cost_rs
        margin_pct = round((profit_rs / price_rs) * 100, 1) if price_rs > 0 else 0.0
        markup_pct = round((profit_rs / cost_rs) * 100, 1) if cost_rs > 0 else 0.0
        product_analytics.append({
            "id": p["id"],
            "name": p["name"],
            "category": p["category"],
            "price_rs": price_rs,
            "cost_rs": cost_rs,
            "profit_rs": profit_rs,
            "margin_pct": margin_pct,
            "markup_pct": markup_pct,
            "stock": p["stock"],
            "reorder": p["reorder"]
        })

    highest_margin_prods = sorted(product_analytics, key=lambda x: x["margin_pct"], reverse=True)
    lowest_margin_prods = sorted([p for p in product_analytics if p["cost_rs"] > 0], key=lambda x: x["margin_pct"])

    # 5. Bestsellers last 30d
    cur.execute("""
        SELECT l.name, SUM(l.qty) as total_qty, SUM(l.price * l.qty) as total_rev
        FROM invoice_lines l
        JOIN invoices i ON l.invoice_id = i.id
        WHERE i.at >= ?
        GROUP BY l.name
        ORDER BY total_rev DESC
        LIMIT 5
    """, (last_30d_start_ms,))
    bestseller_rows = cur.fetchall()
    bestsellers = [
        {"name": r["name"], "qty": r["total_qty"], "revenue_rs": r["total_rev"] / 100.0}
        for r in bestseller_rows
    ]

    sold_names = set(r["name"].lower() for r in bestseller_rows)
    slow_moving = [p for p in product_analytics if p["name"].lower() not in sold_names]

    # 6. Customers & Top Spenders
    cur.execute("SELECT id, name, phone, address, consent, tags, created_at FROM customers")
    cust_rows = cur.fetchall()
    total_customers = len(cust_rows)
    consented_custs = len([c for c in cust_rows if c["consent"]])

    cur.execute("""
        SELECT customer_name, customer_phone, COUNT(id) as bill_count, SUM(total) as total_spent
        FROM invoices
        WHERE customer_name IS NOT NULL AND customer_name != ''
        GROUP BY customer_name, customer_phone
        ORDER BY total_spent DESC
        LIMIT 5
    """)
    top_customer_rows = cur.fetchall()
    top_customers = [
        {"name": r["customer_name"], "phone": r["customer_phone"], "bills": r["bill_count"], "spent_rs": r["total_spent"] / 100.0}
        for r in top_customer_rows
    ]

    # 7. Credit / Udhaar
    credit_invs = [i for i in all_invoices if i["payment"] == "Credit"]
    total_udhaar_rs = sum(i["total"] for i in credit_invs) / 100.0
    debtor_map = {}
    for i in credit_invs:
        cname = (i["customer_name"] or "").strip() or "Customer"
        days_old = int((now_ms - i["at"]) // day_ms)
        if cname not in debtor_map:
            debtor_map[cname] = {"customer": cname, "phone": i["customer_phone"], "amount_rs": 0.0, "max_days": days_old}
        debtor_map[cname]["amount_rs"] += i["total"] / 100.0
        debtor_map[cname]["max_days"] = max(debtor_map[cname]["max_days"], days_old)
    debtors = sorted(list(debtor_map.values()), key=lambda x: x["amount_rs"], reverse=True)

    # 8. Tax and Categories
    today_tax = sum(i["tax"] for i in today_invs) / 100.0
    month_tax = sum(i["tax"] for i in this_month_invs) / 100.0

    cur.execute("""
        SELECT p.category, SUM(l.qty) as qty_sold, SUM(l.price * l.qty) as rev
        FROM invoice_lines l
        LEFT JOIN products p ON l.product_id = p.id
        GROUP BY p.category
        ORDER BY rev DESC
    """)
    category_rows = cur.fetchall()
    categories_perf = [
        {"category": r["category"] or "General", "qty": r["qty_sold"] or 0, "revenue_rs": (r["rev"] or 0) / 100.0}
        for r in category_rows
    ]

    conn.close()

    return {
        "store_name": store_name,
        "owner_name": owner_name,
        "store_phone": store_phone,
        "current_time_str": now_dt.strftime("%d %b %Y, %I:%M %p"),
        "today": {
            "revenue_rs": today_rev,
            "bills_count": today_cnt,
            "avg_bill_rs": today_avg,
            "tax_rs": today_tax,
            "payments_breakdown": today_pay_breakdown,
            "dod_growth_pct": dod_growth
        },
        "yesterday": {
            "revenue_rs": yest_rev,
            "bills_count": yest_cnt
        },
        "this_week": {
            "revenue_rs": week_rev,
            "prior_week_rs": prior_week_rev,
            "wow_growth_pct": wow_growth
        },
        "this_month": {
            "month_name": now_dt.strftime("%B %Y"),
            "revenue_rs": this_month_rev,
            "bills_count": this_month_cnt,
            "tax_rs": month_tax,
            "mom_growth_pct": mom_growth
        },
        "last_month": {
            "month_name": last_month_start_dt.strftime("%B %Y"),
            "revenue_rs": last_month_rev,
            "bills_count": last_month_cnt
        },
        "rolling_30d": {
            "revenue_rs": r30_rev,
            "prior_30d_rs": p30_rev,
            "growth_pct": r30_growth
        },
        "all_time": {
            "revenue_rs": all_time_rev,
            "bills_count": all_time_cnt
        },
        "products": product_analytics,
        "margins": {
            "highest": highest_margin_prods,
            "lowest": lowest_margin_prods
        },
        "inventory": {
            "total_products": total_products,
            "low_stock_count": len(low_stock),
            "out_of_stock_count": len(out_of_stock),
            "low_stock_items": [
                {"name": p["name"], "stock": p["stock"], "reorder": p["reorder"], "price_rs": p["price"] / 100.0}
                for p in low_stock[:5]
            ]
        },
        "slow_moving": slow_moving,
        "bestsellers": bestsellers,
        "customers": {
            "total_count": total_customers,
            "consented_count": consented_custs,
            "top_spenders": top_customers
        },
        "udhaar": {
            "total_pending_rs": total_udhaar_rs,
            "bills_count": len(credit_invs),
            "debtors": debtors[:5]
        },
        "categories": categories_perf
    }


def ask_ai_assistant(req: AIAssistantChatRequest) -> AIAssistantChatResponse:
    """Intelligent retail AI assistant answering store questions with real-time database intelligence."""
    bi = get_business_intelligence_snapshot()
    cfg = db.get_ai_config()
    q = req.query.strip().lower()
    lang = (req.language or cfg.preferred_language or "hinglish").lower()

    # 1. Try Local Gemma 4 E2B GGUF if enabled/installed
    if cfg.mode == "local_gguf":
        try:
            local_resp = _query_local_gguf_assistant(req.query, req.history, bi, cfg, lang)
            if local_resp:
                return local_resp
        except Exception as e:
            print(f"[Quatern AI] Local Gemma inference failed, falling back: {e}")

    # 2. Try Cloud LLM if enabled and API key is present
    if cfg.mode == "cloud" and cfg.api_key and cfg.api_key.strip():
        try:
            cloud_resp = _query_cloud_assistant(req.query, req.history, bi, cfg, lang)
            if cloud_resp:
                return cloud_resp
        except Exception as e:
            # Fallback to local heuristic intelligence on network error
            pass

    # 3. Heuristic Intelligence Engine
    return _generate_heuristic_assistant_response(q, bi, lang)


def _query_local_gguf_assistant(
    query: str,
    history: List[AIAssistantMessage],
    bi: Dict[str, Any],
    cfg: AIConfig,
    language: str
) -> Optional[AIAssistantChatResponse]:
    """Execute local Gemma 4 E2B inference on live store intelligence snapshot."""
    llm = get_local_llm()
    if not llm:
        return None

    prods_summary = ", ".join([
        f"{p['name']} (Sell: ₹{p['price_rs']:,.2f}, Cost: ₹{p['cost_rs']:,.2f}, Profit: ₹{p['profit_rs']:,.2f}, Margin: {p['margin_pct']}%, Stock: {p['stock']})"
        for p in bi.get("products", [])[:10]
    ])
    bestsellers_summary = ", ".join([
        f"{b['name']} ({b['qty']} sold, ₹{b['revenue_rs']:,.2f})"
        for b in bi.get("bestsellers", [])[:5]
    ]) or "None yet"
    debtors_summary = ", ".join([
        f"{d['customer']} (₹{d['amount_rs']:,.2f})"
        for d in bi.get("udhaar", {}).get("debtors", [])[:5]
    ]) or "None"

    system_instruction = (
        f"You are the Quatern AI Retail Business Assistant for '{bi['store_name']}' (Store Manager/Owner: {bi['owner_name']}). "
        f"You are helping the store merchant with business performance, margins, sales, and retail advice.\n\n"
        f"REAL-TIME VERIFIED STORE DATA (from local SQLite database):\n"
        f"- Today's Sales: ₹{bi['today']['revenue_rs']:,.2f} ({bi['today']['bills_count']} bills, Average Bill: ₹{bi['today']['avg_bill_rs']:,.2f}, DoD Growth: {bi['today']['dod_growth_pct']}%)\n"
        f"- Yesterday Sales: ₹{bi['yesterday']['revenue_rs']:,.2f} ({bi['yesterday']['bills_count']} bills)\n"
        f"- This Month ({bi['this_month']['month_name']}): ₹{bi['this_month']['revenue_rs']:,.2f} ({bi['this_month']['bills_count']} bills, MoM Growth: {bi['this_month']['mom_growth_pct']}%)\n"
        f"- Last Month ({bi['last_month']['month_name']}): ₹{bi['last_month']['revenue_rs']:,.2f} ({bi['last_month']['bills_count']} bills)\n"
        f"- Inventory: {bi['inventory']['total_products']} products in catalog, {bi['inventory']['low_stock_count']} low stock, {bi['inventory']['out_of_stock_count']} out of stock\n"
        f"- Product Prices, Costs & Margins: {prods_summary}\n"
        f"- Top Bestsellers (Last 30 Days): {bestsellers_summary}\n"
        f"- Pending Udhaar (Credit): ₹{bi['udhaar']['total_pending_rs']:,.2f} across {bi['udhaar']['bills_count']} unpaid bills. Top debtors: {debtors_summary}\n"
        f"- Registered Customers: {bi['customers']['total_count']}\n\n"
        f"INSTRUCTIONS:\n"
        f"1. Greet the merchant respectfully as 'Namaste {bi['owner_name']} ji'.\n"
        f"2. Answer the question directly using ONLY the real numbers from the verified store data above.\n"
        f"3. Respond in {language.upper()} (e.g. Hinglish if hinglish, Hindi if hindi, English if english).\n"
        f"4. Format currency as '₹' (e.g. ₹100.00). Use clean bullet points and bold highlights.\n"
        f"5. Keep the response concise, accurate, and practical for an Indian retail shopkeeper."
    )

    messages = [{"role": "system", "content": system_instruction}]
    for h in history[-3:]:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": query})

    try:
        with _local_llm_lock:
            res = llm.create_chat_completion(
                messages=messages,
                max_tokens=400,
                temperature=0.2,
                top_p=0.9
            )
        reply_text = res["choices"][0]["message"]["content"].strip()

        # Dynamic metric badges
        q_lower = query.lower()
        metrics = []
        if any(k in q_lower for k in ["margin", "profit", "markup", "cost"]):
            if bi.get("margins", {}).get("highest"):
                best = bi["margins"]["highest"][0]
                metrics.append(AIAssistantMetricData(label="#1 Highest Margin", value=best["name"], subtext=f"{best['margin_pct']}% margin", delta=f"+₹{best['profit_rs']:,.2f}"))
                metrics.append(AIAssistantMetricData(label="Profit Per Unit", value=f"₹{best['profit_rs']:,.2f}", subtext=f"Sell ₹{best['price_rs']:,.2f} vs Cost ₹{best['cost_rs']:,.2f}"))
                metrics.append(AIAssistantMetricData(label="Catalog Size", value=f"{len(bi.get('products', []))} items"))
        elif any(k in q_lower for k in ["today", "aaj", "bikri", "sales today"]):
            metrics.append(AIAssistantMetricData(label="Today Sales", value=f"₹{bi['today']['revenue_rs']:,.2f}", subtext=f"{bi['today']['bills_count']} bills", delta=f"{'+' if bi['today']['dod_growth_pct']>=0 else ''}{bi['today']['dod_growth_pct']}%"))
            metrics.append(AIAssistantMetricData(label="Avg Bill", value=f"₹{bi['today']['avg_bill_rs']:,.2f}"))
            metrics.append(AIAssistantMetricData(label="Yesterday", value=f"₹{bi['yesterday']['revenue_rs']:,.2f}"))
        elif any(k in q_lower for k in ["month", "mom", "growth"]):
            metrics.append(AIAssistantMetricData(label="MoM Growth", value=f"{'+' if bi['this_month']['mom_growth_pct']>=0 else ''}{bi['this_month']['mom_growth_pct']}%", subtext="vs last month", delta=f"{'+' if bi['this_month']['mom_growth_pct']>=0 else ''}{bi['this_month']['mom_growth_pct']}%"))
            metrics.append(AIAssistantMetricData(label="This Month", value=f"₹{bi['this_month']['revenue_rs']:,.2f}", subtext=f"{bi['this_month']['bills_count']} bills"))
        elif any(k in q_lower for k in ["stock", "inventory", "reorder", "shortage"]):
            metrics.append(AIAssistantMetricData(label="Low Stock", value=str(bi["inventory"]["low_stock_count"]), subtext="Items to reorder"))
            metrics.append(AIAssistantMetricData(label="Catalog Size", value=str(bi["inventory"]["total_products"])))
        elif any(k in q_lower for k in ["udhaar", "pending", "credit"]):
            metrics.append(AIAssistantMetricData(label="Total Udhaar", value=f"₹{bi['udhaar']['total_pending_rs']:,.2f}", subtext=f"{bi['udhaar']['bills_count']} bills"))

        return AIAssistantChatResponse(
            reply=reply_text,
            metrics=metrics,
            suggestedActions=["Which product has highest margin?", "What are today's sales?", "Month-on-Month growth"],
            sources=["Local Gemma 4 E2B Q4_K_M (Offline GGUF)", "Live SQLite Snapshot"]
        )
    except Exception as e:
        print(f"[Quatern AI] Gemma generation error: {e}")
        return None


def _query_cloud_assistant(
    query: str,
    history: List[AIAssistantMessage],
    bi: Dict[str, Any],
    cfg: AIConfig,
    language: str
) -> Optional[AIAssistantChatResponse]:
    """Query Gemini 1.5 Flash with complete live business intelligence context."""
    if cfg.cloud_provider == "gemini":
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={cfg.api_key.strip()}"

        system_instruction = (
            f"You are the Quatern AI Business Assistant for '{bi['store_name']}' (Store Manager/Owner: {bi['owner_name']}). "
            f"Current local time: {bi['current_time_str']}.\n\n"
            f"REAL-TIME VERIFIED STORE DATA (from local SQLite database):\n"
            f"{json.dumps(bi, indent=2)}\n\n"
            f"INSTRUCTIONS:\n"
            f"1. You are talking directly to the store merchant. Address them respectfully as 'Namaste {bi['owner_name']}' or 'Ji'.\n"
            f"2. Answer their question accurately using the exact numbers from the verified store data above.\n"
            f"3. Language: Respond in {language.upper()} (e.g., Hinglish if hinglish, Hindi if hindi, English if english).\n"
            f"4. Format currency as '₹' (e.g. ₹1,250.00).\n"
            f"5. Output your response as a valid JSON object with the following schema:\n"
            f"{{\n"
            f'  "reply": "Your markdown-formatted conversational answer with bold highlights and bullet points",\n'
            f'  "metrics": [\n'
            f'    {{"label": "Today Sales", "value": "₹1,250", "subtext": "5 bills", "delta": "+12%"}}\n'
            f'  ],\n'
            f'  "suggestedActions": ["Action 1", "Action 2"]\n'
            f"}}\n"
            f"Do not include any conversational preamble outside the JSON."
        )

        chat_history_parts = []
        for h in history[-4:]:
            chat_history_parts.append(f"{h.role.upper()}: {h.content}")

        prompt = f"User Question: {query}\n\nRecent History:\n" + ("\n".join(chat_history_parts) if chat_history_parts else "None")

        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": system_instruction + "\n\n" + prompt}]}
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 800
            }
        }

        req = urllib.request.Request(api_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            parsed = json.loads(content.strip())
            metrics = [AIAssistantMetricData(**m) for m in parsed.get("metrics", [])]
            return AIAssistantChatResponse(
                reply=parsed.get("reply", ""),
                metrics=metrics,
                suggestedActions=parsed.get("suggestedActions", []),
                sources=["Gemini 1.5 Flash Cloud LLM", "Live SQLite Snapshot"]
            )

    return None


def _generate_heuristic_assistant_response(
    q: str,
    bi: Dict[str, Any],
    lang: str
) -> AIAssistantChatResponse:
    """Rich rule-based NLP analytics engine for offline local intelligence."""
    today = bi["today"]
    yest = bi["yesterday"]
    this_m = bi["this_month"]
    last_m = bi["last_month"]
    inv = bi["inventory"]
    udhaar = bi["udhaar"]
    bestsellers = bi["bestsellers"]
    cust = bi["customers"]
    owner = bi["owner_name"]
    store = bi["store_name"]

    # 1. Product Margins & Profitability
    if any(k in q for k in ["margin", "profit", "markup", "munafa", "kamai per item", "cost price", "highest margin", "lowest margin", "fayda per item"]):
        products = bi.get("products", [])
        if not products:
            reply = "Abhi inventory me koi products add nahi hain. Inventory tab par jakar products add karein."
            return AIAssistantChatResponse(reply=reply, metrics=[], suggestedActions=["Open Inventory", "What are today's sales?"])

        highest_margins = bi["margins"]["highest"]
        best_p = highest_margins[0]

        lines = []
        for idx, p in enumerate(highest_margins[:5]):
            lines.append(
                f"{idx+1}. **{p['name']}**: **{p['margin_pct']}% margin** "
                f"(Selling: ₹{p['price_rs']:,.2f}, Cost: ₹{p['cost_rs']:,.2f}, Profit: **₹{p['profit_rs']:,.2f}/unit**)"
            )

        if lang == "hindi":
            reply = (
                f"📊 **उत्पाद लाभ मार्जिन (Profit Margin) विश्लेषण:**\n\n"
                f"आपकी दुकान में सबसे अधिक लाभ मार्जिन वाला उत्पाद **{best_p['name']}** है, जिस पर **{best_p['margin_pct']}%** का मुनाफा मिलता है (प्रति यूनिट **₹{best_p['profit_rs']:,.2f}** लाभ)!\n\n"
                f"**सर्वोच्च लाभ वाले उत्पाद (Top Margin Products):**\n" + "\n".join(lines) + "\n\n"
                f"💡 _सुझाव: उच्च मार्जिन वाले उत्पादों को काउंटर के निकट प्रमुखता से प्रदर्शित करें और कॉम्बो ऑफर्स में शामिल करें।_"
            )
        elif lang == "english":
            reply = (
                f"📊 **Product Profit Margin Analysis:**\n\n"
                f"The product with the highest margin in your catalog is **{best_p['name']}** with a **{best_p['margin_pct']}% profit margin** (**₹{best_p['profit_rs']:,.2f}** profit per unit)!\n\n"
                f"**Top Margin Products Ranking:**\n" + "\n".join(lines) + "\n\n"
                f"💡 _Tip: Feature high-margin products like {best_p['name']} at checkout counters and in weekend bundles to maximize store profitability._"
            )
        else: # Hinglish
            reply = (
                f"📊 **Product Profit Margin Analysis:**\n\n"
                f"Aapki dukaan me sabse zyada margin **{best_p['name']}** par hai — **{best_p['margin_pct']}% margin** (**₹{best_p['profit_rs']:,.2f}** profit per unit)!\n\n"
                f"**Top Margin Products Ranking:**\n" + "\n".join(lines) + "\n\n"
                f"💡 _Tip: High margin items ({best_p['name']}) ko cash counter ke samne display karein taaki overall profit percentage boost ho sake._"
            )

        metrics = [
            AIAssistantMetricData(label="#1 Highest Margin", value=f"{best_p['name']}", subtext=f"{best_p['margin_pct']}% margin", delta=f"+₹{best_p['profit_rs']:,.2f}"),
            AIAssistantMetricData(label="Profit Per Unit", value=f"₹{best_p['profit_rs']:,.2f}", subtext=f"Sell ₹{best_p['price_rs']:,.2f} vs Cost ₹{best_p['cost_rs']:,.2f}"),
            AIAssistantMetricData(label="Catalog Size", value=f"{len(products)} items", subtext="Analyzed")
        ]
        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["Which products are bestsellers?", "Check low stock alerts", "What are today's sales?"],
            sources=["Local SQLite Database (products table: price vs cost)"]
        )

    # 2. Top Customers & Spenders
    if any(k in q for k in ["customer", "loyal", "spender", "grahak", "buyer"]) or ("who" in q and any(v in q for v in ["bought", "spent", "purchased", "paid"])):
        top_c = bi.get("customers", {}).get("top_spenders", [])
        if top_c:
            lines = [f"{i+1}. **{c['name']}** ({c['phone'] or 'No phone'}): **₹{c['spent_rs']:,.2f}** ({c['bills']} bills)" for i, c in enumerate(top_c)]
            reply = (
                f"👥 **Top Spending Customers:**\n\n" + "\n".join(lines) + "\n\n"
                f"💡 _Tip: In VIP customers ko special WhatsApp discount ya festive greetings bhejein taaki unki loyalty bani rahe!_"
            )
            metrics = [
                AIAssistantMetricData(label="#1 Top Customer", value=top_c[0]["name"][:18], subtext=f"₹{top_c[0]['spent_rs']:,.2f} spent"),
                AIAssistantMetricData(label="Total Customers", value=str(bi["customers"]["total_count"]))
            ]
        else:
            reply = f"Dukaan me kul **{bi['customers']['total_count']} customers** registered hain. Jaise hi aap billing me customer name add karenge, unka spend ranking yahan dikhega!"
            metrics = [AIAssistantMetricData(label="Total Customers", value=str(bi["customers"]["total_count"]))]

        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["View pending udhaar", "Today's sales", "Which product has highest margin?"],
            sources=["Local SQLite Database (invoices & customers)"]
        )

    # 3. Slow Moving & Dead Stock
    if any(k in q for k in ["slow moving", "dead stock", "unsold", "worst selling", "slowest", "not selling"]):
        slow = bi.get("slow_moving", [])
        if slow:
            lines = [f"- **{p['name']}**: Stock **{p['stock']}** units (Worth: ₹{(p['stock'] * p['price_rs']):,.2f})" for p in slow[:5]]
            reply = (
                f"⚠️ **Slow Moving & Unsold Inventory:**\n\n"
                f"Ye products pichhle 30 dino me sale nahi huye hain:\n" + "\n".join(lines) + "\n\n"
                f"💡 _Action: In unsold items par 10-15% clearance discount lagayein ya fast-moving bestsellers ke sath bundle karein._"
            )
            metrics = [
                AIAssistantMetricData(label="Slow Items", value=str(len(slow)), subtext="Zero recent sales"),
                AIAssistantMetricData(label="Low Stock", value=str(inv["low_stock_count"]))
            ]
        else:
            reply = "Badhai ho! Saare products active hain aur sales ho rahi hain. Koi dead stock nahi mila."
            metrics = [AIAssistantMetricData(label="Slow Items", value="0", subtext="All active")]

        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["Which products are bestsellers?", "Highest margin products", "What are today's sales?"],
            sources=["Local SQLite Database (products & invoice_lines)"]
        )

    # 4. Taxes & GST Summary
    if any(k in q for k in ["tax", "gst", "cgst", "sgst"]):
        t_tax = f"₹{bi['today'].get('tax_rs', 0):,.2f}"
        m_tax = f"₹{bi['this_month'].get('tax_rs', 0):,.2f}"
        reply = (
            f"📑 **GST & Tax Collected Summary:**\n\n"
            f"• **Aaj Ka Tax (Today)**: **{t_tax}**\n"
            f"• **Is Mahine Ka Tax ({bi['this_month']['month_name']})**: **{m_tax}**\n\n"
            f"💡 _Tip: GST report dekhne ke liye 'Bills & History' tab par filter karein._"
        )
        return AIAssistantChatResponse(
            reply=reply,
            metrics=[
                AIAssistantMetricData(label="Today Tax", value=t_tax),
                AIAssistantMetricData(label="This Month Tax", value=m_tax)
            ],
            suggestedActions=["What are today's sales?", "Month on Month growth", "View pending udhaar"],
            sources=["Local SQLite Database (invoices table: tax)"]
        )

    # 5. Specific Product Inquiry (e.g. 'atta', 'chawal')
    for p in bi.get("products", []):
        pname = p["name"].lower()
        if re.search(r'\b' + re.escape(pname) + r'\b', q):
            reply = (
                f"📦 **Product Details: {p['name']}**\n\n"
                f"• **Selling Price**: ₹{p['price_rs']:,.2f}\n"
                f"• **Cost Price**: ₹{p['cost_rs']:,.2f}\n"
                f"• **Profit Margin**: **{p['margin_pct']}%** (Profit: **₹{p['profit_rs']:,.2f}/unit**)\n"
                f"• **Current Stock**: **{p['stock']}** left (Reorder level: {p['reorder']})\n"
                f"• **Category**: {p['category'] or 'General'}\n"
            )
            return AIAssistantChatResponse(
                reply=reply,
                metrics=[
                    AIAssistantMetricData(label="Margin", value=f"{p['margin_pct']}%", subtext=f"Profit ₹{p['profit_rs']:,.2f}"),
                    AIAssistantMetricData(label="Stock", value=str(p["stock"]), subtext=f"Reorder at {p['reorder']}"),
                    AIAssistantMetricData(label="Price", value=f"₹{p['price_rs']:,.2f}")
                ],
                suggestedActions=["Which product has highest margin?", "Check low stock alerts", "What are today's sales?"],
                sources=["Local SQLite Database (products table)"]
            )

    # 6. Today's Sales / Bikri / Daily revenue
    if any(k in q for k in ["today", "aaj", "bikri", "sales today", "today's sale", "revenue today", "daily sale", "kamai"]):
        rev_str = f"₹{today['revenue_rs']:,.2f}"
        avg_str = f"₹{today['avg_bill_rs']:,.2f}"
        yest_str = f"₹{yest['revenue_rs']:,.2f}"
        dod = today["dod_growth_pct"]
        dod_str = f"{'+' if dod >= 0 else ''}{dod}%"

        pay_lines = []
        for pmode, pamt in today["payments_breakdown"].items():
            pay_lines.append(f"- **{pmode}**: ₹{pamt:,.2f}")
        pay_text = "\n".join(pay_lines) if pay_lines else "_No payment breakdown recorded yet_"

        if lang == "hindi":
            reply = (
                f"नमस्ते **{owner}** जी! आज की कुल बिक्री का विवरण:\n\n"
                f"• **आज की कुल बिक्री**: **{rev_str}** ({today['bills_count']} बिल)\n"
                f"• **औसत बिल आकार**: {avg_str}\n"
                f"• **कल की बिक्री**: {yest_str} (तुलना: **{dod_str}**)\n\n"
                f"**भुगतान माध्यम (Payment Modes):**\n{pay_text}\n\n"
                f"💡 _सुझाव: आज के अनपेड उधार बिल देखने के लिए 'Pending Udhaar' पेज चेक करें।_"
            )
        elif lang == "english":
            reply = (
                f"Hello **{owner}**! Here is your sales performance summary for today:\n\n"
                f"• **Today's Gross Sales**: **{rev_str}** across **{today['bills_count']} bills**\n"
                f"• **Average Basket Size**: {avg_str} per customer\n"
                f"• **Comparison with Yesterday**: Yesterday was {yest_str} (**{dod_str}**)\n\n"
                f"**Payment Breakdown:**\n{pay_text}\n\n"
                f"💡 _Tip: You can send WhatsApp receipts directly from the billing screen or Bills & History._"
            )
        else:  # Hinglish default
            reply = (
                f"Namaste **{owner}** ji! Aaj ki sales ki puri summary:\n\n"
                f"• **Today's Gross Sales**: **{rev_str}** across **{today['bills_count']} bills**\n"
                f"• **Average Bill Value**: {avg_str}\n"
                f"• **Yesterday se Comparison**: Kal {yest_str} tha (**{dod_str}** change)\n\n"
                f"**Payment Mode Breakdown:**\n{pay_text}\n\n"
                f"💡 _Tip: Agar kisi customer ka payment baaki hai, toh 'Pending Udhaar' se reminder bhej sakte hain._"
            )

        metrics = [
            AIAssistantMetricData(label="Today Sales", value=rev_str, subtext=f"{today['bills_count']} bills", delta=dod_str),
            AIAssistantMetricData(label="Avg Bill", value=avg_str, subtext="Per transaction"),
            AIAssistantMetricData(label="Yesterday", value=yest_str, subtext=f"{yest['bills_count']} bills")
        ]
        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["Show Month-on-Month growth", "Check low stock alerts", "View pending udhaar"],
            sources=["Local SQLite Database (invoices table)"]
        )

    # 2. Month on Month (MoM) Growth / Monthly Sales
    if any(k in q for k in ["month on month", "mom", "growth", "monthly", "mahine", "pichhle mahine", "compare month", "barhotri", "month sales"]):
        tm_rev = f"₹{this_m['revenue_rs']:,.2f}"
        lm_rev = f"₹{last_m['revenue_rs']:,.2f}"
        mom = this_m["mom_growth_pct"]
        mom_str = f"{'+' if mom >= 0 else ''}{mom}%"

        r30_rev = f"₹{bi['rolling_30d']['revenue_rs']:,.2f}"
        p30_rev = f"₹{bi['rolling_30d']['prior_30d_rs']:,.2f}"
        r30_growth = bi["rolling_30d"]["growth_pct"]
        r30_growth_str = f"{'+' if r30_growth >= 0 else ''}{r30_growth}%"

        if lang == "hindi":
            reply = (
                f"**महीने-दर-महीने (Month-on-Month) विकास रिपोर्ट:**\n\n"
                f"• **इस महीने ({this_m['month_name']})**: **{tm_rev}** ({this_m['bills_count']} बिल)\n"
                f"• **पिछले महीने ({last_m['month_name']})**: {lm_rev} ({last_m['bills_count']} बिल)\n"
                f"• **MoM ग्रोथ**: **{mom_str}**\n\n"
                f"**30-दिनों का रोलिंग ट्रेंड:**\n"
                f"पिछले 30 दिनों में कुल **{r30_rev}** की बिक्री हुई, जो कि पूर्व 30 दिनों ({p30_rev}) से **{r30_growth_str}** है।"
            )
        elif lang == "english":
            reply = (
                f"**Month-on-Month (MoM) Growth Analysis:**\n\n"
                f"• **Current Month ({this_m['month_name']})**: **{tm_rev}** ({this_m['bills_count']} bills)\n"
                f"• **Previous Month ({last_m['month_name']})**: {lm_rev} ({last_m['bills_count']} bills)\n"
                f"• **MoM Growth Rate**: **{mom_str}**\n\n"
                f"**30-Day Rolling Momentum:**\n"
                f"Gross revenue over the last 30 days is **{r30_rev}** vs **{p30_rev}** in the prior 30-day window (**{r30_growth_str}**)."
            )
        else:
            reply = (
                f"**Month-on-Month (MoM) Growth Analysis:**\n\n"
                f"• **Iss Mahine ({this_m['month_name']})**: **{tm_rev}** across {this_m['bills_count']} bills\n"
                f"• **Pichhle Mahine ({last_m['month_name']})**: {lm_rev} across {last_m['bills_count']} bills\n"
                f"• **MoM Revenue Growth**: **{mom_str}**\n\n"
                f"**Rolling 30-Day Velocity:**\n"
                f"Pichhle 30 dino me kul **{r30_rev}** ka business hua hai vs usse pehle ke 30 dino ka **{p30_rev}** (**{r30_growth_str}**)."
            )

        metrics = [
            AIAssistantMetricData(label="MoM Growth", value=mom_str, subtext="vs last month", delta=mom_str),
            AIAssistantMetricData(label="This Month", value=tm_rev, subtext=f"{this_m['bills_count']} bills"),
            AIAssistantMetricData(label="Last Month", value=lm_rev, subtext=f"{last_m['bills_count']} bills")
        ]
        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["Which products are bestsellers?", "What are today's sales?", "Suggest a weekend offer"],
            sources=["Local SQLite Database (invoices table)"]
        )

    # 3. Inventory / Low Stock / Out of Stock
    if any(k in q for k in ["stock", "inventory", "low stock", "khatam", "reorder", "shortage", "maal"]):
        low_count = inv["low_stock_count"]
        out_count = inv["out_of_stock_count"]
        items = inv["low_stock_items"]

        item_lines = []
        for itm in items:
            item_lines.append(f"- **{itm['name']}**: Stock **{itm['stock']}** left (Reorder level: {itm['reorder']})")
        item_text = "\n".join(item_lines) if item_lines else "_Saare products stock me hain! 0 low stock items._"

        reply = (
            f"📦 **Inventory Health & Stock Alerts:**\n\n"
            f"• **Total Products in Catalog**: {inv['total_products']}\n"
            f"• **Low Stock Alert**: **{low_count} items** at or below reorder threshold\n"
            f"• **Out of Stock**: **{out_count} items**\n\n"
            f"**Items Needing Immediate Reorder:**\n{item_text}\n\n"
            f"💡 _Tip: Inventory tab par jakar aap 'Purchase' entry daal sakte hain supplier se stock aane par._"
        )
        metrics = [
            AIAssistantMetricData(label="Low Stock", value=str(low_count), subtext="Items to reorder"),
            AIAssistantMetricData(label="Out of Stock", value=str(out_count), subtext="Zero stock"),
            AIAssistantMetricData(label="Catalog Size", value=str(inv["total_products"]), subtext="Total SKUs")
        ]
        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["Open Inventory", "Show top selling products", "What are today's sales?"],
            sources=["Local SQLite Database (products table)"]
        )

    # 4. Udhaar / Pending Payments
    if any(k in q for k in ["udhaar", "pending", "credit", "baaki", "debt", "unpaid", "dues", "payment pending"]):
        total_u_str = f"₹{udhaar['total_pending_rs']:,.2f}"
        b_cnt = udhaar["bills_count"]
        debtor_lines = []
        for d in udhaar["debtors"]:
            ph = f" ({d['phone']})" if d["phone"] else ""
            debtor_lines.append(f"- **{d['customer']}**{ph}: **₹{d['amount_rs']:,.2f}** ({d['max_days']} days pending)")
        debtor_text = "\n".join(debtor_lines) if debtor_lines else "_Koi pending udhaar nahi hai! All accounts settled._"

        reply = (
            f"⏳ **Pending Payments (Udhaar) Summary:**\n\n"
            f"• **Total Outstanding Udhaar**: **{total_u_str}** across **{b_cnt} unpaid bills**\n"
            f"• **Debtor Accounts**: {len(udhaar['debtors'])} customer(s)\n\n"
            f"**Top Outstanding Accounts:**\n{debtor_text}\n\n"
            f"💡 _Action: 'Pending Udhaar' page par jakar 'Remind' button dabayein WhatsApp reminder bhejne ke liye._"
        )
        metrics = [
            AIAssistantMetricData(label="Total Udhaar", value=total_u_str, subtext=f"{b_cnt} unpaid bills"),
            AIAssistantMetricData(label="Pending Accounts", value=str(len(udhaar["debtors"])), subtext="Customers")
        ]
        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["Open Pending Udhaar page", "What are today's sales?", "Month on Month growth"],
            sources=["Local SQLite Database (invoices table where payment='Credit')"]
        )

    # 5. Top Products / Bestsellers
    if any(k in q for k in ["bestseller", "top product", "sabse zyada", "popular", "fast selling", "top selling"]):
        if bestsellers:
            lines = [f"{idx+1}. **{b['name']}**: {b['qty']} sold (Revenue: ₹{b['revenue_rs']:,.2f})" for idx, b in enumerate(bestsellers)]
            reply = (
                f"🏆 **Top Selling Products (Last 30 Days):**\n\n" + "\n".join(lines) + "\n\n"
                f"💡 _Tip: In bestsellers par kabhi stock out mat hone dijiye aur cash counter ke paas display karein!_"
            )
            metrics = [
                AIAssistantMetricData(label="#1 Bestseller", value=bestsellers[0]["name"][:18], subtext=f"{bestsellers[0]['qty']} sold"),
                AIAssistantMetricData(label="Top Product Revenue", value=f"₹{bestsellers[0]['revenue_rs']:,.2f}")
            ]
        else:
            reply = "Abhi tak sales history me products record nahi huye hain. Jaise hi aap 'New bill' me items add karenge, yahan ranking dikhegi!"
            metrics = []

        return AIAssistantChatResponse(
            reply=reply,
            metrics=metrics,
            suggestedActions=["Check low stock alerts", "Month-on-Month growth", "Today's sales"],
            sources=["Local SQLite Database (invoice_lines table)"]
        )

    # 6. Tips / Growth Advice / Boosting Sales
    if any(k in q for k in ["tips", "boost", "advice", "strategy", "increase sales", "offer", "campaign", "fayda", "help"]):
        u_pending_str = f"₹{udhaar['total_pending_rs']:,.2f}"
        reply = (
            f"💡 **Retail Growth Strategies for {store}:**\n\n"
            f"1. **Monthly Ration Refill Campaigns**: Jo regular customers 20+ din se nahi aaye hain, unhe WhatsApp par atta/dal/oil refill ka reminder bhejein (5% discount ke sath).\n"
            f"2. **Weekend Combo Offers**: Apne top sellers ke sath slow-moving items ko bundle kijiye (e.g. Chai Patti ke sath Biscuit par 10% off).\n"
            f"3. **Udhaar Recovery**: Pending udhaar ({u_pending_str}) ke liye 'Pending Udhaar' tab se polite WhatsApp reminder bhejein.\n"
            f"4. **Digital Invoices**: Har customer ko bill ke waqt WhatsApp/SMS bill bhejein taaki unka phone number directory me save ho sake."
        )
        return AIAssistantChatResponse(
            reply=reply,
            metrics=[
                AIAssistantMetricData(label="Customers", value=str(cust["total_count"]), subtext="Registered"),
                AIAssistantMetricData(label="Pending Udhaar", value=f"₹{udhaar['total_pending_rs']:,.2f}")
            ],
            suggestedActions=["What are today's sales?", "Month-on-Month growth", "Check low stock alerts"],
            sources=["Quatern Retail Intelligence Engine"]
        )

    # 7. Default / Executive Store Briefing
    rev_str = f"₹{today['revenue_rs']:,.2f}"
    tm_rev = f"₹{this_m['revenue_rs']:,.2f}"
    mom_str = f"{'+' if this_m['mom_growth_pct'] >= 0 else ''}{this_m['mom_growth_pct']}%"
    u_str = f"₹{udhaar['total_pending_rs']:,.2f}"

    reply = (
        f"Namaste **{owner}** ji! Main Quatern ka AI Business Assistant hoon. "
        f"Aapki dukaan **{store}** ki taaza snapshot:\n\n"
        f"• **Aaj Ki Bikri (Today)**: **{rev_str}** ({today['bills_count']} bills)\n"
        f"• **Is Mahine Ki Bikri (This Month)**: **{tm_rev}** (MoM Growth: **{mom_str}**)\n"
        f"• **Pending Udhaar**: **{u_str}** ({udhaar['bills_count']} bills)\n"
        f"• **Stock Alerts**: **{inv['low_stock_count']} items** reorder level par hain\n\n"
        f"Aap mujhse kuch bhi pooch sakte hain, jaise:\n"
        f"- _'Aaj ki sales aur payment breakdown dikhao'_\n"
        f"- _'Month-on-Month growth kaisa raha?'_\n"
        f"- _'Kaunse products ka stock khatam ho raha hai?'_\n"
        f"- _'Kitna udhaar baaki hai aur kiske paas?'_\n"
        f"- _'Sales badhane ke retail tips do'_"
    )
    metrics = [
        AIAssistantMetricData(label="Today", value=rev_str, subtext=f"{today['bills_count']} bills"),
        AIAssistantMetricData(label="MoM Growth", value=mom_str, subtext="vs last month", delta=mom_str),
        AIAssistantMetricData(label="Low Stock", value=str(inv["low_stock_count"]), subtext="Items to reorder")
    ]
    return AIAssistantChatResponse(
        reply=reply,
        metrics=metrics,
        suggestedActions=["Today's sales", "Month-on-Month growth", "Check low stock alerts", "View pending udhaar"],
        sources=["Quatern Local Intelligence Engine"]
    )
