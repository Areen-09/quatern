import { useEffect, useReducer } from "react"
import { toPaise } from "./money"
import * as api from "./api"

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  price: number
  cost: number
  gst: number
  stock: number
  reorder: number
  supplierId: string
  unit: string
}
export interface Supplier {
  id: string
  name: string
  phone: string
}
export interface Customer {
  id: string
  name: string
  phone: string
  address?: string
  consent: boolean
  tags: string[]
  createdAt: number
}
export interface Campaign {
  id: string
  name: string
  channel: "WhatsApp" | "SMS"
  message: string
  segment: string
  status: "Draft" | "Pending approval" | "Sent" | "Rejected"
  createdAt: number
  sentTo?: number
  conversions?: number
}
export interface InvoiceLine {
  productId: string
  name: string
  price: number
  qty: number
  gst: number
  discountPct: number
}
export interface Invoice {
  id: string
  number: string
  at: number
  customerId?: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  lines: InvoiceLine[]
  billDiscount: number
  total: number
  tax: number
  payment: "Cash" | "UPI" | "Card" | "Credit"
}
export interface Purchase {
  id: string
  at: number
  supplierId: string
  productId: string
  qty: number
  cost: number
}
export interface Audit {
  at: number
  action: string
  detail: string
}
export interface ShopProfile {
  name: string
  ownerName?: string
  gstin?: string
  phone?: string
  address?: string
  country?: string
  currency?: string
  signature?: string
  isConfigured?: boolean
  hasPin?: boolean
}

export interface State {
  products: Product[]
  suppliers: Supplier[]
  customers: Customer[]
  invoices: Invoice[]
  campaigns: Campaign[]
  purchases: Purchase[]
  audit: Audit[]
  shop: ShopProfile
}

export const DAY = 86400000
export const uid = () => Math.random().toString(36).slice(2, 10)

function seed(): State {
  const now = Date.now()
  return {
    products: [],
    suppliers: [],
    customers: [],
    invoices: [],
    purchases: [],
    campaigns: [],
    audit: [
      {
        at: now,
        action: "Store initialized",
        detail: "Clean database ready for operation",
      },
    ],
    shop: {
      name: "",
      ownerName: "",
      gstin: "",
      phone: "",
      address: "",
      country: "India",
      currency: "INR",
      signature: "",
      isConfigured: false,
      hasPin: false,
    },
  }
}

export type Action = {
  type: "invoice"
  invoice: Omit<Invoice, "id" | "number" | "at">
} | { type: "deleteInvoice" id: string } | {
  type: "updateInvoice"
  id: string
  patch: Partial<Invoice>
} | { type: "product" product: Product } | {
  type: "purchase"
  productId: string
  qty: number
  cost: number
} | { type: "customer" customer: Customer } | {
  type: "campaign"
  campaign: Campaign
} | { type: "campaignStatus" id: string status: Campaign["status"] } | {
  type: "shop"
  shop: ShopProfile
} | {
  type: "bulkProducts"
  products: Product[]
  conflictMode?: "upsert" | "skip"
} | {
  type: "bulkCustomers"
  customers: Customer[]
  conflictMode?: "upsert" | "skip"
} | { type: "reset" } | { type: "sync" state: State }

// Consent is enforced here: segments never include opted-out customers.
export const segmentOf = (s: State, seg: string) =>
  s.customers.filter(
    (c) => c.consent && (seg === "All consented" || c.tags.includes(seg)),
  )

