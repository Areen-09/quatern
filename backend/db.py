import os
import sqlite3
import json
import time
import hashlib
import uuid
from pathlib import Path
from typing import Optional, List, Tuple
from .models import (
    ShopProfile, Product, Supplier, Customer, Invoice, InvoiceLine,
    Purchase, Campaign, AuditEntry, AppStateSnapshot, SetupShopRequest, UpdateShopRequest,
    MessagingConfig, AIConfig, BulkImportResponse
)

def get_db_path() -> Path:
    # On Windows: %LOCALAPPDATA%\Quatern\quatern.db (with seamless migration from Quartern and DukaanOS)
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        quatern_dir = Path(local_app_data) / "Quatern"
        quatern_db = quatern_dir / "quatern.db"
        quartern_db = Path(local_app_data) / "Quartern" / "quartern.db"
        dukaan_db = Path(local_app_data) / "DukaanOS" / "dukaanos.db"
    else:
        quatern_dir = Path.home() / ".quatern"
        quatern_db = quatern_dir / "quatern.db"
        quartern_db = Path.home() / ".quartern" / "quartern.db"
        dukaan_db = Path.home() / ".dukaanos" / "dukaanos.db"

    quatern_dir.mkdir(parents=True, exist_ok=True)
    if not quatern_db.exists():
        import shutil
        if quartern_db.exists():
            try:
                shutil.copy2(quartern_db, quatern_db)
            except Exception:
                return quartern_db
        elif dukaan_db.exists():
            try:
                shutil.copy2(dukaan_db, quatern_db)
            except Exception:
                return dukaan_db
    return quatern_db

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()

_initialized = False

def ensure_initialized():
    global _initialized
    if not _initialized:
        init_db()
        _initialized = True

