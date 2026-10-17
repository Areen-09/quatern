import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from typing import List
from .models import (
    AppStateSnapshot, CreateInvoiceRequest, UpdateInvoiceRequest, Invoice, Product,
    RecordPurchaseRequest, Purchase, Customer, Campaign,
    UpdateCampaignRequest, VerifyPinRequest, SetPinRequest,
    ShopProfile, SetupShopRequest, UpdateShopRequest,
    MessagingConfig, TestMessagingRequest, SendInvoiceReceiptRequest, BroadcastCampaignRequest,
    AIConfig, AIStatus, AIRecommendation, RefineCopyRequest, RefineCopyResponse,
    AIAssistantChatRequest, AIAssistantChatResponse,
    BulkImportProductsRequest, BulkImportCustomersRequest, BulkImportResponse
)
from . import db
from . import escpos
from . import ocr
from . import messaging
from . import ai



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure SQLite database and tables are ready
    db.init_db()
    yield

app = FastAPI(title="Quatern Backend", version="1.0.0", lifespan=lifespan)

# Enable CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/state", response_model=AppStateSnapshot)
def get_state():
    return db.query_full_snapshot()

@app.post("/api/shop/setup", response_model=AppStateSnapshot)
def setup_shop(req: SetupShopRequest):
    try:
        return db.setup_shop_profile(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/shop", response_model=ShopProfile)
def update_shop(req: UpdateShopRequest):
    try:
        return db.update_shop_profile(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/invoices", response_model=Invoice)
def create_invoice(req: CreateInvoiceRequest):
    try:
        return db.create_invoice(
            customer_id=req.customer_id,
            customer_name=req.customer_name,
            customer_phone=req.customer_phone,
            customer_address=req.customer_address,
            lines=req.lines,
            bill_discount=req.bill_discount,
            total=req.total,
            tax=req.tax,
            payment=req.payment
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/invoices/{invoice_id}")
def update_invoice(invoice_id: str, req: UpdateInvoiceRequest):
    try:
        db.update_invoice(
            invoice_id=invoice_id,
            customer_name=req.customer_name or "",
            customer_phone=req.customer_phone or "",
            customer_address=req.customer_address or "",
            payment=req.payment or "Cash"
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/invoices/{invoice_id}")
def delete_invoice(invoice_id: str):
    try:
        db.delete_invoice(invoice_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/products")
def upsert_product(product: Product):
    try:
        db.upsert_product(product)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/purchases", response_model=Purchase)
def record_purchase(req: RecordPurchaseRequest):
    try:
        return db.record_purchase(
            supplier_id=req.supplier_id,
            product_id=req.product_id,
            qty=req.qty,
            cost=req.cost
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/customers")
def upsert_customer(customer: Customer):
    try:
        db.upsert_customer(customer)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/campaigns")
def create_campaign(campaign: Campaign):
    try:
        db.create_campaign(campaign)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/campaigns/{campaign_id}")
def update_campaign(campaign_id: str, req: UpdateCampaignRequest):
    try:
        db.update_campaign_status(campaign_id, req.status, req.sent_to)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import/products", response_model=BulkImportResponse)
def import_products(req: BulkImportProductsRequest):
    try:
        return db.bulk_upsert_products(req.products, req.conflict_mode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import/customers", response_model=BulkImportResponse)
def import_customers(req: BulkImportCustomersRequest):
    try:
        return db.bulk_upsert_customers(req.customers, req.conflict_mode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/verify-pin")
def verify_pin(req: VerifyPinRequest):
    valid = db.verify_owner_pin(req.pin)
    return {"valid": valid}

@app.post("/api/auth/set-pin")
def set_pin(req: SetPinRequest):
    ok = db.set_owner_pin(req.current_pin, req.new_pin)
    return {"ok": ok}

@app.get("/api/receipts/{invoice_id}/escpos")
def get_escpos_receipt(invoice_id: str, is_80mm: bool = Query(True)):
    snapshot = db.query_full_snapshot()
    inv = next((i for i in snapshot.invoices if i.id == invoice_id), None)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    raw_bytes = escpos.format_invoice_receipt(inv, snapshot.shop.name, snapshot.shop.gstin, is_80mm)
    return Response(content=raw_bytes, media_type="application/octet-stream")

@app.post("/api/reset", response_model=AppStateSnapshot)
def reset_data():
    return db.reset_db_data()

@app.post("/api/ocr/extract-invoice")
async def extract_invoice(file: UploadFile = File(...)):
    content = await file.read()
    res = ocr.process_supplier_invoice(content, file.filename or "invoice")
    return res

@app.get("/api/messaging/config", response_model=MessagingConfig)
def get_messaging_config():
    return db.get_messaging_config()

@app.post("/api/messaging/config", response_model=MessagingConfig)
def save_messaging_config(cfg: MessagingConfig):
    return db.save_messaging_config(cfg)

@app.post("/api/messaging/test")
def test_messaging(req: TestMessagingRequest):
    cfg = db.get_messaging_config()
    snapshot = db.query_full_snapshot()
    store_name = snapshot.shop.name or "Quatern Store"
    msg = req.message or f"Namaste from {store_name}! WhatsApp/SMS Gateway configuration is verified successfully."

    if req.channel.lower() == "whatsapp":
        return messaging.send_whatsapp_message(
            provider=cfg.whatsapp_provider,
            to_phone=req.phone,
            message=msg,
            meta_access_token=cfg.meta_access_token,
            meta_phone_number_id=cfg.meta_phone_number_id,
            meta_template_name=cfg.meta_template_name,
            twilio_account_sid=cfg.twilio_account_sid,
            twilio_auth_token=cfg.twilio_auth_token,
            twilio_whatsapp_number=cfg.twilio_whatsapp_number,
        )
    else:
        return messaging.send_sms_message(
            provider=cfg.sms_provider,
            to_phone=req.phone,
            message=msg,
            sms_auth_key=cfg.sms_auth_key,
            sms_sender_id=cfg.sms_sender_id,
            sms_entity_id=cfg.sms_entity_id,
            sms_template_id=cfg.sms_template_id,
            twilio_account_sid=cfg.twilio_account_sid,
            twilio_auth_token=cfg.twilio_auth_token,
            twilio_phone_number=cfg.twilio_phone_number,
        )

@app.post("/api/messaging/send-invoice-receipt")
def send_invoice_receipt(req: SendInvoiceReceiptRequest):
    snapshot = db.query_full_snapshot()
    inv = next((i for i in snapshot.invoices if i.id == req.invoice_id), None)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    cfg = db.get_messaging_config()
    lines_txt = []
    for l in inv.lines:
        line_total = (l.price * l.qty) / 100
        lines_txt.append(f"{l.qty}x {l.name}: Rs {line_total:.2f}")

    total_rs = inv.total / 100
    tax_rs = inv.tax / 100
    store = snapshot.shop.name or "Quatern Store"
    phone_line = f" · Ph: {snapshot.shop.phone}" if snapshot.shop.phone else ""
    gst_line = f"\nGSTIN: {snapshot.shop.gstin}" if snapshot.shop.gstin else ""

    body = (
        f"🧾 *{store}*{phone_line}{gst_line}\n"
        f"Invoice: {inv.number}\n"
        f"--------------------------------\n"
        + "\n".join(lines_txt) + "\n"
        f"--------------------------------\n"
        f"Total: Rs {total_rs:.2f} ({inv.payment})\n"
        f"(GST Included: Rs {tax_rs:.2f})\n\n"
        f"{cfg.receipt_footer or 'Thank you for shopping with us! Visit again.'}"
    )

    results = {}
    if req.channel in ("whatsapp", "both"):
        results["whatsapp"] = messaging.send_whatsapp_message(
            provider=cfg.whatsapp_provider,
            to_phone=req.phone,
            message=body,
            meta_access_token=cfg.meta_access_token,
            meta_phone_number_id=cfg.meta_phone_number_id,
            meta_template_name=cfg.meta_template_name,
            twilio_account_sid=cfg.twilio_account_sid,
            twilio_auth_token=cfg.twilio_auth_token,
            twilio_whatsapp_number=cfg.twilio_whatsapp_number,
        )

    if req.channel in ("sms", "both"):
        results["sms"] = messaging.send_sms_message(
            provider=cfg.sms_provider,
            to_phone=req.phone,
            message=body,
            sms_auth_key=cfg.sms_auth_key,
            sms_sender_id=cfg.sms_sender_id,
            sms_entity_id=cfg.sms_entity_id,
            sms_template_id=cfg.sms_template_id,
            twilio_account_sid=cfg.twilio_account_sid,
            twilio_auth_token=cfg.twilio_auth_token,
            twilio_phone_number=cfg.twilio_phone_number,
        )

    return {"ok": True, "results": results}

@app.post("/api/messaging/broadcast")
def broadcast_campaign(req: BroadcastCampaignRequest):
    cfg = db.get_messaging_config()
    sent_count = 0
    errors = []

    for r in req.recipients:
        personalized = req.message.replace("{name}", r.name.split()[0] if r.name else "Customer")
        if req.channel.lower() == "whatsapp":
            res = messaging.send_whatsapp_message(
                provider=cfg.whatsapp_provider,
                to_phone=r.phone,
                message=personalized,
                meta_access_token=cfg.meta_access_token,
                meta_phone_number_id=cfg.meta_phone_number_id,
                meta_template_name=cfg.meta_template_name,
                twilio_account_sid=cfg.twilio_account_sid,
                twilio_auth_token=cfg.twilio_auth_token,
                twilio_whatsapp_number=cfg.twilio_whatsapp_number,
            )
        else:
            res = messaging.send_sms_message(
                provider=cfg.sms_provider,
                to_phone=r.phone,
                message=personalized,
                sms_auth_key=cfg.sms_auth_key,
                sms_sender_id=cfg.sms_sender_id,
                sms_entity_id=cfg.sms_entity_id,
                sms_template_id=cfg.sms_template_id,
                twilio_account_sid=cfg.twilio_account_sid,
                twilio_auth_token=cfg.twilio_auth_token,
                twilio_phone_number=cfg.twilio_phone_number,
            )
        if res.get("ok"):
            sent_count += 1
        else:
            errors.append(res.get("error", "Failed"))

    db.update_campaign_status(req.campaign_id, "Sent", sent_count)
    return {"ok": True, "sent": sent_count, "errors": errors[:5]}

@app.get("/api/ai/status", response_model=AIStatus)
def get_ai_status():
    return ai.get_ai_status()

@app.post("/api/ai/config", response_model=AIConfig)
def save_ai_config(cfg: AIConfig):
    return db.save_ai_config(cfg)

@app.get("/api/ai/recommendations", response_model=List[AIRecommendation])
def get_ai_recommendations():
    return ai.analyze_and_get_recommendations()

@app.post("/api/ai/refine-copy", response_model=RefineCopyResponse)
def refine_ai_copy(req: RefineCopyRequest):
    return ai.refine_message_copy(req)

@app.post("/api/ai/download-model")
def download_ai_model():
    return ai.start_model_download()

@app.get("/api/ai/download-progress")
def get_ai_download_progress():
    status = ai.get_ai_status()
    return {
        "downloading": status.downloading,
        "progress": status.download_progress,
        "installed": status.local_model_installed
    }

@app.post("/api/ai/assistant/chat", response_model=AIAssistantChatResponse)
def chat_ai_assistant(req: AIAssistantChatRequest):
    return ai.ask_ai_assistant(req)

@app.get("/api/ai/assistant/snapshot")
def get_ai_assistant_snapshot():
    return ai.get_business_intelligence_snapshot()

# Static frontend mount if dist exists
dist_dir = Path(__file__).resolve().parent.parent / "dist"
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
