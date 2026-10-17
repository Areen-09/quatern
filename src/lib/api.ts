import {
  State,
  Invoice,
  Product,
  Customer,
  Campaign,
  Purchase,
  ShopProfile,
} from "./store"

const API_BASE =
  typeof window !== "undefined" &&
  (window.location.port === "8443" || window.location.port === "5173")
    ? "http://127.0.0.1:8000"
    : ""

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && "pywebview" in window

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeoutId)
    if (res.ok) {
      return (await res.json()) as T
    } else {
      console.warn(`[Quatern API] ${endpoint} returned ${res.status}`)
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    console.warn(
      `[Quatern API] ${endpoint} request failed:`,
      err?.message || err,
    )
  }
  return null
}

export interface SetupShopPayload {
  name: string
  ownerName: string
  gstin?: string
  phone?: string
  address?: string
  country: string
  currency?: string
  signature?: string
  pin?: string
  loadSampleCatalog: boolean
}

export async function setupShop(
  payload: SetupShopPayload,
): Promise<State | null> {
  return await apiRequest<State>("/api/shop/setup", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updateShop(
  payload: Partial<ShopProfile>,
): Promise<ShopProfile | null> {
  return await apiRequest<ShopProfile>("/api/shop", {
    method: "PUT",
    body: JSON.stringify(payload),
  })
}

export async function fetchAppState(): Promise<State | null> {
  return await apiRequest<State>("/api/state")
}

export async function resetData(): Promise<State | null> {
  return await apiRequest<State>("/api/state/reset", {
    method: "POST",
  })
}

export async function createInvoice(
  inv: Omit<Invoice, "id" | "number" | "at">,
): Promise<Invoice | null> {
  return await apiRequest<Invoice>("/api/invoices", {
    method: "POST",
    body: JSON.stringify({
      customerId: inv.customerId ?? null,
      customerName: inv.customerName ?? "",
      customerPhone: inv.customerPhone ?? "",
      customerAddress: inv.customerAddress ?? "",
      lines: inv.lines,
      billDiscount: inv.billDiscount,
      total: inv.total,
      tax: inv.tax,
      payment: inv.payment,
    }),
  })
}

export async function updateInvoice(
  invoiceId: string,
  patch: {
    customerName?: string
    customerPhone?: string
    customerAddress?: string
    payment?: string
  },
): Promise<boolean> {
  const res = await apiRequest<{ ok: boolean }>(`/api/invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
  return Boolean(res?.ok)
}

export async function deleteInvoice(invoiceId: string): Promise<boolean> {
  const res = await apiRequest<{ ok: boolean }>(`/api/invoices/${invoiceId}`, {
    method: "DELETE",
  })
  return Boolean(res?.ok)
}

export async function upsertProduct(product: Product): Promise<void> {
  await apiRequest("/api/products", {
    method: "POST",
    body: JSON.stringify(product),
  })
}

export async function recordPurchase(
  supplierId: string,
  productId: string,
  qty: number,
  cost: number,
): Promise<Purchase | null> {
  return await apiRequest<Purchase>("/api/purchases", {
    method: "POST",
    body: JSON.stringify({ supplierId, productId, qty, cost }),
  })
}

export async function upsertCustomer(customer: Customer): Promise<void> {
  await apiRequest("/api/customers", {
    method: "POST",
    body: JSON.stringify(customer),
  })
}

export async function createCampaign(campaign: Campaign): Promise<void> {
  await apiRequest("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(campaign),
  })
}

export async function updateCampaignStatus(
  id: string,
  status: string,
  sentTo?: number,
): Promise<void> {
  await apiRequest(`/api/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, sentTo: sentTo ?? null }),
  })
}

export async function verifyOwnerPin(pin: string): Promise<boolean> {
  const apiRes = await apiRequest<{ valid: boolean }>("/api/auth/verify-pin", {
    method: "POST",
    body: JSON.stringify({ pin }),
  })
  if (apiRes) return apiRes.valid

  // Fallback to localStorage if backend is offline
  const stored =
    localStorage.getItem("quatern.owner_pin") ||
    localStorage.getItem("quartern.owner_pin") ||
    localStorage.getItem("dukaanos.owner_pin")
  if (!stored) return true
  return stored === pin
}

