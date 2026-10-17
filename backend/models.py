from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

class ShopProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = ""
    owner_name: str = Field("", alias="ownerName")
    gstin: str = ""
    phone: Optional[str] = None
    address: Optional[str] = None
    country: str = "India"
    currency: str = "INR"
    signature: Optional[str] = None
    is_configured: bool = Field(False, alias="isConfigured")
    has_pin: bool = Field(False, alias="hasPin")

class SetupShopRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    owner_name: str = Field("", alias="ownerName")
    gstin: str = ""
    phone: Optional[str] = None
    address: Optional[str] = None
    country: str = "India"
    currency: str = "INR"
    signature: Optional[str] = None
    pin: Optional[str] = None
    load_sample_catalog: bool = Field(True, alias="loadSampleCatalog")

class UpdateShopRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: Optional[str] = None
    owner_name: Optional[str] = Field(None, alias="ownerName")
    gstin: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    signature: Optional[str] = None

class Product(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    sku: str
    name: str
    category: str
    price: int  # Integer paise
    cost: int   # Integer paise
    gst: int    # GST rate % (0, 5, 12, 18, 28)
    stock: int
    reorder: int
    supplier_id: str = Field(..., alias="supplierId")
    unit: str = "pc"

class Supplier(BaseModel):
    id: str
    name: str
    phone: str

class Customer(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    phone: str
    address: Optional[str] = ""
    consent: bool
    tags: List[str] = []
    created_at: int = Field(..., alias="createdAt")

class InvoiceLine(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    product_id: str = Field(..., alias="productId")
    name: str
    price: int  # Integer paise
    qty: int
    gst: int
    discount_pct: int = Field(0, alias="discountPct")

class Invoice(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    number: str
    at: int
    customer_id: Optional[str] = Field(None, alias="customerId")
    customer_name: Optional[str] = Field(None, alias="customerName")
    customer_phone: Optional[str] = Field(None, alias="customerPhone")
    customer_address: Optional[str] = Field(None, alias="customerAddress")
    lines: List[InvoiceLine]
    bill_discount: int = Field(0, alias="billDiscount")
    total: int  # Integer paise
    tax: int    # Integer paise
    payment: str  # 'Cash' | 'UPI' | 'Card' | 'Credit'

class CreateInvoiceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    customer_id: Optional[str] = Field(None, alias="customerId")
    customer_name: Optional[str] = Field(None, alias="customerName")
    customer_phone: Optional[str] = Field(None, alias="customerPhone")
    customer_address: Optional[str] = Field(None, alias="customerAddress")
    lines: List[InvoiceLine]
    bill_discount: int = Field(0, alias="billDiscount")
    total: int
    tax: int
    payment: str

class UpdateInvoiceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    customer_name: Optional[str] = Field(None, alias="customerName")
    customer_phone: Optional[str] = Field(None, alias="customerPhone")
    customer_address: Optional[str] = Field(None, alias="customerAddress")
    payment: Optional[str] = None

class Purchase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    at: int
    supplier_id: str = Field(..., alias="supplierId")
    product_id: str = Field(..., alias="productId")
    qty: int
    cost: int

class RecordPurchaseRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    supplier_id: str = Field(..., alias="supplierId")
    product_id: str = Field(..., alias="productId")
    qty: int
    cost: int

class Campaign(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    channel: str  # 'WhatsApp' | 'SMS'
    message: str
    segment: str
    status: str   # 'Draft' | 'Pending approval' | 'Sent' | 'Rejected'
    created_at: int = Field(..., alias="createdAt")
    sent_to: Optional[int] = Field(None, alias="sentTo")
    conversions: Optional[int] = None

class UpdateCampaignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: str
    sent_to: Optional[int] = Field(None, alias="sentTo")

class AuditEntry(BaseModel):
    at: int
    action: str
    detail: str

class AppStateSnapshot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    products: List[Product]
    suppliers: List[Supplier]
    customers: List[Customer]
    invoices: List[Invoice]
    purchases: List[Purchase]
    campaigns: List[Campaign]
    audit: List[AuditEntry]
    shop: ShopProfile

class VerifyPinRequest(BaseModel):
    pin: str

class SetPinRequest(BaseModel):
    current_pin: Optional[str] = Field(None, alias="currentPin")
    new_pin: Optional[str] = Field(None, alias="newPin")

class MessagingConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    whatsapp_provider: str = Field("none", alias="whatsappProvider")  # 'none' | 'wa_me' | 'meta_cloud' | 'twilio'
    meta_access_token: str = Field("", alias="metaAccessToken")
    meta_phone_number_id: str = Field("", alias="metaPhoneNumberId")
    meta_waba_id: str = Field("", alias="metaWabaId")
    meta_template_name: str = Field("dukaan_receipt", alias="metaTemplateName")
    sms_provider: str = Field("none", alias="smsProvider")  # 'none' | 'msg91' | 'fast2sms' | 'twilio'
    sms_auth_key: str = Field("", alias="smsAuthKey")
    sms_sender_id: str = Field("", alias="smsSenderId")
    sms_entity_id: str = Field("", alias="smsEntityId")
    sms_template_id: str = Field("", alias="smsTemplateId")
    twilio_account_sid: str = Field("", alias="twilioAccountSid")
    twilio_auth_token: str = Field("", alias="twilioAuthToken")
    twilio_phone_number: str = Field("", alias="twilioPhoneNumber")
    twilio_whatsapp_number: str = Field("", alias="twilioWhatsappNumber")
    auto_send_whatsapp: bool = Field(False, alias="autoSendWhatsapp")
    auto_send_sms: bool = Field(False, alias="autoSendSms")
    receipt_footer: str = Field("Thank you for shopping with us! Visit again.", alias="receiptFooter")
    updated_at: int = Field(0, alias="updatedAt")

class TestMessagingRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    channel: str  # 'whatsapp' | 'sms'
    phone: str
    message: Optional[str] = None

class SendInvoiceReceiptRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    invoice_id: str = Field(..., alias="invoiceId")
    phone: str
    customer_name: Optional[str] = Field("", alias="customerName")
    channel: str = "whatsapp"  # 'whatsapp' | 'sms' | 'both'

class BroadcastRecipient(BaseModel):
    phone: str
    name: str = ""

class BroadcastCampaignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    campaign_id: str = Field(..., alias="campaignId")
    channel: str  # 'WhatsApp' | 'SMS'
    message: str
    recipients: List[BroadcastRecipient]

class AIConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    mode: str = "heuristic"  # 'heuristic' | 'local_gguf' | 'cloud'
    cloud_provider: str = Field("gemini", alias="cloudProvider")  # 'gemini' | 'groq'
    api_key: str = Field("", alias="apiKey")
    model_path: str = Field("", alias="modelPath")
    preferred_language: str = Field("hinglish", alias="preferredLanguage")  # 'hinglish' | 'hindi' | 'english'
    updated_at: int = Field(0, alias="updatedAt")

class AIStatus(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    mode: str
    active_model_name: str = Field("Heuristic Baseline", alias="activeModelName")
    preferred_language: str = Field("hinglish", alias="preferredLanguage")
    local_model_installed: bool = Field(False, alias="localModelInstalled")
    local_model_path: str = Field("", alias="localModelPath")
    cloud_configured: bool = Field(False, alias="cloudConfigured")
    downloading: bool = False
    download_progress: float = Field(0.0, alias="downloadProgress")

class AIRecommendation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    archetype: str  # 'replenishment_overdue' | 'win_back_inactive' | 'surplus_clearance'
    title: str
    rationale: str
    eligible_customer_count: int = Field(..., alias="eligibleCustomerCount")
    eligible_customer_ids: List[str] = Field(default_factory=list, alias="eligibleCustomerIds")
    suggested_discount_pct: int = Field(0, alias="suggestedDiscountPct")
    suggested_channel: str = Field("WhatsApp", alias="suggestedChannel")
    copy_hinglish: str = Field("", alias="copyHinglish")
    copy_hindi: str = Field("", alias="copyHindi")
    copy_english: str = Field("", alias="copyEnglish")
    tag_filter: Optional[str] = Field(None, alias="tagFilter")

class RefineCopyRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    message: str
    target_language: str = Field("hinglish", alias="targetLanguage")  # 'hinglish' | 'hindi' | 'english'
    tone: str = "friendly"  # 'friendly' | 'urgent' | 'festive'
    store_name: str = Field("", alias="storeName")

class RefineCopyResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    message: str

class AIAssistantMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    role: str  # 'user' | 'assistant'
    content: str
    timestamp: Optional[int] = None

class AIAssistantChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    query: str
    history: List[AIAssistantMessage] = Field(default_factory=list)
    language: Optional[str] = "hinglish"  # 'hinglish' | 'hindi' | 'english'

class AIAssistantMetricData(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    label: str
    value: str
    subtext: Optional[str] = None
    delta: Optional[str] = None

class AIAssistantChatResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    reply: str
    metrics: List[AIAssistantMetricData] = Field(default_factory=list)
    suggested_actions: List[str] = Field(default_factory=list, alias="suggestedActions")
    sources: List[str] = Field(default_factory=list)

class BulkImportProductsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    products: List[Product]
    conflict_mode: str = Field("upsert", alias="conflictMode")

class BulkImportCustomersRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    customers: List[Customer]
    conflict_mode: str = Field("upsert", alias="conflictMode")

class BulkImportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    success: bool
    imported_count: int = Field(0, alias="importedCount")
    updated_count: int = Field(0, alias="updatedCount")
    skipped_count: int = Field(0, alias="skippedCount")
    errors: List[str] = Field(default_factory=list)


