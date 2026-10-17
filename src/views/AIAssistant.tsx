import { useState, useEffect, useRef } from "react"
import { State } from "../lib/store"
import { Card, Icon, Btn, Badge, QuaternLogo } from "../ui"
import {
  askAIAssistant,
  getAIStatus,
  AIAssistantMessage,
  AIAssistantMetricData,
  AIStatus,
} from "../lib/api"
import { fmt0 } from "../lib/money"

interface Props {
  s: State
  onOpenAI?: () => void
  go?: (view: string) => void
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  timestamp: number
  metrics?: AIAssistantMetricData[]
  suggestedActions?: string[]
  sources?: string[]
}

const SUGGESTIONS = [
  {
    label: "Today's Sales & Breakdown",
    query: "What are today's sales and payment breakdown?",
  },
  {
    label: "Month-on-Month Growth",
    query: "Show me month on month sales growth and comparison",
  },
  {
    label: "Low Stock Alerts",
    query: "Which items are running out of stock or low in inventory?",
  },
  {
    label: "Pending Udhaar Summary",
    query: "How much total udhaar is pending and who owes the most?",
  },
  {
    label: "Top Selling Products",
    query: "Which products are my bestsellers in the last 30 days?",
  },
  {
    label: "Sales Growth Advice",
    query: "Give me retail tips and strategies to increase my shop sales",
  },
]

