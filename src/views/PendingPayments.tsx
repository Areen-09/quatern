import { useState, useMemo } from "react"
import { Action, Invoice, State } from "../lib/store"
import { fmt } from "../lib/money"
import {
  Badge,
  Btn,
  Card,
  Field,
  Icon,
  Input,
  Modal,
  PageHead,
  selectCls,
} from "../ui"
import { openWhatsAppLink, updateInvoice } from "../lib/api"

export default function PendingPayments({
  s,
  dispatch,
}: {
  s: State
  dispatch: (a: Action) => void
}) {
  const [q, setQ] = useState("")
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [settleInvoice, setSettleInvoice] = useState<Invoice | null>(null)
  const [settleMode, setSettleMode] = useState<"Cash" | "UPI" | "Card">("UPI")
  const [reminderModalInvoice, setReminderModalInvoice] =
    useState<Invoice | null>(null)
  const [customReminderText, setCustomReminderText] = useState("")

  // Credit / Udhaar invoices
  const pendingInvoices = useMemo(() => {
    return s.invoices
      .filter((inv) => inv.payment === "Credit")
      .filter((inv) => {
        if (!q.trim()) return true
        const query = q.toLowerCase()
        const matchesNum = inv.number.toLowerCase().includes(query)
        const matchesCust = (inv.customerName || "")
          .toLowerCase()
          .includes(query)
        const matchesPhone = (inv.customerPhone || "")
          .toLowerCase()
          .includes(query)
        const matchesAddr = (inv.customerAddress || "")
          .toLowerCase()
          .includes(query)
        return matchesNum || matchesCust || matchesPhone || matchesAddr
      })
      .sort((a, b) => a.at - b.at) // oldest pending first
  }, [s.invoices, q])

  const totalOutstanding = pendingInvoices.reduce(
    (sum, inv) => sum + inv.total,
    0,
  )
  const customerCount = new Set(
    pendingInvoices.map(
      (inv) =>
        inv.customerPhone || inv.customerId || inv.customerName || inv.id,
    ),
  ).size

  const now = Date.now()
  const oldestPendingDays = pendingInvoices.length
    ? Math.floor(
        (now - Math.min(...pendingInvoices.map((i) => i.at))) /
          (1000 * 60 * 60 * 24),
      )
    : 0

  const handleOpenReminder = (inv: Invoice) => {
    const custName =
      inv.customerName ||
      (inv.customerId
        ? s.customers.find((c) => c.id === inv.customerId)?.name
        : "") ||
      "Valued Customer"
    const daysAgo = Math.floor((now - inv.at) / (1000 * 60 * 60 * 24))
    const daysText =
      daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`
    const defaultMsg = `Namaste ${custName}! Friendly payment reminder from ${s.shop.name || "our store"} regarding your pending bill ${inv.number} (${daysText}) for ${fmt(inv.total)}. Kindly clear the pending balance at your earliest convenience. Thank you!`
    setCustomReminderText(defaultMsg)
    setReminderModalInvoice(inv)
  }

  const handleSendWhatsApp = (inv: Invoice, message: string) => {
    const phone =
      inv.customerPhone ||
      (inv.customerId
        ? s.customers.find((c) => c.id === inv.customerId)?.phone
        : "")
    if (!phone) {
      alert(
        "No phone number recorded for this customer. Please edit the bill to add their phone number.",
      )
      return
    }
    openWhatsAppLink(phone, message)
    setStatusMsg(`✓ Opened WhatsApp reminder for ${phone}`)
    setReminderModalInvoice(null)
    setTimeout(() => setStatusMsg(null), 3500)
  }

  const handleSettle = async () => {
    if (!settleInvoice) return
    const patch = { payment: settleMode }
    dispatch({ type: "updateInvoice", id: settleInvoice.id, patch })
    try {
      await updateInvoice(settleInvoice.id, patch)
    } catch {
      // offline fallback
    }
    setStatusMsg(
      `✓ Bill ${settleInvoice.number} marked as settled via ${settleMode}`,
    )
    setSettleInvoice(null)
    setTimeout(() => setStatusMsg(null), 3500)
  }

  return (
    <>
      <PageHead
        title="Pending Payments (Udhaar)"
        sub="Track credit accounts, manage outstanding dues, and send WhatsApp payment reminders"
      />

      {/* Stats Cards */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-3.5 border-amber-200 bg-amber-50/20">
          <div className="text-[11px] font-medium text-amber-700 uppercase tracking-wider">
            Total Outstanding Udhaar
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-800">
            {fmt(totalOutstanding)}
          </div>
          <div className="text-[11px] text-amber-600 mt-0.5">
            {pendingInvoices.length} unpaid invoices
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
            Pending Customers
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
            {customerCount}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Unique debtors with balance
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
            Oldest Pending Dues
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
            {oldestPendingDays > 0 ? `${oldestPendingDays} days` : "0 days"}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Since earliest credit bill
          </div>
        </Card>
      </div>

      {statusMsg && (
        <div className="mb-3 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-emerald-600 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          />
          <Input
            placeholder="Search pending bills by customer name, phone, or bill #..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Pending Invoices Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-stone-100 text-left text-[12px] text-stone-500">
                <th className="px-4 py-2.5 font-normal">Bill Number</th>
                <th className="px-4 py-2.5 font-normal">Customer</th>
                <th className="px-4 py-2.5 font-normal">Phone & Address</th>
                <th className="px-4 py-2.5 font-normal">
                  Date & Pending Since
                </th>
                <th className="px-4 py-2.5 font-normal text-right">
                  Balance Due
                </th>
                <th className="px-4 py-2.5 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pendingInvoices.map((inv) => {
                const custName =
                  inv.customerName ||
                  (inv.customerId
                    ? s.customers.find((c) => c.id === inv.customerId)?.name
                    : "") ||
                  "Walk-in Customer"
                const custPhone =
                  inv.customerPhone ||
                  (inv.customerId
                    ? s.customers.find((c) => c.id === inv.customerId)?.phone
                    : "")
                const custAddress =
                  inv.customerAddress ||
                  (inv.customerId
                    ? s.customers.find((c) => c.id === inv.customerId)?.address
                    : "")

                const daysPending = Math.floor(
                  (now - inv.at) / (1000 * 60 * 60 * 24),
                )

                return (
                  <tr key={inv.id} className="hover:bg-amber-50/20 transition">
                    <td className="px-4 py-2.5 font-mono font-semibold text-stone-900">
                      {inv.number}
                    </td>
                    <td className="px-4">
                      <div className="font-semibold text-stone-900">
                        {custName}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        {inv.lines.length}{" "}
                        {inv.lines.length === 1 ? "item" : "items"}
                      </div>
                    </td>
                    <td className="px-4 text-xs">
                      {custPhone ? (
                        <div className="font-mono text-stone-700">
                          {custPhone}
                        </div>
                      ) : (
                        <span className="text-amber-600 font-medium">
                          No phone added
                        </span>
                      )}
                      {custAddress && (
                        <div
                          className="text-[11px] text-stone-400 truncate max-w-[200px]"
                          title={custAddress}
                        >
                          {custAddress}
                        </div>
                      )}
                    </td>
                    <td className="px-4 text-xs text-stone-500">
                      <div>
                        {new Date(inv.at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <span
                        className={`text-[10px] font-semibold ${
                          daysPending > 7 ? "text-red-600" : "text-amber-700"
                        }`}
                      >
                        {daysPending === 0
                          ? "Today"
                          : `${daysPending} day${
                              daysPending > 1 ? "s" : ""
                            } overdue`}
                      </span>
                    </td>
                    <td className="px-4 text-right tabular-nums font-bold text-amber-800 text-sm">
                      {fmt(inv.total)}
                    </td>
                    <td className="px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Send WhatsApp Reminder */}
                        <Btn
                          variant="ghost"
                          onClick={() => handleOpenReminder(inv)}
                          className="h-7 px-2.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200"
                        >
                          <Icon name="send" className="size-3.5" />
                          <span>Remind</span>
                        </Btn>

                        {/* Settle Debt Button */}
                        <Btn
                          variant="ghost"
                          onClick={() => {
                            setSettleInvoice(inv)
                            setSettleMode("UPI")
                          }}
                          className="h-7 px-2.5 text-xs text-stone-800 bg-stone-50 hover:bg-stone-100 font-semibold"
                        >
                          <Icon
                            name="check"
                            className="size-3.5 text-emerald-600"
                          />
                          <span>Mark Paid</span>
                        </Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!pendingInvoices.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-xs text-stone-400"
                  >
                    <div className="size-8 mx-auto mb-2 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      ✓
                    </div>
                    <div className="font-semibold text-stone-800 text-sm mb-1">
                      {q.trim()
                        ? `No pending payments matching "${q}"`
                        : "All payments settled! Zero pending udhaar"}
                    </div>
                    <div>
                      {q.trim()
                        ? "Try searching with another name or phone number."
                        : 'Bills created with the "Credit / Udhaar" payment option will automatically appear here for tracking.'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Settle Invoice Modal */}
      {settleInvoice && (
        <Modal
          title={`Settle Bill · ${settleInvoice.number}`}
          onClose={() => setSettleInvoice(null)}
        >
          <div className="space-y-3.5">
            <p className="text-xs text-stone-600">
              Record full payment settlement of{" "}
              <strong className="text-stone-900 font-mono text-sm">
                {fmt(settleInvoice.total)}
              </strong>{" "}
              for <strong>{settleInvoice.customerName || "Customer"}</strong>.
            </p>

            <Field label="Settlement Payment Mode">
              <div className="grid grid-cols-3 gap-2 pt-1">
                {(["UPI", "Cash", "Card"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSettleMode(mode)}
                    className={`h-9 rounded-md border text-xs font-semibold transition ${
                      settleMode === mode
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-200 bg-white hover:bg-stone-50 text-stone-700"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Btn variant="ghost" onClick={() => setSettleInvoice(null)}>
                Cancel
              </Btn>
              <Btn onClick={handleSettle}>
                Confirm Settlement ({settleMode})
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Send WhatsApp Reminder Modal */}
      {reminderModalInvoice && (
        <Modal
          title={`Send Reminder · ${reminderModalInvoice.number}`}
          onClose={() => setReminderModalInvoice(null)}
          className="max-w-lg"
        >
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-xs text-stone-600">
              <span>
                To:{" "}
                <strong>
                  {reminderModalInvoice.customerName || "Customer"}
                </strong>{" "}
                ({reminderModalInvoice.customerPhone || "No phone"})
              </span>
              <span className="font-mono font-bold text-amber-800">
                {fmt(reminderModalInvoice.total)}
              </span>
            </div>

            <Field label="Reminder Message">
              <textarea
                rows={4}
                value={customReminderText}
                onChange={(e) => setCustomReminderText(e.target.value)}
                className="w-full rounded-md border border-stone-200 p-2 text-xs outline-none focus:border-stone-400"
              />
            </Field>

            <div className="flex justify-between items-center pt-2 border-t border-stone-100">
              <span className="text-[11px] text-stone-400">
                Opens WhatsApp Web / Mobile directly
              </span>
              <div className="flex gap-2">
                <Btn
                  variant="ghost"
                  onClick={() => setReminderModalInvoice(null)}
                >
                  Cancel
                </Btn>
                <Btn
                  onClick={() =>
                    handleSendWhatsApp(reminderModalInvoice, customReminderText)
                  }
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  <Icon name="send" />
                  <span>Send on WhatsApp</span>
                </Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