function reducer(s: State, a: Action): State {
  const log = (action: string, detail: string) =>
    [{ at: Date.now(), action, detail }, ...s.audit].slice(0, 500)
  switch (a.type) {
    case "sync":
      return a.state
    case "invoice": {
      const number = `INV-${String(s.invoices.length + 1).padStart(5, "0")}`
      const inv: Invoice = { ...a.invoice, id: uid(), number, at: Date.now() }
      const products = s.products.map((p) => {
        const l = inv.lines.find((x) => x.productId === p.id)
        return l ? { ...p, stock: p.stock - l.qty } : p
      })
      let customers = s.customers
      if (inv.customerPhone || inv.customerName) {
        const cleanPhone = (inv.customerPhone || "").trim()
        const existingIdx = customers.findIndex(
          (c) =>
            (inv.customerId && c.id === inv.customerId) ||
            (cleanPhone && c.phone === cleanPhone),
        )
        if (existingIdx >= 0) {
          if (inv.customerAddress) {
            customers = customers.map((c, i) =>
              i === existingIdx
                ? { ...c, address: inv.customerAddress || c.address }
                : c,
            )
          }
        } else {
          customers = [
            ...customers,
            {
              id: inv.customerId || uid(),
              name: (inv.customerName || "").trim() || "Customer",
              phone: cleanPhone,
              address: (inv.customerAddress || "").trim(),
              consent: true,
              tags: ["New"],
              createdAt: Date.now(),
            },
          ]
        }
      }
      return {
        ...s,
        products,
        customers,
        invoices: [...s.invoices, inv],
        audit: log(
          "Invoice",
          `${number} · ₹${(inv.total / 100).toFixed(2)} · ${inv.payment}`,
        ),
      }
    }
    case "deleteInvoice": {
      const inv = s.invoices.find((x) => x.id === a.id)
      const products = s.products.map((p) => {
        const l = inv?.lines.find((x) => x.productId === p.id)
        return l ? { ...p, stock: p.stock + l.qty } : p
      })
      return {
        ...s,
        products,
        invoices: s.invoices.filter((x) => x.id !== a.id),
        audit: log("Invoice deleted", inv?.number || a.id),
      }
    }
    case "updateInvoice": {
      return {
        ...s,
        invoices: s.invoices.map((inv) =>
          inv.id === a.id ? { ...inv, ...a.patch } : inv,
        ),
        audit: log("Invoice updated", a.id),
      }
    }
    case "product": {
      const exists = s.products.some((p) => p.id === a.product.id)
      return {
        ...s,
        products: exists
          ? s.products.map((p) => (p.id === a.product.id ? a.product : p))
          : [...s.products, a.product],
        audit: log(
          exists ? "Product updated" : "Product added",
          a.product.name,
        ),
      }
    }
    case "purchase": {
      const p = s.products.find((x) => x.id === a.productId)!
      return {
        ...s,
        products: s.products.map((x) =>
          x.id === a.productId
            ? { ...x, stock: x.stock + a.qty, cost: a.cost }
            : x,
        ),
        purchases: [
          ...s.purchases,
          {
            id: uid(),
            at: Date.now(),
            supplierId: p.supplierId,
            productId: p.id,
            qty: a.qty,
            cost: a.cost,
          },
        ],
        audit: log("Purchase", `${a.qty} × ${p.name}`),
      }
    }
    case "customer":
      return {
        ...s,
        customers: [...s.customers, a.customer],
        audit: log("Customer added", a.customer.name),
      }
    case "campaign":
      return {
        ...s,
        campaigns: [a.campaign, ...s.campaigns],
        audit: log("Campaign submitted", a.campaign.name),
      }
    case "campaignStatus": {
      const c = s.campaigns.find((x) => x.id === a.id)!
      const sent = a.status === "Sent"
      return {
        ...s,
        campaigns: s.campaigns.map((x) =>
          x.id === a.id
            ? {
                ...x,
                status: a.status,
                sentTo: sent ? segmentOf(s, c.segment).length : x.sentTo,
                conversions: sent ? 0 : x.conversions,
              }
            : x,
        ),
        audit: log(
          sent
            ? "Campaign approved & sent"
            : `Campaign ${a.status.toLowerCase()}`,
          c.name,
        ),
      }
    }
    case "bulkProducts": {
      const mode = a.conflictMode || "upsert"
      let updatedList = [...s.products]
      let addedCount = 0
      let updatedCount = 0

      for (const p of a.products) {
        const idx = updatedList.findIndex(
          (x) => (p.sku && x.sku && p.sku === x.sku) || x.id === p.id,
        )
        if (idx >= 0) {
          if (mode === "upsert") {
            updatedList[idx] = { ...updatedList[idx], ...p }
            updatedCount++
          }
        } else {
          updatedList.push(p)
          addedCount++
        }
      }

      return {
        ...s,
        products: updatedList,
        audit: log(
          "Products bulk imported",
          `${addedCount} new, ${updatedCount} updated`,
        ),
      }
    }
    case "bulkCustomers": {
      const mode = a.conflictMode || "upsert"
      let updatedList = [...s.customers]
      let addedCount = 0
      let updatedCount = 0

      for (const c of a.customers) {
        const cleanPhone = (c.phone || "").trim()
        const idx = updatedList.findIndex(
          (x) => (cleanPhone && x.phone === cleanPhone) || x.id === c.id,
        )
        if (idx >= 0) {
          if (mode === "upsert") {
            updatedList[idx] = { ...updatedList[idx], ...c }
            updatedCount++
          }
        } else {
          updatedList.push(c)
          addedCount++
        }
      }

      return {
        ...s,
        customers: updatedList,
        audit: log(
          "Customers bulk imported",
          `${addedCount} new, ${updatedCount} updated`,
        ),
      }
    }
    case "shop":
      return {
        ...s,
        shop: { ...s.shop, ...a.shop },
        audit: log("Shop profile", a.shop.name),
      }
    case "reset":
      return seed()
  }
}