// Fallback intelligence engine computing verified metrics directly from live React store
function computeLocalStoreReply(
  query: string,
  s: State,
  lang: "hinglish" | "hindi" | "english",
): {
  reply: string
  metrics: AIAssistantMetricData[]
  suggestedActions: string[]
  sources: string[]
} {
  const q = query.toLowerCase()
  const owner = s.shop.ownerName || s.shop.name || "Merchant"
  const store = s.shop.name || "Quatern Store"

  const now = new Date()
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const dayMs = 86400000
  const yestStart = todayStart - dayMs

  const todayInvs = s.invoices.filter((i) => i.at >= todayStart)
  const yestInvs = s.invoices.filter(
    (i) => i.at >= yestStart && i.at < todayStart,
  )

  const thisMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).getTime()
  const lastMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).getTime()
  const thisMonthInvs = s.invoices.filter((i) => i.at >= thisMonthStart)
  const lastMonthInvs = s.invoices.filter(
    (i) => i.at >= lastMonthStart && i.at < thisMonthStart,
  )

  const todayRev = todayInvs.reduce((acc, i) => acc + i.total, 0)
  const yestRev = yestInvs.reduce((acc, i) => acc + i.total, 0)
  const thisMonthRev = thisMonthInvs.reduce((acc, i) => acc + i.total, 0)
  const lastMonthRev = lastMonthInvs.reduce((acc, i) => acc + i.total, 0)

  const lowStockProds = s.products.filter((p) => p.stock <= p.reorder)
  const creditInvs = s.invoices.filter((i) => i.payment === "Credit")
  const totalCredit = creditInvs.reduce((acc, i) => acc + i.total, 0)

  // Payments breakdown today
  const payMap: Record<string, number> = {}
  for (const inv of todayInvs) {
    payMap[inv.payment] = (payMap[inv.payment] || 0) + inv.total
  }

  // Bestsellers
  const qtyMap: Record<string, { name: string qty: number rev: number }> = {}
  for (const inv of s.invoices) {
    for (const l of inv.lines) {
      if (!qtyMap[l.name]) qtyMap[l.name] = { name: l.name, qty: 0, rev: 0 }
      qtyMap[l.name].qty += l.qty
      qtyMap[l.name].rev += l.price * l.qty
    }
  }
  const bestsellers = Object.values(qtyMap)
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 5)

  // 0. Margins & Profitability
  if (
    /margin|profit|markup|munafa|fayda|highest margin|lowest margin|cost price/i.test(
      q,
    )
  ) {
    if (s.products.length === 0) {
      return {
        reply:
          "Abhi inventory me koi products add nahi hain. Products add karne ke baad yahan highest margins dikhenge.",
        metrics: [],
        suggestedActions: ["Open Inventory", "What are today's sales?"],
        sources: ["Live Store Snapshot"],
      }
    }

    const prodsWithMargin = s.products
      .map((p) => {
        const price = p.price
        const cost = p.cost
        const profit = price - cost
        const marginPct =
          price > 0 ? Math.round((profit / price) * 1000) / 10 : 0
        return { p, profit, marginPct }
      })
      .sort((a, b) => b.marginPct - a.marginPct)

    const best = prodsWithMargin[0]
    const lines = prodsWithMargin
      .slice(0, 5)
      .map(
        (item, idx) =>
          `${idx + 1}. **${item.p.name}**: **${item.marginPct}% margin** (Selling: ${fmt0(item.p.price)}, Cost: ${fmt0(item.p.cost)}, Profit: **${fmt0(item.profit)}/unit**)`,
      )

    const reply =
      lang === "hindi"
        ? `📊 **उत्पाद लाभ मार्जिन (Profit Margin) विश्लेषण:**\n\nआपकी दुकान में सबसे अधिक लाभ मार्जिन वाला उत्पाद **${best.p.name}** है, जिस पर **${best.marginPct}%** का मुनाफा मिलता है (प्रति यूनिट **${fmt0(best.profit)}** का लाभ)!\n\n**सर्वोच्च लाभ वाले उत्पाद (Top Margin Products):**\n${lines.join("\n")}\n\n💡 _सुझाव: उच्च मार्जिन वाले उत्पादों को काउंटर के निकट प्रमुखता से प्रदर्शित करें।_`
        : lang === "english"
          ? `📊 **Product Profit Margin Analysis:**\n\nThe product with the highest profit margin in your catalog is **${best.p.name}** with a **${best.marginPct}% profit margin** (**${fmt0(best.profit)}** profit per unit)!\n\n**Top Margin Products Ranking:**\n${lines.join("\n")}\n\n💡 _Tip: Feature high-margin products like ${best.p.name} at checkout counters and in bundles to maximize store profits._`
          : `📊 **Product Profit Margin Analysis:**\n\nAapki dukaan me sabse zyada margin **${best.p.name}** par hai — **${best.marginPct}% margin** (**${fmt0(best.profit)}** profit per unit)!\n\n**Top Margin Products Ranking:**\n${lines.join("\n")}\n\n💡 _Tip: High margin items (${best.p.name}) ko cash counter ke samne display karein taaki overall profit percentage boost ho sake._`

    return {
      reply,
      metrics: [
        {
          label: "#1 Highest Margin",
          value: best.p.name,
          subtext: `${best.marginPct}% margin`,
          delta: `+${fmt0(best.profit)}`,
        },
        {
          label: "Profit Per Unit",
          value: fmt0(best.profit),
          subtext: `Sell ${fmt0(best.p.price)} vs Cost ${fmt0(best.p.cost)}`,
        },
        {
          label: "Catalog Size",
          value: `${s.products.length} items`,
          subtext: "Analyzed",
        },
      ],
      suggestedActions: [
        "Which products are bestsellers?",
        "Check low stock alerts",
        "What are today's sales?",
      ],
      sources: ["Live Store Snapshot"],
    }
  }

  // 1. Today sales
  if (/today|aaj|bikri|sales today|daily|kamai/i.test(q)) {
    const dod =
      yestRev > 0 ? Math.round(((todayRev - yestRev) / yestRev) * 100) : 0
    const dodStr = `${dod >= 0 ? "+" : ""}${dod}%`
    const payLines =
      Object.entries(payMap)
        .map(([k, v]) => `• **${k}**: ${fmt0(v)}`)
        .join("\n") || "_No payment breakdown recorded yet_"

    const reply =
      lang === "hindi"
        ? `नमस्ते **${owner}** जी! आज की कुल बिक्री का विवरण:\n\n• **आज की कुल बिक्री**: **${fmt0(todayRev)}** (${todayInvs.length} बिल)\n• **कल की बिक्री**: ${fmt0(yestRev)} (तुलना: **${dodStr}**)\n\n**भुगतान माध्यम (Payment Modes):**\n${payLines}\n\n💡 _सुझाव: आज के अनपेड उधार बिल देखने के लिए 'Pending Udhaar' पेज चेक करें।_`
        : lang === "english"
          ? `Hello **${owner}**! Here is your sales performance summary for today:\n\n• **Today's Gross Sales**: **${fmt0(todayRev)}** across **${todayInvs.length} bills**\n• **Yesterday's Sales**: ${fmt0(yestRev)} (**${dodStr}**)\n\n**Payment Breakdown:**\n${payLines}\n\n💡 _Tip: You can send WhatsApp receipts directly from the billing screen or Bills & History._`
          : `Namaste **${owner}** ji! Aaj ki sales ki summary:\n\n• **Today's Gross Sales**: **${fmt0(todayRev)}** across **${todayInvs.length} bills**\n• **Kal se Comparison**: Kal ${fmt0(yestRev)} tha (**${dodStr}** change)\n\n**Payment Mode Breakdown:**\n${payLines}\n\n💡 _Tip: Agar kisi customer ka payment baaki hai, toh 'Pending Udhaar' se reminder bhej sakte hain._`

    return {
      reply,
      metrics: [
        {
          label: "Today Sales",
          value: fmt0(todayRev),
          subtext: `${todayInvs.length} bills`,
          delta: dodStr,
        },
        {
          label: "Yesterday",
          value: fmt0(yestRev),
          subtext: `${yestInvs.length} bills`,
        },
      ],
      suggestedActions: [
        "Show Month-on-Month growth",
        "Check low stock alerts",
        "View pending udhaar",
      ],
      sources: ["Live Store Snapshot"],
    }
  }

  // 2. MoM growth
  if (/month|mom|growth|mahine|pichhle/i.test(q)) {
    const mom =
      lastMonthRev > 0
        ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
        : 0
    const momStr = `${mom >= 0 ? "+" : ""}${mom}%`

    const reply = `**Month-on-Month (MoM) Growth Analysis:**\n\n• **Iss Mahine**: **${fmt0(thisMonthRev)}** (${thisMonthInvs.length} bills)\n• **Pichhle Mahine**: ${fmt0(lastMonthRev)} (${lastMonthInvs.length} bills)\n• **MoM Growth Rate**: **${momStr}**\n\n💡 _Tip: Bestsellers par bundle offer lagane se ticket size 15-20% badh sakta hai._`

    return {
      reply,
      metrics: [
        {
          label: "MoM Growth",
          value: momStr,
          subtext: "vs last month",
          delta: momStr,
        },
        {
          label: "This Month",
          value: fmt0(thisMonthRev),
          subtext: `${thisMonthInvs.length} bills`,
        },
        {
          label: "Last Month",
          value: fmt0(lastMonthRev),
          subtext: `${lastMonthInvs.length} bills`,
        },
      ],
      suggestedActions: [
        "Top selling products",
        "Today's sales",
        "Check low stock alerts",
      ],
      sources: ["Live Store Snapshot"],
    }
  }

  // 3. Low stock / inventory
  if (/stock|inventory|khatam|reorder|shortage|maal/i.test(q)) {
    const itemLines =
      lowStockProds
        .slice(0, 5)
        .map(
          (p) =>
            `• **${p.name}**: Stock **${p.stock}** left (Reorder level: ${p.reorder})`,
        )
        .join("\n") || "_Saare products stock me hain! 0 low stock items._"

    const reply = `📦 **Inventory Health & Stock Alerts:**\n\n• **Total Products**: ${s.products.length}\n• **Low Stock Items**: **${lowStockProds.length} items**\n\n**Items Needing Immediate Reorder:**\n${itemLines}\n\n💡 _Tip: Inventory tab par jakar aap 'Purchase' entry daal sakte hain supplier se stock aane par._`

    return {
      reply,
      metrics: [
        {
          label: "Low Stock",
          value: `${lowStockProds.length}`,
          subtext: "Items to reorder",
        },
        {
          label: "Catalog Size",
          value: `${s.products.length}`,
          subtext: "Total SKUs",
        },
      ],
      suggestedActions: [
        "Open Inventory",
        "Top selling products",
        "Today's sales",
      ],
      sources: ["Live Store Snapshot"],
    }
  }

  // 4. Udhaar / Pending
  if (/udhaar|pending|credit|baaki|debt|unpaid|due/i.test(q)) {
    const debtorLines =
      creditInvs
        .slice(0, 5)
        .map(
          (i) =>
            `• **${i.customerName || "Customer"}** (${i.customerPhone || "No phone"}): **${fmt0(i.total)}**`,
        )
        .join("\n") || "_Koi pending udhaar nahi hai! All accounts settled._"

    const reply = `⏳ **Pending Payments (Udhaar) Summary:**\n\n• **Total Outstanding Udhaar**: **${fmt0(totalCredit)}** across **${creditInvs.length} credit bills**\n\n**Recent Outstanding Accounts:**\n${debtorLines}\n\n💡 _Action: 'Pending Udhaar' page par jakar 'Remind' button dabayein WhatsApp reminder bhejne ke liye._`

    return {
      reply,
      metrics: [
        {
          label: "Total Udhaar",
          value: fmt0(totalCredit),
          subtext: `${creditInvs.length} unpaid bills`,
        },
      ],
      suggestedActions: [
        "Open Pending Udhaar page",
        "Today's sales",
        "Month on Month growth",
      ],
      sources: ["Live Store Snapshot"],
    }
  }

  // 5. Bestsellers
  if (/bestseller|top product|popular|fast selling/i.test(q)) {
    const lines =
      bestsellers
        .map(
          (b, idx) =>
            `${idx + 1}. **${b.name}**: ${b.qty} sold (${fmt0(b.rev)})`,
        )
        .join("\n") || "_No sales history recorded yet._"

    return {
      reply: `🏆 **Top Selling Products:**\n\n${lines}\n\n💡 _Tip: Top sellers ko counter ke paas display karein aur kabhi out of stock na hone dein!_`,
      metrics: bestsellers[0]
        ? [
            {
              label: "#1 Bestseller",
              value: bestsellers[0].name.slice(0, 18),
              subtext: `${bestsellers[0].qty} sold`,
            },
          ]
        : [],
      suggestedActions: [
        "Check low stock alerts",
        "Month on Month growth",
        "Today's sales",
      ],
      sources: ["Live Store Snapshot"],
    }
  }

  // 6. Top Customers & Spenders
  if (
    /customer|loyal|spender|grahak|buyer/i.test(q) ||
    (/who/i.test(q) && /bought|spent|purchased|paid/i.test(q))
  ) {
    const custSpendMap: Record<string, {
      name: string
      phone: string
      bills: number
      spent: number
    }> = {}
    for (const inv of s.invoices) {
      const cname = (inv.customerName || "").trim()
      if (cname) {
        if (!custSpendMap[cname]) {
          custSpendMap[cname] = {
            name: cname,
            phone: inv.customerPhone || "",
            bills: 0,
            spent: 0,
          }
        }
        custSpendMap[cname].bills += 1
        custSpendMap[cname].spent += inv.total
      }
    }
    const topSpenders = Object.values(custSpendMap)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5)

    if (topSpenders.length > 0) {
      const lines = topSpenders.map(
        (c, i) =>
          `${i + 1}. **${c.name}** (${c.phone || "No phone"}): **${fmt0(c.spent)}** (${c.bills} bills)`,
      )
      return {
        reply: `👥 **Top Spending Customers:**\n\n${lines.join("\n")}\n\n💡 _Tip: In VIP customers ko special WhatsApp discount ya festive greetings bhejein!_`,
        metrics: [
          {
            label: "#1 Top Customer",
            value: topSpenders[0].name.slice(0, 18),
            subtext: `${fmt0(topSpenders[0].spent)} spent`,
          },
          { label: "Total Customers", value: `${s.customers.length}` },
        ],
        suggestedActions: [
          "View pending udhaar",
          "Today's sales",
          "Which product has highest margin?",
        ],
        sources: ["Live Store Snapshot"],
      }
    }
  }

  // 7. Taxes & GST
  if (/tax|gst|cgst|sgst/i.test(q)) {
    const todayTax = todayInvs.reduce((acc, i) => acc + i.tax, 0)
    const monthTax = thisMonthInvs.reduce((acc, i) => acc + i.tax, 0)
    return {
      reply: `📑 **GST & Tax Collected Summary:**\n\n• **Aaj Ka Tax (Today)**: **${fmt0(todayTax)}**\n• **Is Mahine Ka Tax**: **${fmt0(monthTax)}**\n\n💡 _Tip: Detailed tax breakdown dekhne ke liye 'Bills & History' tab par jayein._`,
      metrics: [
        { label: "Today Tax", value: fmt0(todayTax) },
        { label: "This Month Tax", value: fmt0(monthTax) },
      ],
      suggestedActions: [
        "What are today's sales?",
        "Month on Month growth",
        "View pending udhaar",
      ],
      sources: ["Live Store Snapshot"],
    }
  }

  // 8. Specific Product Lookup
  for (const p of s.products) {
    const pname = p.name.toLowerCase()
    if (new RegExp(`\\b${pname}\\b`, "i").test(q)) {
      const profit = p.price - p.cost
      const marginPct =
        p.price > 0 ? Math.round((profit / p.price) * 1000) / 10 : 0
      return {
        reply: `📦 **Product Details: ${p.name}**\n\n• **Selling Price**: ${fmt0(p.price)}\n• **Cost Price**: ${fmt0(p.cost)}\n• **Profit Margin**: **${marginPct}%** (Profit: **${fmt0(profit)}/unit**)\n• **Current Stock**: **${p.stock}** left (Reorder level: ${p.reorder})\n• **Category**: ${p.category || "General"}`,
        metrics: [
          {
            label: "Margin",
            value: `${marginPct}%`,
            subtext: `Profit ${fmt0(profit)}`,
          },
          {
            label: "Stock",
            value: `${p.stock}`,
            subtext: `Reorder at ${p.reorder}`,
          },
          { label: "Price", value: fmt0(p.price) },
        ],
        suggestedActions: [
          "Which product has highest margin?",
          "Check low stock alerts",
          "Today's sales",
        ],
        sources: ["Live Store Snapshot"],
      }
    }
  }

  // Default / General
  return {
    reply: `Namaste **${owner}** ji! Main Quatern AI Assistant hoon. Aapki dukaan **${store}** ki taaza snapshot:\n\n• **Aaj Ki Bikri**: **${fmt0(todayRev)}** (${todayInvs.length} bills)\n• **Is Mahine Ki Bikri**: **${fmt0(thisMonthRev)}**\n• **Pending Udhaar**: **${fmt0(totalCredit)}** (${creditInvs.length} bills)\n• **Low Stock**: **${lowStockProds.length} items**\n\nAap mujhse kuch bhi pooch sakte hain:\n- _"Aaj ki sales aur payment breakdown dikhao"_\n- _"Month on Month growth kaisa raha?"_\n- _"Kaunse products ka stock khatam ho raha hai?"_\n- _"Kitna udhaar baaki hai?"_`,
    metrics: [
      {
        label: "Today",
        value: fmt0(todayRev),
        subtext: `${todayInvs.length} bills`,
      },
      {
        label: "Low Stock",
        value: `${lowStockProds.length}`,
        subtext: "Items to reorder",
      },
    ],
    suggestedActions: [
      "What are today's sales?",
      "Month-on-Month growth",
      "Check low stock alerts",
    ],
    sources: ["Live Store Snapshot"],
  }
}

