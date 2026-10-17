import { useState } from "react"
import { useStore } from "./lib/store"
import { Btn, Icon, Input, Modal, QuaternLogo } from "./ui"
import Dashboard from "./views/Dashboard"
import Billing from "./views/Billing"
import Invoices from "./views/Invoices"
import PendingPayments from "./views/PendingPayments"
import Inventory from "./views/Inventory"
import Customers from "./views/Customers"
import Campaigns from "./views/Campaigns"
import Forecast from "./views/Forecast"
import Audit from "./views/Audit"
import Onboarding from "./views/Onboarding"
import MessagingSetupModal from "./views/MessagingSetupModal"
import AISetupModal from "./views/AISetupModal"
import AIAssistant from "./views/AIAssistant"
import { verifyOwnerPin } from "./lib/api"

const nav = [
  ["dashboard", "Dashboard", "home", false],
  ["billing", "New bill", "bill", false],
  ["invoices", "Bills & History", "receipt", false],
  ["pending", "Pending Udhaar", "clock", false],
  ["inventory", "Inventory", "box", false],
  ["customers", "Customers", "users", false],
  ["assistant", "AI Assistant", "sparkles", false],
  ["campaigns", "Campaigns", "send", false],
  ["forecast", "Forecast", "chart", false],
  ["audit", "Data & audit", "shield", true],
] as const