export async function setOwnerPin(
  currentPin: string | null,
  newPin: string | null,
): Promise<boolean> {
  const apiRes = await apiRequest<{ ok: boolean }>("/api/auth/set-pin", {
    method: "POST",
    body: JSON.stringify({ currentPin, newPin }),
  })
  if (apiRes) return apiRes.ok

  // Fallback to localStorage
  const stored =
    localStorage.getItem("quatern.owner_pin") ||
    localStorage.getItem("quartern.owner_pin") ||
    localStorage.getItem("dukaanos.owner_pin")
  if (stored && stored !== currentPin) return false
  if (newPin) {
    localStorage.setItem("quatern.owner_pin", newPin)
    localStorage.setItem("quartern.owner_pin", newPin)
    localStorage.setItem("dukaanos.owner_pin", newPin)
  } else {
    localStorage.removeItem("quatern.owner_pin")
    localStorage.removeItem("quartern.owner_pin")
    localStorage.removeItem("dukaanos.owner_pin")
  }
  return true
}

export async function getEscPosReceiptBytes(
  invoiceId: string,
  is80mm: boolean,
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/receipts/${invoiceId}/escpos?is_80mm=${is80mm}`,
    )
    if (res.ok) {
      const buf = await res.arrayBuffer()
      return new Uint8Array(buf)
    }
  } catch {}
  return null
}

export function openWhatsAppLink(phone: string, text: string) {
  const cleaned = phone.replace(/[^\d]/g, "")
  const intlPhone =
    cleaned.startsWith("91") && cleaned.length > 10
      ? cleaned
      : `91${cleaned.slice(-10)}`
  const url = `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`
  window.open(url, "_blank")
}

export interface MessagingConfig {
  whatsappProvider: "wa_me" | "meta_cloud" | "twilio"
  metaAccessToken?: string
  metaPhoneNumberId?: string
  metaWabaId?: string
  metaTemplateName?: string
  smsProvider: "none" | "msg91" | "fast2sms" | "twilio"
  smsAuthKey?: string
  smsSenderId?: string
  smsEntityId?: string
  smsTemplateId?: string
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioPhoneNumber?: string
  twilioWhatsappNumber?: string
  autoSendWhatsapp?: boolean
  autoSendSms?: boolean
  receiptFooter?: string
  updatedAt?: number
}

export async function getMessagingConfig(): Promise<MessagingConfig> {
  const res = await apiRequest<MessagingConfig>("/api/messaging/config")
  if (res) return res

  // Local fallback
  const local =
    localStorage.getItem("quatern.messaging_cfg") ||
    localStorage.getItem("quartern.messaging_cfg") ||
    localStorage.getItem("dukaanos.messaging_cfg")
  if (local) {
    try {
      return JSON.parse(local)
    } catch {}
  }
  return {
    whatsappProvider: "none",
    smsProvider: "none",
    receiptFooter: "Thank you for shopping with us! Visit again.",
    updatedAt: 0,
  }
}

export async function saveMessagingConfig(
  cfg: Partial<MessagingConfig>,
): Promise<MessagingConfig | null> {
  const res = await apiRequest<MessagingConfig>("/api/messaging/config", {
    method: "POST",
    body: JSON.stringify(cfg),
  })
  localStorage.setItem("quatern.messaging_cfg", JSON.stringify(res || cfg))
  return res || cfg as MessagingConfig
}

export async function testMessaging(
  channel: "whatsapp" | "sms",
  phone: string,
  message?: string,
): Promise<{ ok: boolean message?: string error?: string url?: string }> {
  const res = await apiRequest<{
    ok: boolean
    message?: string
    error?: string
    url?: string
  }>("/api/messaging/test", {
    method: "POST",
    body: JSON.stringify({ channel, phone, message }),
  })
  if (res) return res

  // If backend is offline or wa.me fallback
  if (channel === "whatsapp") {
    const cleaned = phone.replace(/[^\d]/g, "")
    const intl =
      cleaned.startsWith("91") && cleaned.length > 10
        ? cleaned
        : `91${cleaned.slice(-10)}`
    const url = `https://wa.me/${intl}?text=${encodeURIComponent(message || "Test message from Quatern")}`
    return { ok: true, message: "Opening WhatsApp Web/Direct", url }
  }
  return { ok: false, error: "Backend server unavailable to send SMS" }
}

export async function sendInvoiceReceipt(
  invoiceId: string,
  phone: string,
  channel: "whatsapp" | "sms" | "both" = "whatsapp",
  customerName: string = "",
): Promise<{ ok: boolean results?: any }> {
  const res = await apiRequest<{ ok: boolean results?: any }>(
    "/api/messaging/send-invoice-receipt",
    {
      method: "POST",
      body: JSON.stringify({ invoiceId, phone, channel, customerName }),
    },
  )
  return res || { ok: false }
}

export async function broadcastCampaign(
  campaignId: string,
  channel: string,
  message: string,
  recipients: { phone: string name: string }[],
): Promise<{ ok: boolean sent?: number errors?: string[] }> {
  const res = await apiRequest<{ ok: boolean sent?: number errors?: string[] }>(
    "/api/messaging/broadcast",
    {
      method: "POST",
      body: JSON.stringify({ campaignId, channel, message, recipients }),
    },
  )
  return res || { ok: false, sent: 0 }
}