export default function AIAssistant({ s, onOpenAI, go }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [language, setLanguage] = useState<"hinglish" | "hindi" | "english">(
    "hinglish",
  )
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initializedRef = useRef(false)

  // Load AI configuration status
  useEffect(() => {
    getAIStatus()
      .then((st) => {
        if (st) {
          setAiStatus(st)
          if (st.preferred_language) {
            setLanguage(st.preferred_language as any)
          }
        }
      })
      .catch(() => {})
  }, [])

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Initial welcome message from Quatern Copilot (only once!)
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const owner = s.shop.ownerName || s.shop.name || "Merchant"
    const store = s.shop.name || "Quatern Store"

    const todayStart = new Date().setHours(0, 0, 0, 0)
    const todayInvs = s.invoices.filter((i) => i.at >= todayStart)
    const todayTotal = todayInvs.reduce((acc, i) => acc + i.total, 0)
    const lowStockCount = s.products.filter((p) => p.stock <= p.reorder).length
    const creditInvs = s.invoices.filter((i) => i.payment === "Credit")
    const totalCredit = creditInvs.reduce((acc, i) => acc + i.total, 0)

    const welcomeMsg: ChatMessage = {
      id: "welcome-1",
      role: "assistant",
      timestamp: Date.now(),
      text:
        `Namaste **${owner}** ji! Welcome to your **${store}** AI Business Copilot.\n\n` +
        `I have verified live access to your store database. You can ask me anything about sales performance, revenue trends, inventory shortages, or customer balances.\n\n` +
        `Try asking questions like:\n` +
        `• _"What are today's sales?"_\n` +
        `• _"Show month-on-month growth rate"_\n` +
        `• _"Which products are low on stock?"_\n` +
        `• _"Who has the highest pending udhaar?"_`,
      metrics: [
        {
          label: "Today's Sales",
          value: fmt0(todayTotal),
          subtext: `${todayInvs.length} bills today`,
        },
        {
          label: "Low Stock",
          value: `${lowStockCount} items`,
          subtext: "Need reorder",
        },
        {
          label: "Pending Udhaar",
          value: fmt0(totalCredit),
          subtext: `${creditInvs.length} credit bills`,
        },
      ],
      suggestedActions: [
        "What are today's sales?",
        "Show Month-on-Month growth",
        "Check low stock alerts",
        "View pending udhaar",
      ],
      sources: ["Live Store Snapshot"],
    }
    setMessages([welcomeMsg])
  }, [s.shop.name, s.shop.ownerName])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSend = async (queryText?: string) => {
    const q = (queryText ?? input).trim()
    if (!q || loading) return

    const userMsgId = `user-${Date.now()}`
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      text: q,
      timestamp: Date.now(),
    }

    // Immediately display user message and clear input
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    // Construct conversation history for backend context
    const historyPayload: AIAssistantMessage[] = messages
      .slice(-4)
      .map((m) => ({
        role: m.role,
        content: m.text,
        timestamp: m.timestamp,
      }))

    try {
      // 1. Try querying backend AI assistant API
      const resp = await askAIAssistant(q, historyPayload, language)

      if (resp && resp.reply) {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          text: resp.reply,
          timestamp: Date.now(),
          metrics: resp.metrics || [],
          suggestedActions: resp.suggestedActions || [],
          sources: resp.sources || ["Quatern Retail Engine"],
        }
        setMessages((prev) => [...prev, aiMsg])
      } else {
        // 2. Seamless local fallback computation from React store
        const fallback = computeLocalStoreReply(q, s, language)
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          text: fallback.reply,
          timestamp: Date.now(),
          metrics: fallback.metrics,
          suggestedActions: fallback.suggestedActions,
          sources: fallback.sources,
        }
        setMessages((prev) => [...prev, aiMsg])
      }
    } catch {
      // 3. Fallback on any network/parsing exception
      const fallback = computeLocalStoreReply(q, s, language)
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        text: fallback.reply,
        timestamp: Date.now(),
        metrics: fallback.metrics,
        suggestedActions: fallback.suggestedActions,
        sources: fallback.sources,
      }
      setMessages((prev) => [...prev, aiMsg])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleClearChat = () => {
    setMessages((prev) => prev.slice(0, 1))
  }

  // Format basic markdown safely (bolding, lists, italics, paragraphs)
  const renderMarkdown = (content: string) => {
    const lines = content.split("\n")
    return (
      <div className="space-y-1.5 text-[13px] leading-relaxed text-stone-800">
        {lines.map((line, i) => {
          if (!line.trim()) {
            return <div key={i} className="h-1.5" />
          }

          // Bullet point line
          const isBullet =
            line.startsWith("• ") ||
            line.startsWith("- ") ||
            line.startsWith("* ")
          const cleanLine = isBullet ? line.replace(/^[•\-\*]\s*/, "") : line

          // Parse **bold** and _italic_
          const formatted = parseInlineFormatting(cleanLine)

          if (isBullet) {
            return (
              <div key={i} className="flex items-start gap-2 pl-1">
                <span className="text-amber-500 font-bold select-none">•</span>
                <span className="flex-1">{formatted}</span>
              </div>
            )
          }

          if (line.startsWith("### ")) {
            return (
              <h4
                key={i}
                className="text-xs font-bold uppercase tracking-wider text-stone-900 pt-1"
              >
                {parseInlineFormatting(line.replace(/^###\s*/, ""))}
              </h4>
            )
          }

          return <p key={i}>{formatted}</p>
        })}
      </div>
    )
  }

  const parseInlineFormatting = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-stone-950">
            {part.slice(2, -2)}
          </strong>
        )
      }
      if (part.startsWith("_") && part.endsWith("_")) {
        return (
          <em key={index} className="italic text-stone-600">
            {part.slice(1, -1)}
          </em>
        )
      }
      return part
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] max-w-5xl mx-auto space-y-3">
      {/* Top Header Card */}
      <Card className="px-5 py-3.5 border-stone-200 bg-white shrink-0 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-stone-900 via-stone-800 to-amber-700 text-amber-300 shadow-xs">
              <Icon name="sparkles" className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-stone-900">
                  Retail AI Copilot
                </h1>
                <Badge tone="amber">Active</Badge>
              </div>
              <p className="text-[11px] text-stone-500">
                Ask about today's sales, MoM growth, low inventory alerts, and
                retail strategy.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLanguage("hinglish")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  language === "hinglish"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                Hinglish
              </button>
              <button
                type="button"
                onClick={() => setLanguage("hindi")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  language === "hindi"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                हिन्दी
              </button>
              <button
                type="button"
                onClick={() => setLanguage("english")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  language === "english"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                English
              </button>
            </div>

            {/* AI Engine Status & Configuration */}
            <button
              type="button"
              onClick={onOpenAI}
              className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700 hover:border-stone-300 hover:bg-stone-50 transition cursor-pointer"
              title="Click to configure AI Model / API Key"
            >
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium">
                {aiStatus?.mode === "cloud"
                  ? "Cloud LLM (Gemini)"
                  : aiStatus?.mode === "local_gguf"
                    ? "Local Gemma"
                    : "Local Intelligence"}
              </span>
              <Icon name="edit" className="size-3 text-stone-400 ml-0.5" />
            </button>
          </div>
        </div>
      </Card>

      {/* Main Chat Stream Container */}
      <Card className="flex-1 flex flex-col min-h-0 border-stone-200 bg-stone-50/50 overflow-hidden shadow-xs">
        {/* Messages Scroll Area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
        >
          {messages.map((m) => {
            const isUser = m.role === "user"
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-3xl ${
                  isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                {/* Avatar */}
                {isUser ? (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold bg-stone-900 text-white">
                    You
                  </div>
                ) : (
                  <QuaternLogo className="size-8" />
                )}

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl p-4 shadow-xs text-left ${
                    isUser
                      ? "bg-stone-900 text-white rounded-tr-xs max-w-xl"
                      : "bg-white border border-stone-200 text-stone-900 rounded-tl-xs w-full max-w-2xl"
                  }`}
                >
                  {/* Header / Meta */}
                  <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-stone-100/60">
                    <span
                      className={`text-[11px] font-semibold tracking-wide ${
                        isUser ? "text-stone-300" : "text-stone-700"
                      }`}
                    >
                      {isUser ? "Store Owner" : "Quatern Copilot"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] ${
                          isUser ? "text-stone-400" : "text-stone-400"
                        }`}
                      >
                        {new Date(m.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleCopy(m.id, m.text)}
                          className="text-stone-400 hover:text-stone-700 text-[11px] transition cursor-pointer"
                          title="Copy text"
                        >
                          {copiedId === m.id ? (
                            <span className="text-emerald-600 font-medium text-[10px]">
                              Copied!
                            </span>
                          ) : (
                            <Icon name="receipt" className="size-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message Content */}
                  <div
                    className={
                      isUser ? "text-[13px] leading-relaxed text-stone-100" : ""
                    }
                  >
                    {isUser ? m.text : renderMarkdown(m.text)}
                  </div>

                  {/* Structured Metric Badges (if present) */}
                  {!isUser && m.metrics && m.metrics.length > 0 && (
                    <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-stone-100">
                      {m.metrics.map((metric, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-stone-200/90 bg-stone-50/70 p-2 text-left"
                        >
                          <div className="text-[10px] uppercase font-semibold text-stone-500 tracking-wider">
                            {metric.label}
                          </div>
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-sm font-bold text-stone-900">
                              {metric.value}
                            </span>
                            {metric.delta && (
                              <span
                                className={`text-[10px] font-semibold ${
                                  metric.delta.startsWith("+")
                                    ? "text-emerald-600"
                                    : metric.delta.startsWith("-")
                                      ? "text-rose-600"
                                      : "text-stone-600"
                                }`}
                              >
                                {metric.delta}
                              </span>
                            )}
                          </div>
                          {metric.subtext && (
                            <div className="text-[10px] text-stone-400 mt-0.5">
                              {metric.subtext}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Follow-up / Suggested Actions */}
                  {!isUser &&
                    m.suggestedActions &&
                    m.suggestedActions.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-stone-100 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-400 mr-1">
                          Follow-up:
                        </span>
                        {m.suggestedActions.map((action, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (action.includes("Pending Udhaar") && go) {
                                go("pending")
                              } else if (action.includes("Inventory") && go) {
                                go("inventory")
                              } else {
                                handleSend(action)
                              }
                            }}
                            className="rounded-md border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 px-2 py-0.5 text-[11px] font-medium text-stone-700 transition cursor-pointer"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    )}

                  {/* Sources tag */}
                  {!isUser && m.sources && m.sources.length > 0 && (
                    <div className="mt-2 text-[10px] text-stone-400 flex items-center gap-1">
                      <span className="size-1 rounded-full bg-stone-300" />
                      <span>Source: {m.sources.join(" · ")}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Typing Indicator */}
          {loading && (
            <div className="flex gap-3 max-w-xl mr-auto">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-900 border border-amber-300/60">
                <Icon
                  name="sparkles"
                  className="size-4 text-amber-700 animate-spin"
                />
              </div>
              <div className="rounded-2xl rounded-tl-xs border border-stone-200 bg-white p-3.5 shadow-xs flex items-center gap-2">
                <div className="size-2 rounded-full bg-stone-400 animate-bounce" />
                <div
                  className="size-2 rounded-full bg-stone-400 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="size-2 rounded-full bg-stone-400 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
                <span className="text-xs text-stone-500 ml-1">
                  Analyzing store database...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Suggestion Prompt Chips Bar */}
        <div className="px-4 py-2 border-t border-stone-200/80 bg-white shrink-0 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 shrink-0">
            Suggested:
          </span>
          {SUGGESTIONS.map((sug, i) => (
            <button
              key={i}
              type="button"
              disabled={loading}
              onClick={() => handleSend(sug.query)}
              className="shrink-0 rounded-full border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 transition cursor-pointer disabled:opacity-50"
            >
              {sug.label}
            </button>
          ))}
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="ml-auto shrink-0 text-[11px] text-stone-400 hover:text-stone-700 font-medium transition cursor-pointer"
            >
              Clear chat
            </button>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-stone-200 bg-white shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={
                  language === "hindi"
                    ? "दुकान से संबंधित कुछ भी पूछें (उदा. आज की बिक्री, MoM विकास)..."
                    : language === "english"
                      ? "Ask anything about your store (e.g. today's sales, MoM growth)..."
                      : "Poochho kuch bhi (e.g. aaj ki bikri, month-on-month growth, low stock)..."
                }
                disabled={loading}
                className="w-full rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:bg-white focus:outline-none transition shadow-inner"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || loading}
              onClick={() => handleSend()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-medium bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40 transition cursor-pointer shadow-xs"
            >
              <span>Send</span>
              <Icon name="send" className="size-3.5" />
            </button>
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-stone-400 px-1">
            <span>
              Offline-ready · Direct calculations from encrypted SQLite data
            </span>
            <span>Press Enter to send</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