export default function App() {
  const [s, dispatch] = useStore()
  const [view, setView] = useState("dashboard")
  const [isLocked, setIsLocked] = useState(false)
  const [pinModal, setPinModal] = useState(false)
  const [pinInput, setPinInput] = useState("")
  const [pinError, setPinError] = useState("")
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  const [messagingModal, setMessagingModal] = useState(false)
  const [aiModal, setAiModal] = useState(false)

  if (!s.shop.isConfigured) {
    return (
      <Onboarding
        s={s}
        onComplete={(newState) => {
          dispatch({ type: "sync", state: newState })
        }}
      />
    )
  }

  const low = s.products.filter((p) => p.stock <= p.reorder).length
  const pending = s.campaigns.filter(
    (c) => c.status === "Pending approval",
  ).length
  const pendingUdhaar = s.invoices.filter((i) => i.payment === "Credit").length

  const handleNav = (id: string, requiresPin: boolean) => {
    if (requiresPin && isLocked) {
      setPendingNav(id)
      setPinError("")
      setPinInput("")
      setPinModal(true)
    } else {
      setView(id)
    }
  }

  const handleVerifyPin = async () => {
    const ok = await verifyOwnerPin(pinInput)
    if (ok) {
      setIsLocked(false)
      setPinModal(false)
      if (pendingNav) {
        setView(pendingNav)
        setPendingNav(null)
      }
    } else {
      setPinError("Incorrect Owner PIN. Please try again.")
    }
  }

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900 antialiased">
      <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60 px-3 py-4">
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <QuaternLogo className="size-7" />
            <div>
              <div className="text-[13px] font-semibold leading-tight">
                Quatern
              </div>
              <div className="text-[11px] text-stone-500 leading-tight">
                {s.shop.name}
              </div>
            </div>
          </div>
          <button
            type="button"
            title={
              isLocked
                ? "Locked (Cashier mode) - Click to unlock"
                : "Unlocked (Owner mode) - Click to lock"
            }
            onClick={() => {
              if (isLocked) {
                setPendingNav(null)
                setPinError("")
                setPinInput("")
                setPinModal(true)
              } else {
                setIsLocked(true)
              }
            }}
            className={`flex size-6 items-center justify-center rounded transition ${
              isLocked
                ? "bg-amber-100 text-amber-700"
                : "text-stone-400 hover:bg-stone-200/60 hover:text-stone-700"
            }`}
          >
            <Icon name={isLocked ? "lock" : "unlock"} className="size-3.5" />
          </button>
        </div>
        <nav className="space-y-0.5">
          {nav.map(([id, label, icon, reqPin]) => (
            <button
              key={id}
              onClick={() => handleNav(id, reqPin)}
              className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition ${
                view === id
                  ? "bg-white font-medium shadow-sm ring-1 ring-stone-200"
                  : "text-stone-600 hover:bg-stone-200/50"
              }`}
            >
              <Icon name={icon} className="size-4 text-stone-500" />
              {label}
              {reqPin && isLocked && (
                <Icon name="lock" className="ml-1 size-3 text-stone-400" />
              )}
              {id === "inventory" && low > 0 && (
                <span className="ml-auto text-[11px] tabular-nums text-amber-600">
                  {low}
                </span>
              )}
              {id === "pending" && pendingUdhaar > 0 && (
                <span className="ml-auto rounded bg-amber-100 px-1 text-[11px] tabular-nums font-semibold text-amber-700">
                  {pendingUdhaar}
                </span>
              )}
              {id === "campaigns" && pending > 0 && (
                <span className="ml-auto rounded bg-amber-100 px-1 text-[11px] tabular-nums text-amber-700">
                  {pending}
                </span>
              )}
              {id === "assistant" && (
                <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 uppercase tracking-wider">
                  Copilot
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-3 pt-3 border-t border-stone-200 space-y-1.5">
          <button
            type="button"
            onClick={() => setMessagingModal(true)}
            className="flex h-8 w-full items-center justify-between rounded-md border border-stone-200 bg-white px-2.5 text-[12px] font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
          >
            <span className="flex items-center gap-1.5">
              <Icon name="send" className="size-3.5 text-emerald-600" />
              WhatsApp / SMS API
            </span>
            <span
              className="size-2 rounded-full bg-emerald-500"
              title="Messaging active"
            />
          </button>
          <button
            type="button"
            onClick={() => setAiModal(true)}
            className="flex h-8 w-full items-center justify-between rounded-md border border-stone-200 bg-white px-2.5 text-[12px] font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
          >
            <span className="flex items-center gap-1.5">
              <span className="flex size-4 items-center justify-center rounded bg-stone-900 text-[9px] font-bold text-amber-300">
                AI
              </span>
              AI Engine
            </span>
            <span className="text-[10px] text-stone-400 font-mono">
              Offline
            </span>
          </button>
        </div>
        <div className="mt-auto rounded-lg border border-stone-200 bg-white p-3 text-[11px] text-stone-500">
          <div className="flex items-center gap-1.5 font-medium text-stone-700">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Offline · SQLite local
          </div>
          <div className="mt-1">
            All data is encrypted & stored securely on this computer.
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          {view === "dashboard" && (
            <Dashboard
              s={s}
              go={setView}
              onOpenMessaging={() => setMessagingModal(true)}
              onOpenAI={() => setAiModal(true)}
            />
          )}
          {view === "billing" && (
            <Billing
              s={s}
              dispatch={dispatch}
              onOpenMessaging={() => setMessagingModal(true)}
            />
          )}
          {view === "invoices" && <Invoices s={s} dispatch={dispatch} />}
          {view === "pending" && <PendingPayments s={s} dispatch={dispatch} />}
          {view === "inventory" && <Inventory s={s} dispatch={dispatch} />}
          {view === "customers" && <Customers s={s} dispatch={dispatch} />}
          {view === "assistant" && (
            <AIAssistant s={s} onOpenAI={() => setAiModal(true)} go={setView} />
          )}
          {view === "campaigns" && (
            <Campaigns
              s={s}
              dispatch={dispatch}
              onOpenMessaging={() => setMessagingModal(true)}
            />
          )}
          {view === "forecast" && <Forecast s={s} />}
          {view === "audit" && (
            <Audit
              s={s}
              dispatch={dispatch}
              onOpenMessaging={() => setMessagingModal(true)}
              onOpenAI={() => setAiModal(true)}
            />
          )}
        </div>
      </main>

      <MessagingSetupModal
        isOpen={messagingModal}
        onClose={() => setMessagingModal(false)}
      />

      <AISetupModal isOpen={aiModal} onClose={() => setAiModal(false)} />

      {pinModal && (
        <Modal title="Owner PIN required" onClose={() => setPinModal(false)}>
          <div className="space-y-3">
            <p className="text-[13px] text-stone-600">
              Enter your 4–6 digit Owner PIN to access protected settings, cost
              margins, and audit logs.
            </p>
            <Input
              autoFocus
              type="password"
              maxLength={8}
              placeholder="Enter PIN"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value)
                setPinError("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerifyPin()
              }}
              className="text-center font-mono text-base tracking-widest"
            />
            {pinError && (
              <div className="text-[12px] text-red-600 font-medium">
                {pinError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setPinModal(false)}>
                Cancel
              </Btn>
              <Btn onClick={handleVerifyPin}>Unlock</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