export interface AIConfig {
  mode: "heuristic" | "local_gguf" | "cloud"
  cloudProvider: "gemini" | "groq"
  apiKey: string
  modelPath: string
  preferredLanguage: "hinglish" | "hindi" | "english"
  updatedAt: number
}

export interface AIStatus {
  mode: "heuristic" | "local_gguf" | "cloud"
  activeModelName?: string
  preferredLanguage?: "hinglish" | "hindi" | "english"
  localModelInstalled: boolean
  localModelPath: string
  cloudConfigured: boolean
  downloading: boolean
  downloadProgress: number
}

export interface AIRecommendation {
  id: string
  archetype: "replenishment_overdue" | "win_back_inactive" | "surplus_clearance"
  title: string
  rationale: string
  eligibleCustomerCount: number
  eligibleCustomerIds: string[]
  suggestedDiscountPct: number
  suggestedChannel: "WhatsApp" | "SMS"
  copyHinglish: string
  copyHindi: string
  copyEnglish: string
  tagFilter?: string
}

export async function getAIStatus(): Promise<AIStatus> {
  const res = await apiRequest<AIStatus>("/api/ai/status")
  return (
    res || {
      mode: "heuristic",
      localModelInstalled: false,
      localModelPath: "",
      cloudConfigured: false,
      downloading: false,
      downloadProgress: 0,
    }
  )
}

export async function saveAIConfig(
  cfg: Partial<AIConfig>,
): Promise<AIConfig | null> {
  return await apiRequest<AIConfig>("/api/ai/config", {
    method: "POST",
    body: JSON.stringify(cfg),
  })
}

export async function getAIRecommendations(): Promise<AIRecommendation[]> {
  const res = await apiRequest<AIRecommendation[]>("/api/ai/recommendations")
  return res || []
}

export async function refineAICopy(
  message: string,
  targetLanguage: "hinglish" | "hindi" | "english",
  tone: string = "friendly",
  storeName: string = "",
): Promise<string> {
  const res = await apiRequest<{ message: string }>("/api/ai/refine-copy", {
    method: "POST",
    body: JSON.stringify({ message, targetLanguage, tone, storeName }),
  })
  return res ? res.message : message
}

export async function downloadAIModel(): Promise<{
  ok: boolean
  message: string
}> {
  const res = await apiRequest<{ ok: boolean message: string }>(
    "/api/ai/download-model",
    {
      method: "POST",
    },
  )
  return res || { ok: false, message: "Failed to initiate download" }
}

export async function getAIDownloadProgress(): Promise<{
  downloading: boolean
  progress: number
  installed: boolean
}> {
  const res = await apiRequest<{
    downloading: boolean
    progress: number
    installed: boolean
  }>("/api/ai/download-progress")
  return res || { downloading: false, progress: 0, installed: false }
}

export interface AIAssistantMessage {
  role: "user" | "assistant"
  content: string
  timestamp?: number
}

export interface AIAssistantMetricData {
  label: string
  value: string
  subtext?: string
  delta?: string
}

export interface AIAssistantChatResponse {
  reply: string
  metrics: AIAssistantMetricData[]
  suggestedActions: string[]
  sources: string[]
}

export async function askAIAssistant(
  query: string,
  history: AIAssistantMessage[] = [],
  language: "hinglish" | "hindi" | "english" = "hinglish",
): Promise<AIAssistantChatResponse | null> {
  return await apiRequest<AIAssistantChatResponse>("/api/ai/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ query, history, language }),
  })
}

export async function getAIAssistantSnapshot(): Promise<Record<string, any> | null> {
  return await apiRequest<Record<string, any>>("/api/ai/assistant/snapshot")
}

export interface BulkImportResponse {
  success: boolean
  importedCount: number
  updatedCount: number
  skippedCount: number
  errors: string[]
}

export async function bulkImportProducts(
  products: Product[],
  conflictMode: "upsert" | "skip" = "upsert",
): Promise<BulkImportResponse | null> {
  return await apiRequest<BulkImportResponse>("/api/import/products", {
    method: "POST",
    body: JSON.stringify({ products, conflictMode }),
  })
}

export async function bulkImportCustomers(
  customers: Customer[],
  conflictMode: "upsert" | "skip" = "upsert",
): Promise<BulkImportResponse | null> {
  return await apiRequest<BulkImportResponse>("/api/import/customers", {
    method: "POST",
    body: JSON.stringify({ customers, conflictMode }),
  })
}