// Storage adapter: SQLite via FastAPI in desktop; localStorage fallback in browser.
const KEY = "quatern.v2"
const OLD_KEY = "quartern.v2"
const LEGACY_KEY = "dukaanos.v2"
export function useStore() {
  const [state, dispatchBase] = useReducer(reducer, undefined, () => {
    try {
      const raw =
        localStorage.getItem(KEY) ||
        localStorage.getItem(OLD_KEY) ||
        localStorage.getItem(LEGACY_KEY)
      if (raw) return JSON.parse(raw) as State
    } catch {}
    return seed()
  })

  // Hydrate from SQLite database if running in desktop or connected to FastAPI
  useEffect(() => {
    api.fetchAppState().then((tState) => {
      if (tState) {
        dispatchBase({ type: "sync", state: tState })
      }
    })
  }, [])

  // Async dispatch wrapper that synchronizes to desktop backend
  const dispatch = (a: Action) => {
    dispatchBase(a)
    switch (a.type) {
      case "invoice":
        api.createInvoice(a.invoice)
        break
      case "product":
        api.upsertProduct(a.product)
        break
      case "purchase":
        api.recordPurchase(
          state.products.find((p) => p.id === a.productId)?.supplierId ?? "s1",
          a.productId,
          a.qty,
          a.cost,
        )
        break
      case "customer":
        api.upsertCustomer(a.customer)
        break
      case "campaign":
        api.createCampaign(a.campaign)
        break
      case "campaignStatus":
        api.updateCampaignStatus(
          a.id,
          a.status,
          a.status === "Sent"
            ? segmentOf(
                state,
                state.campaigns.find((c) => c.id === a.id)?.segment ?? "",
              ).length
            : undefined,
        )
        break
      case "shop":
        api.updateShop(a.shop)
        break
      case "bulkProducts":
        api.bulkImportProducts(a.products, a.conflictMode)
        break
      case "bulkCustomers":
        api.bulkImportCustomers(a.customers, a.conflictMode)
        break
      case "reset":
        try {
          localStorage.removeItem(KEY)
          localStorage.removeItem(OLD_KEY)
          localStorage.removeItem(LEGACY_KEY)
          localStorage.removeItem("quatern.owner_pin")
          localStorage.removeItem("quartern.owner_pin")
          localStorage.removeItem("dukaanos.owner_pin")
        } catch {}
        api.resetData().then((res) => {
          if (res) dispatchBase({ type: "sync", state: res })
        })
        break
    }
  }

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  return [state, dispatch] as const
}

export const dailySales = (
  s: State,
  productId: string | null,
  days: number,
) => {
  const out: number[] = Array(days).fill(0)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const t0 = start.getTime() - (days - 1) * DAY
  for (const inv of s.invoices) {
    const i = Math.floor((inv.at - t0) / DAY)
    if (i < 0 || i >= days) continue
    if (productId === null) out[i] += inv.total
    else
      for (const l of inv.lines) if (l.productId === productId) out[i] += l.qty
  }
  return out
}