def init_db():
    conn = get_connection()
    cur = conn.cursor()
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS shop_profile (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_name TEXT DEFAULT '',
        gstin TEXT NOT NULL DEFAULT '',
        phone TEXT,
        address TEXT,
        country TEXT NOT NULL DEFAULT 'India',
        currency TEXT NOT NULL DEFAULT 'INR',
        signature TEXT DEFAULT '',
        is_configured INTEGER NOT NULL DEFAULT 0,
        owner_pin_hash TEXT,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price INTEGER NOT NULL,
        cost INTEGER NOT NULL,
        gst INTEGER NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        reorder INTEGER NOT NULL DEFAULT 5,
        supplier_id TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'pc'
    );

    CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        consent INTEGER NOT NULL DEFAULT 1,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        number TEXT UNIQUE NOT NULL,
        at INTEGER NOT NULL,
        customer_id TEXT,
        bill_discount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        tax INTEGER NOT NULL,
        payment TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        gst INTEGER NOT NULL,
        discount_pct INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        supplier_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        qty INTEGER NOT NULL,
        cost INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        segment TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sent_to INTEGER,
        conversions INTEGER
    );

    CREATE TABLE IF NOT EXISTS messaging_config (
        id TEXT PRIMARY KEY DEFAULT 'default',
        whatsapp_provider TEXT NOT NULL DEFAULT 'none',
        meta_access_token TEXT DEFAULT '',
        meta_phone_number_id TEXT DEFAULT '',
        meta_waba_id TEXT DEFAULT '',
        meta_template_name TEXT DEFAULT 'dukaan_receipt',
        sms_provider TEXT NOT NULL DEFAULT 'none',
        sms_auth_key TEXT DEFAULT '',
        sms_sender_id TEXT DEFAULT '',
        sms_entity_id TEXT DEFAULT '',
        sms_template_id TEXT DEFAULT '',
        twilio_account_sid TEXT DEFAULT '',
        twilio_auth_token TEXT DEFAULT '',
        twilio_phone_number TEXT DEFAULT '',
        twilio_whatsapp_number TEXT DEFAULT '',
        auto_send_whatsapp INTEGER NOT NULL DEFAULT 0,
        auto_send_sms INTEGER NOT NULL DEFAULT 0,
        receipt_footer TEXT DEFAULT 'Thank you for shopping with us! Visit again.',
        updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ai_config (
        id TEXT PRIMARY KEY DEFAULT 'default',
        mode TEXT NOT NULL DEFAULT 'heuristic',
        cloud_provider TEXT NOT NULL DEFAULT 'gemini',
        api_key TEXT DEFAULT '',
        model_path TEXT DEFAULT '',
        preferred_language TEXT NOT NULL DEFAULT 'hinglish',
        updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL
    );
    """)
    conn.commit()

    for col, col_def in [
        ("owner_name", "TEXT DEFAULT ''"),
        ("country", "TEXT DEFAULT 'India'"),
        ("signature", "TEXT DEFAULT ''"),
        ("is_configured", "INTEGER DEFAULT 0"),
    ]:
        try:
            cur.execute(f"ALTER TABLE shop_profile ADD COLUMN {col} {col_def}")
        except sqlite3.OperationalError:
            pass

    for col, col_def in [
        ("customer_name", "TEXT DEFAULT ''"),
        ("customer_phone", "TEXT DEFAULT ''"),
        ("customer_address", "TEXT DEFAULT ''"),
    ]:
        try:
            cur.execute(f"ALTER TABLE invoices ADD COLUMN {col} {col_def}")
        except sqlite3.OperationalError:
            pass

    try:
        cur.execute("ALTER TABLE customers ADD COLUMN address TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    conn.commit()

    # Check if seed required (only if shop_profile is missing)
    cur.execute("SELECT COUNT(*) FROM shop_profile")
    if cur.fetchone()[0] == 0:
        seed_db(conn)
    conn.close()

def log_audit(conn: sqlite3.Connection, action: str, detail: str):
    now = int(time.time() * 1000)
    conn.execute("INSERT INTO audit_log (at, action, detail) VALUES (?, ?, ?)", (now, action, detail))

def seed_db(conn: sqlite3.Connection):
    now = int(time.time() * 1000)
    cur = conn.cursor()

    # Clean initial shop profile awaiting onboarding configuration
    cur.execute(
        "INSERT INTO shop_profile (id, name, owner_name, gstin, phone, address, country, currency, signature, is_configured, created_at) "
        "VALUES ('shop_1', 'My Shop', '', '', '', '', 'India', 'INR', '', 0, ?)",
        (now,)
    )

    # Initialize default messaging configuration
    cur.execute(
        "INSERT OR IGNORE INTO messaging_config (id, whatsapp_provider, sms_provider, receipt_footer, updated_at) "
        "VALUES ('default', 'none', 'none', 'Thank you for shopping with us! Visit again.', 0)"
    )

    log_audit(conn, "Setup", "Store initialised. Clean database ready for first-time configuration.")
    conn.commit()

def query_full_snapshot() -> AppStateSnapshot:
    conn = get_connection()
    cur = conn.cursor()

    # 1. Shop profile
    cur.execute("SELECT name, owner_name, gstin, phone, address, country, currency, signature, is_configured, owner_pin_hash FROM shop_profile LIMIT 1")
    row = cur.fetchone()
    keys = row.keys() if row else []
    shop = ShopProfile(
        name=row["name"] if row else "",
        owner_name=row["owner_name"] if row and "owner_name" in keys else "",
        gstin=row["gstin"] if row else "",
        phone=row["phone"] if row else "",
        address=row["address"] if row else "",
        country=row["country"] if row and "country" in keys else "India",
        currency=row["currency"] if row else "INR",
        signature=row["signature"] if row and "signature" in keys else "",
        is_configured=bool(row["is_configured"]) if row and "is_configured" in keys else False,
        has_pin=bool(row["owner_pin_hash"]) if row else False
    )

    # 2. Suppliers
    cur.execute("SELECT id, name, phone FROM suppliers")
    suppliers = [Supplier(id=r["id"], name=r["name"], phone=r["phone"]) for r in cur.fetchall()]

    # 3. Products
    cur.execute("SELECT id, sku, name, category, price, cost, gst, stock, reorder, supplier_id, unit FROM products ORDER BY name ASC")
    products = [
        Product(
            id=r["id"],
            sku=r["sku"],
            name=r["name"],
            category=r["category"],
            price=r["price"],
            cost=r["cost"],
            gst=r["gst"],
            stock=r["stock"],
            reorder=r["reorder"],
            supplier_id=r["supplier_id"],
            unit=r["unit"]
        ) for r in cur.fetchall()
    ]

    # 4. Customers
    cur.execute("SELECT id, name, phone, address, consent, tags, created_at FROM customers ORDER BY name ASC")
    customers = [
        Customer(
            id=r["id"],
            name=r["name"],
            phone=r["phone"],
            address=r["address"] if "address" in r.keys() else "",
            consent=bool(r["consent"]),
            tags=json.loads(r["tags"] or "[]"),
            created_at=r["created_at"]
        ) for r in cur.fetchall()
    ]

    # 5. Invoices & lines
    cur.execute("SELECT id, number, at, customer_id, customer_name, customer_phone, customer_address, bill_discount, total, tax, payment FROM invoices ORDER BY at DESC")
    inv_rows = cur.fetchall()

    cur.execute("SELECT invoice_id, product_id, name, price, qty, gst, discount_pct FROM invoice_lines")
    lines_by_inv = {}
    for lr in cur.fetchall():
        inv_id = lr["invoice_id"]
        if inv_id not in lines_by_inv:
            lines_by_inv[inv_id] = []
        lines_by_inv[inv_id].append(InvoiceLine(
            product_id=lr["product_id"],
            name=lr["name"],
            price=lr["price"],
            qty=lr["qty"],
            gst=lr["gst"],
            discount_pct=lr["discount_pct"]
        ))

    invoices = [
        Invoice(
            id=r["id"],
            number=r["number"],
            at=r["at"],
            customer_id=r["customer_id"],
            customer_name=r["customer_name"] if "customer_name" in r.keys() else "",
            customer_phone=r["customer_phone"] if "customer_phone" in r.keys() else "",
            customer_address=r["customer_address"] if "customer_address" in r.keys() else "",
            lines=lines_by_inv.get(r["id"], []),
            bill_discount=r["bill_discount"],
            total=r["total"],
            tax=r["tax"],
            payment=r["payment"]
        ) for r in inv_rows
    ]

    # 6. Purchases
    cur.execute("SELECT id, at, supplier_id, product_id, qty, cost FROM purchases ORDER BY at DESC")
    purchases = [
        Purchase(
            id=r["id"],
            at=r["at"],
            supplier_id=r["supplier_id"],
            product_id=r["product_id"],
            qty=r["qty"],
            cost=r["cost"]
        ) for r in cur.fetchall()
    ]

    # 7. Campaigns
    cur.execute("SELECT id, name, channel, message, segment, status, created_at, sent_to, conversions FROM campaigns ORDER BY created_at DESC")
    campaigns = [
        Campaign(
            id=r["id"],
            name=r["name"],
            channel=r["channel"],
            message=r["message"],
            segment=r["segment"],
            status=r["status"],
            created_at=r["created_at"],
            sent_to=r["sent_to"],
            conversions=r["conversions"]
        ) for r in cur.fetchall()
    ]

    # 8. Audit log
    cur.execute("SELECT at, action, detail FROM audit_log ORDER BY id DESC LIMIT 500")
    audit = [AuditEntry(at=r["at"], action=r["action"], detail=r["detail"]) for r in cur.fetchall()]

    conn.close()
    return AppStateSnapshot(
        products=products,
        suppliers=suppliers,
        customers=customers,
        invoices=invoices,
        purchases=purchases,
        campaigns=campaigns,
        audit=audit,
        shop=shop
    )

def create_invoice(
    customer_id: Optional[str],
    lines: List[InvoiceLine],
    bill_discount: int,
    total: int,
    tax: int,
    payment: str,
    customer_name: Optional[str] = "",
    customer_phone: Optional[str] = "",
    customer_address: Optional[str] = ""
) -> Invoice:
    conn = get_connection()
    cur = conn.cursor()
    inv_id = str(uuid.uuid4())
    now = int(time.time() * 1000)

    try:
        cur.execute("BEGIN IMMEDIATE")
        cur.execute("SELECT COUNT(*) FROM invoices")
        count = cur.fetchone()[0]
        number = f"INV-{count + 1:05d}"

        cur.execute(
            "INSERT INTO invoices (id, number, at, customer_id, customer_name, customer_phone, customer_address, bill_discount, total, tax, payment) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (inv_id, number, now, customer_id, customer_name or "", customer_phone or "", customer_address or "", bill_discount, total, tax, payment)
        )

        for l in lines:
            cur.execute(
                "INSERT INTO invoice_lines (invoice_id, product_id, name, price, qty, gst, discount_pct) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (inv_id, l.product_id, l.name, l.price, l.qty, l.gst, l.discount_pct)
            )
            cur.execute(
                "UPDATE products SET stock = stock - ? WHERE id = ?",
                (l.qty, l.product_id)
            )

        # Auto-create or update customer in database if phone is provided
        if customer_phone and customer_phone.strip():
            clean_phone = customer_phone.strip()
            cur.execute("SELECT id FROM customers WHERE phone = ?", (clean_phone,))
            c_row = cur.fetchone()
            if not c_row:
                c_id = customer_id or str(uuid.uuid4())
                c_name = (customer_name or "").strip() or "Customer"
                c_addr = (customer_address or "").strip()
                cur.execute(
                    "INSERT INTO customers (id, name, phone, address, consent, tags, created_at) VALUES (?, ?, ?, ?, 1, '[]', ?)",
                    (c_id, c_name, clean_phone, c_addr, now)
                )
                log_audit(conn, "Customer added", c_name)
                customer_id = c_id
            elif customer_address and customer_address.strip():
                cur.execute("UPDATE customers SET address = ? WHERE id = ?", (customer_address.strip(), c_row["id"]))

        detail = f"{number} · Rs {total / 100.0:.2f} · {payment}"
        log_audit(conn, "Invoice", detail)
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise e

    conn.close()
    return Invoice(
        id=inv_id,
        number=number,
        at=now,
        customer_id=customer_id,
        customer_name=customer_name or "",
        customer_phone=customer_phone or "",
        customer_address=customer_address or "",
        lines=lines,
        bill_discount=bill_discount,
        total=total,
        tax=tax,
        payment=payment
    )

def update_invoice(invoice_id: str, customer_name: str, customer_phone: str, customer_address: str, payment: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE invoices SET customer_name = ?, customer_phone = ?, customer_address = ?, payment = ? WHERE id = ?",
        (customer_name, customer_phone, customer_address, payment, invoice_id)
    )
    log_audit(conn, "Invoice updated", f"ID: {invoice_id}")
    conn.commit()
    conn.close()

def delete_invoice(invoice_id: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT number FROM invoices WHERE id = ?", (invoice_id,))
    r = cur.fetchone()
    num = r["number"] if r else invoice_id

    # Restore inventory stock for lines
    cur.execute("SELECT product_id, qty FROM invoice_lines WHERE invoice_id = ?", (invoice_id,))
    for row in cur.fetchall():
        cur.execute("UPDATE products SET stock = stock + ? WHERE id = ?", (row["qty"], row["product_id"]))

    cur.execute("DELETE FROM invoice_lines WHERE invoice_id = ?", (invoice_id,))
    cur.execute("DELETE FROM invoices WHERE id = ?", (invoice_id,))
    log_audit(conn, "Invoice deleted", num)
    conn.commit()
    conn.close()

def upsert_product(product: Product):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM products WHERE id = ?", (product.id,))
    exists = cur.fetchone()[0] > 0

    if exists:
        cur.execute(
            "UPDATE products SET sku = ?, name = ?, category = ?, price = ?, cost = ?, gst = ?, stock = ?, reorder = ?, supplier_id = ?, unit = ? WHERE id = ?",
            (product.sku, product.name, product.category, product.price, product.cost, product.gst, product.stock, product.reorder, product.supplier_id, product.unit, product.id)
        )
        log_audit(conn, "Product updated", product.name)
    else:
        cur.execute(
            "INSERT INTO products (id, sku, name, category, price, cost, gst, stock, reorder, supplier_id, unit) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (product.id, product.sku, product.name, product.category, product.price, product.cost, product.gst, product.stock, product.reorder, product.supplier_id, product.unit)
        )
        log_audit(conn, "Product added", product.name)

    conn.commit()
    conn.close()

def record_purchase(supplier_id: str, product_id: str, qty: int, cost: int) -> Purchase:
    conn = get_connection()
    cur = conn.cursor()
    p_id = str(uuid.uuid4())
    now = int(time.time() * 1000)

    cur.execute(
        "INSERT INTO purchases (id, at, supplier_id, product_id, qty, cost) VALUES (?, ?, ?, ?, ?, ?)",
        (p_id, now, supplier_id, product_id, qty, cost)
    )
    cur.execute(
        "UPDATE products SET stock = stock + ?, cost = ? WHERE id = ?",
        (qty, cost, product_id)
    )

    cur.execute("SELECT name FROM products WHERE id = ?", (product_id,))
    p_row = cur.fetchone()
    name = p_row["name"] if p_row else "Product"

    log_audit(conn, "Purchase", f"{qty} x {name}")
    conn.commit()
    conn.close()

    return Purchase(
        id=p_id,
        at=now,
        supplier_id=supplier_id,
        product_id=product_id,
        qty=qty,
        cost=cost
    )

def upsert_customer(customer: Customer):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM customers WHERE id = ?", (customer.id,))
    exists = cur.fetchone()[0] > 0
    tags_json = json.dumps(customer.tags)

    if exists:
        cur.execute(
            "UPDATE customers SET name = ?, phone = ?, address = ?, consent = ?, tags = ? WHERE id = ?",
            (customer.name, customer.phone, customer.address or "", int(customer.consent), tags_json, customer.id)
        )
        log_audit(conn, "Customer updated", customer.name)
    else:
        cur.execute(
            "INSERT INTO customers (id, name, phone, address, consent, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (customer.id, customer.name, customer.phone, customer.address or "", int(customer.consent), tags_json, customer.created_at)
        )
        log_audit(conn, "Customer added", customer.name)

    conn.commit()
    conn.close()

def create_campaign(campaign: Campaign):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO campaigns (id, name, channel, message, segment, status, created_at, sent_to, conversions) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (campaign.id, campaign.name, campaign.channel, campaign.message, campaign.segment, campaign.status, campaign.created_at, campaign.sent_to, campaign.conversions)
    )
    log_audit(conn, "Campaign submitted", campaign.name)
    conn.commit()
    conn.close()

def update_campaign_status(campaign_id: str, status: str, sent_to: Optional[int] = None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE campaigns SET status = ?, sent_to = COALESCE(?, sent_to) WHERE id = ?",
        (status, sent_to, campaign_id)
    )
    cur.execute("SELECT name FROM campaigns WHERE id = ?", (campaign_id,))
    row = cur.fetchone()
    name = row["name"] if row else "Campaign"

    action = "Campaign approved & sent" if status == "Sent" else f"Campaign {status.lower()}"
    log_audit(conn, action, name)
    conn.commit()
    conn.close()

def verify_owner_pin(pin: str) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT owner_pin_hash FROM shop_profile LIMIT 1")
    row = cur.fetchone()
    conn.close()

    if not row or not row["owner_pin_hash"]:
        return True
    return row["owner_pin_hash"] == hash_pin(pin)

def set_owner_pin(current_pin: Optional[str], new_pin: Optional[str]) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT owner_pin_hash FROM shop_profile LIMIT 1")
    row = cur.fetchone()
    existing_hash = row["owner_pin_hash"] if row else None

    if existing_hash:
        if not current_pin or hash_pin(current_pin) != existing_hash:
            conn.close()
            return False

    new_hash = hash_pin(new_pin) if new_pin else None
    cur.execute("UPDATE shop_profile SET owner_pin_hash = ?", (new_hash,))
    log_audit(conn, "Security", "Owner PIN updated")
    conn.commit()
    conn.close()
    return True

def reset_db_data() -> AppStateSnapshot:
    conn = get_connection()
    cur = conn.cursor()
    cur.executescript("""
        DELETE FROM invoice_lines;
        DELETE FROM invoices;
        DELETE FROM purchases;
        DELETE FROM products;
        DELETE FROM suppliers;
        DELETE FROM customers;
        DELETE FROM campaigns;
        DELETE FROM audit_log;
        DELETE FROM shop_profile;
    """)
    conn.commit()
    seed_db(conn)
    conn.close()
    return query_full_snapshot()

def setup_shop_profile(req: SetupShopRequest) -> AppStateSnapshot:
    conn = get_connection()
    cur = conn.cursor()
    now = int(time.time() * 1000)

    pin_hash = hash_pin(req.pin) if req.pin and req.pin.strip() else None

    cur.execute("SELECT id FROM shop_profile LIMIT 1")
    row = cur.fetchone()
    if row:
        cur.execute(
            "UPDATE shop_profile SET name = ?, owner_name = ?, gstin = ?, phone = ?, address = ?, country = ?, currency = ?, signature = ?, is_configured = 1, owner_pin_hash = COALESCE(?, owner_pin_hash) WHERE id = ?",
            (req.name, req.owner_name, req.gstin, req.phone, req.address, req.country, req.currency, req.signature, pin_hash, row["id"])
        )
    else:
        cur.execute(
            "INSERT INTO shop_profile (id, name, owner_name, gstin, phone, address, country, currency, signature, is_configured, owner_pin_hash, created_at) "
            "VALUES ('shop_1', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            (req.name, req.owner_name, req.gstin, req.phone, req.address, req.country, req.currency, req.signature, pin_hash, now)
        )

    log_audit(conn, "Setup", f"Shop profile configured for {req.name}")
    conn.commit()
    conn.close()
    return query_full_snapshot()

def reset_database() -> AppStateSnapshot:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM invoice_lines")
    cur.execute("DELETE FROM invoices")
    cur.execute("DELETE FROM purchases")
    cur.execute("DELETE FROM products")
    cur.execute("DELETE FROM customers")
    cur.execute("DELETE FROM campaigns")
    cur.execute("DELETE FROM suppliers")
    cur.execute("DELETE FROM audit_log")
    cur.execute("DELETE FROM shop_profile")
    now = int(time.time() * 1000)
    cur.execute(
        "INSERT INTO shop_profile (id, name, owner_name, gstin, phone, address, country, currency, signature, is_configured, created_at) "
        "VALUES ('shop_1', '', '', '', '', '', 'India', 'INR', '', 0, ?)",
        (now,)
    )
    log_audit(conn, "Reset", "All store data was wiped and reset to fresh installation state.")
    conn.commit()
    conn.close()
    return query_full_snapshot()

def update_shop_profile(req: UpdateShopRequest) -> ShopProfile:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM shop_profile LIMIT 1")
    row = cur.fetchone()
    if not row:
        conn.close()
        raise ValueError("Shop profile not found")

    keys = row.keys()
    name = req.name if req.name is not None else row["name"]
    owner_name = req.owner_name if req.owner_name is not None else (row["owner_name"] if "owner_name" in keys else "")
    gstin = req.gstin if req.gstin is not None else row["gstin"]
    phone = req.phone if req.phone is not None else row["phone"]
    address = req.address if req.address is not None else row["address"]
    country = req.country if req.country is not None else (row["country"] if "country" in keys else "India")
    currency = req.currency if req.currency is not None else row["currency"]
    signature = req.signature if req.signature is not None else (row["signature"] if "signature" in keys else "")

    cur.execute(
        "UPDATE shop_profile SET name = ?, owner_name = ?, gstin = ?, phone = ?, address = ?, country = ?, currency = ?, signature = ? WHERE id = ?",
        (name, owner_name, gstin, phone, address, country, currency, signature, row["id"])
    )
    log_audit(conn, "Profile", "Shop profile details updated")
    conn.commit()
    conn.close()
    return query_full_snapshot().shop

def get_messaging_config() -> MessagingConfig:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM messaging_config WHERE id = 'default' LIMIT 1")
    row = cur.fetchone()
    conn.close()

    if not row:
        return MessagingConfig()

    keys = row.keys()
    return MessagingConfig(
        whatsapp_provider=row["whatsapp_provider"] if "whatsapp_provider" in keys else "none",
        meta_access_token=row["meta_access_token"] if "meta_access_token" in keys and row["meta_access_token"] else "",
        meta_phone_number_id=row["meta_phone_number_id"] if "meta_phone_number_id" in keys and row["meta_phone_number_id"] else "",
        meta_waba_id=row["meta_waba_id"] if "meta_waba_id" in keys and row["meta_waba_id"] else "",
        meta_template_name=row["meta_template_name"] if "meta_template_name" in keys and row["meta_template_name"] else "dukaan_receipt",
        sms_provider=row["sms_provider"] if "sms_provider" in keys else "none",
        sms_auth_key=row["sms_auth_key"] if "sms_auth_key" in keys and row["sms_auth_key"] else "",
        sms_sender_id=row["sms_sender_id"] if "sms_sender_id" in keys and row["sms_sender_id"] else "",
        sms_entity_id=row["sms_entity_id"] if "sms_entity_id" in keys and row["sms_entity_id"] else "",
        sms_template_id=row["sms_template_id"] if "sms_template_id" in keys and row["sms_template_id"] else "",
        twilio_account_sid=row["twilio_account_sid"] if "twilio_account_sid" in keys and row["twilio_account_sid"] else "",
        twilio_auth_token=row["twilio_auth_token"] if "twilio_auth_token" in keys and row["twilio_auth_token"] else "",
        twilio_phone_number=row["twilio_phone_number"] if "twilio_phone_number" in keys and row["twilio_phone_number"] else "",
        twilio_whatsapp_number=row["twilio_whatsapp_number"] if "twilio_whatsapp_number" in keys and row["twilio_whatsapp_number"] else "",
        auto_send_whatsapp=bool(row["auto_send_whatsapp"]) if "auto_send_whatsapp" in keys else False,
        auto_send_sms=bool(row["auto_send_sms"]) if "auto_send_sms" in keys else False,
        receipt_footer=row["receipt_footer"] if "receipt_footer" in keys and row["receipt_footer"] else "Thank you for shopping with us! Visit again.",
        updated_at=row["updated_at"] if "updated_at" in keys and row["updated_at"] else 0,
    )

def save_messaging_config(cfg: MessagingConfig) -> MessagingConfig:
    conn = get_connection()
    cur = conn.cursor()
    now = int(time.time() * 1000)

    cur.execute("""
        INSERT INTO messaging_config (
            id, whatsapp_provider, meta_access_token, meta_phone_number_id, meta_waba_id,
            meta_template_name, sms_provider, sms_auth_key, sms_sender_id, sms_entity_id,
            sms_template_id, twilio_account_sid, twilio_auth_token, twilio_phone_number,
            twilio_whatsapp_number, auto_send_whatsapp, auto_send_sms, receipt_footer, updated_at
        ) VALUES (
            'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        ) ON CONFLICT(id) DO UPDATE SET
            whatsapp_provider = excluded.whatsapp_provider,
            meta_access_token = excluded.meta_access_token,
            meta_phone_number_id = excluded.meta_phone_number_id,
            meta_waba_id = excluded.meta_waba_id,
            meta_template_name = excluded.meta_template_name,
            sms_provider = excluded.sms_provider,
            sms_auth_key = excluded.sms_auth_key,
            sms_sender_id = excluded.sms_sender_id,
            sms_entity_id = excluded.sms_entity_id,
            sms_template_id = excluded.sms_template_id,
            twilio_account_sid = excluded.twilio_account_sid,
            twilio_auth_token = excluded.twilio_auth_token,
            twilio_phone_number = excluded.twilio_phone_number,
            twilio_whatsapp_number = excluded.twilio_whatsapp_number,
            auto_send_whatsapp = excluded.auto_send_whatsapp,
            auto_send_sms = excluded.auto_send_sms,
            receipt_footer = excluded.receipt_footer,
            updated_at = excluded.updated_at
    """, (
        cfg.whatsapp_provider, cfg.meta_access_token, cfg.meta_phone_number_id, cfg.meta_waba_id,
        cfg.meta_template_name, cfg.sms_provider, cfg.sms_auth_key, cfg.sms_sender_id, cfg.sms_entity_id,
        cfg.sms_template_id, cfg.twilio_account_sid, cfg.twilio_auth_token, cfg.twilio_phone_number,
        cfg.twilio_whatsapp_number, 1 if cfg.auto_send_whatsapp else 0, 1 if cfg.auto_send_sms else 0,
        cfg.receipt_footer, now
    ))
    log_audit(conn, "Messaging", f"Messaging config updated (WhatsApp: {cfg.whatsapp_provider}, SMS: {cfg.sms_provider})")
    conn.commit()
    conn.close()
    return get_messaging_config()

def get_ai_config() -> AIConfig:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM ai_config WHERE id = 'default' LIMIT 1")
    row = cur.fetchone()
    conn.close()

    if not row:
        return AIConfig()

    keys = row.keys()
    return AIConfig(
        mode=row["mode"] if "mode" in keys else "heuristic",
        cloud_provider=row["cloud_provider"] if "cloud_provider" in keys else "gemini",
        api_key=row["api_key"] if "api_key" in keys and row["api_key"] else "",
        model_path=row["model_path"] if "model_path" in keys and row["model_path"] else "",
        preferred_language=row["preferred_language"] if "preferred_language" in keys else "hinglish",
        updated_at=row["updated_at"] if "updated_at" in keys and row["updated_at"] else 0,
    )

def save_ai_config(cfg: AIConfig) -> AIConfig:
    conn = get_connection()
    cur = conn.cursor()
    now = int(time.time() * 1000)

    cur.execute("""
        INSERT INTO ai_config (
            id, mode, cloud_provider, api_key, model_path, preferred_language, updated_at
        ) VALUES (
            'default', ?, ?, ?, ?, ?, ?
        ) ON CONFLICT(id) DO UPDATE SET
            mode = excluded.mode,
            cloud_provider = excluded.cloud_provider,
            api_key = excluded.api_key,
            model_path = excluded.model_path,
            preferred_language = excluded.preferred_language,
            updated_at = excluded.updated_at
    """, (
        cfg.mode, cfg.cloud_provider, cfg.api_key, cfg.model_path,
        cfg.preferred_language, now
    ))
    log_audit(conn, "AI", f"AI engine configuration updated (Mode: {cfg.mode})")
    conn.commit()
    conn.close()
    return get_ai_config()

def bulk_upsert_products(products: List[Product], conflict_mode: str = "upsert") -> BulkImportResponse:
    conn = get_connection()
    cur = conn.cursor()
    imported = 0
    updated = 0
    skipped = 0
    errors = []

    # Ensure a default supplier exists
    cur.execute("SELECT id FROM suppliers LIMIT 1")
    s_row = cur.fetchone()
    default_supplier_id = s_row["id"] if s_row else "s1"
    if not s_row:
        cur.execute("INSERT OR IGNORE INTO suppliers (id, name, phone) VALUES ('s1', 'General Wholesaler', '9999999999')")

    try:
        for p in products:
            if not p.name or not p.name.strip():
                skipped += 1
                continue

            p_id = p.id if p.id and p.id.strip() else str(uuid.uuid4())[:8]
            sku = (p.sku or "").strip()
            sup_id = p.supplier_id if p.supplier_id and p.supplier_id.strip() else default_supplier_id

            # Check existence by SKU or ID
            existing_row = None
            if sku:
                cur.execute("SELECT id, name FROM products WHERE sku = ?", (sku,))
                existing_row = cur.fetchone()
            if not existing_row and p_id:
                cur.execute("SELECT id, name FROM products WHERE id = ?", (p_id,))
                existing_row = cur.fetchone()

            if existing_row:
                if conflict_mode == "skip":
                    skipped += 1
                    continue
                target_id = existing_row["id"]
                cur.execute(
                    "UPDATE products SET sku = ?, name = ?, category = ?, price = ?, cost = ?, gst = ?, stock = ?, reorder = ?, supplier_id = ?, unit = ? WHERE id = ?",
                    (sku or existing_row["id"], p.name.strip(), p.category or "General", p.price, p.cost, p.gst, p.stock, p.reorder, sup_id, p.unit or "pc", target_id)
                )
                updated += 1
            else:
                cur.execute(
                    "INSERT INTO products (id, sku, name, category, price, cost, gst, stock, reorder, supplier_id, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (p_id, sku, p.name.strip(), p.category or "General", p.price, p.cost, p.gst, p.stock, p.reorder, sup_id, p.unit or "pc")
                )
                imported += 1

        log_audit(conn, "Bulk products imported", f"Imported: {imported}, Updated: {updated}, Skipped: {skipped}")
        conn.commit()
    except Exception as e:
        conn.rollback()
        errors.append(str(e))
        return BulkImportResponse(success=False, imported_count=0, updated_count=0, skipped_count=len(products), errors=errors)
    finally:
        conn.close()

    return BulkImportResponse(success=True, imported_count=imported, updated_count=updated, skipped_count=skipped, errors=errors)

def bulk_upsert_customers(customers: List[Customer], conflict_mode: str = "upsert") -> BulkImportResponse:
    conn = get_connection()
    cur = conn.cursor()
    imported = 0
    updated = 0
    skipped = 0
    errors = []

    try:
        now = int(time.time() * 1000)
        for c in customers:
            if not c.name or not c.name.strip():
                skipped += 1
                continue

            c_id = c.id if c.id and c.id.strip() else str(uuid.uuid4())[:8]
            phone = (c.phone or "").strip()
            tags_json = json.dumps(c.tags if c.tags else ["Regular"])
            consent_int = 1 if c.consent else 0
            created_at = c.created_at if c.created_at else now

            # Check existence by phone or ID
            existing_row = None
            if phone:
                cur.execute("SELECT id, name FROM customers WHERE phone = ?", (phone,))
                existing_row = cur.fetchone()
            if not existing_row and c_id:
                cur.execute("SELECT id, name FROM customers WHERE id = ?", (c_id,))
                existing_row = cur.fetchone()

            if existing_row:
                if conflict_mode == "skip":
                    skipped += 1
                    continue
                target_id = existing_row["id"]
                cur.execute(
                    "UPDATE customers SET name = ?, phone = ?, address = ?, consent = ?, tags = ? WHERE id = ?",
                    (c.name.strip(), phone, (c.address or "").strip(), consent_int, tags_json, target_id)
                )
                updated += 1
            else:
                cur.execute(
                    "INSERT INTO customers (id, name, phone, address, consent, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (c_id, c.name.strip(), phone, (c.address or "").strip(), consent_int, tags_json, created_at)
                )
                imported += 1

        log_audit(conn, "Bulk customers imported", f"Imported: {imported}, Updated: {updated}, Skipped: {skipped}")
        conn.commit()
    except Exception as e:
        conn.rollback()
        errors.append(str(e))
        return BulkImportResponse(success=False, imported_count=0, updated_count=0, skipped_count=len(customers), errors=errors)
    finally:
        conn.close()

    return BulkImportResponse(success=True, imported_count=imported, updated_count=updated, skipped_count=skipped, errors=errors)

ensure_initialized()

