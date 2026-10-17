import { useState, useRef, useEffect } from "react"
import { Action, State } from "../lib/store"
import { Btn, Card, CardHead, Field, Icon, Input, Modal, PageHead } from "../ui"
import ImportModal from "./ImportModal"
import {
  updateShop,
  setOwnerPin,
  getAIStatus,
  AIStatus,
  getMessagingConfig,
  MessagingConfig,
} from "../lib/api"

export default function Audit({
  s,
  dispatch,
  onOpenMessaging,
  onOpenAI,
}: {
  s: State
  dispatch: (a: Action) => void
  onOpenMessaging?: () => void
  onOpenAI?: () => void
}) {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [msgConfig, setMsgConfig] = useState<MessagingConfig | null>(null)
  const [importModal, setImportModal] = useState(false)
  const [importTarget, setImportTarget] = useState<"products" | "customers">(
    "products",
  )
  const [editModal, setEditModal] = useState(false)
  const [shopName, setShopName] = useState(s.shop.name)
  const [ownerName, setOwnerName] = useState(s.shop.ownerName || "")
  const [gstin, setGstin] = useState(s.shop.gstin || "")
  const [phone, setPhone] = useState(s.shop.phone || "")
  const [address, setAddress] = useState(s.shop.address || "")
  const [signature, setSignature] = useState(s.shop.signature || "")

  useEffect(() => {
    getAIStatus()
      .then((st) => setAiStatus(st))
      .catch(() => {})
    getMessagingConfig()
      .then((mc) => setMsgConfig(mc))
      .catch(() => {})
  }, [])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], {
      type: "application/json",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `quatern-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#1c1917"
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignature(canvas.toDataURL("image/png"))
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const updated = {
      name: shopName.trim(),
      ownerName: ownerName.trim(),
      gstin: gstin.trim().toUpperCase(),
      phone: phone.trim(),
      address: address.trim(),
      signature: signature || undefined,
    }

    const res = await updateShop(updated)
    dispatch({
      type: "shop",
      shop: {
        ...s.shop,
        ...updated,
        ...(res || {}),
      },
    })
    setEditModal(false)
  }

  return (
    <>
      <PageHead
        title="Data & Settings"
        sub="Manage shop profile, security PIN, SQLite storage, WhatsApp/SMS, and audit logs."
        right={
          <>
            <Btn
              variant="ghost"
              onClick={() => {
                setImportTarget("products")
                setImportModal(true)
              }}
              className="text-stone-700 hover:text-stone-900"
            >
              <Icon name="upload" className="size-3.5 text-stone-500" />
              Import Data (Excel / CSV)
            </Btn>
            <Btn variant="ghost" onClick={exportBackup}>
              Export backup
            </Btn>
            <Btn
              variant="danger"
              onClick={() =>
                confirm(
                  "Are you sure you want to wipe all store data and start fresh?",
                ) && dispatch({ type: "reset" })
              }
            >
              Wipe all data
            </Btn>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Data Import & Migration Card */}
        <Card>
          <CardHead title="Data Import" />
          <div className="space-y-2 p-3 text-[12px] text-stone-600">
            <p className="text-[11px] text-stone-500 leading-tight">
              Import products or customers from .xlsx or .csv files with auto
              column mapping.
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setImportTarget("products")
                  setImportModal(true)
                }}
                className="inline-flex items-center justify-between rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-medium text-stone-800 hover:bg-stone-50"
              >
                <span className="flex items-center gap-1.5">
                  <Icon name="box" className="size-3.5 text-amber-600" />
                  Import Products
                </span>
                <span className="text-[10px] text-stone-400">Excel / CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportTarget("customers")
                  setImportModal(true)
                }}
                className="inline-flex items-center justify-between rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-medium text-stone-800 hover:bg-stone-50"
              >
                <span className="flex items-center gap-1.5">
                  <Icon name="users" className="size-3.5 text-sky-600" />
                  Import Customers
                </span>
                <span className="text-[10px] text-stone-400">Excel / CSV</span>
              </button>
            </div>
          </div>
        </Card>

        {/* Shop Profile Summary */}
        <Card>
          <CardHead
            title="Shop Profile"
            right={
              <button
                type="button"
                onClick={() => setEditModal(true)}
                className="text-xs text-stone-600 hover:text-stone-900 font-medium underline"
              >
                Edit Details
              </button>
            }
          />
          <div className="space-y-2 p-4 text-[12px] text-stone-600">
            <div className="flex justify-between">
              <span className="text-stone-400">Store Name</span>
              <span className="font-semibold text-stone-900">
                {s.shop.name}
              </span>
            </div>
            {s.shop.ownerName && (
              <div className="flex justify-between">
                <span className="text-stone-400">Proprietor</span>
                <span className="text-stone-800">{s.shop.ownerName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-stone-400">Country</span>
              <span className="text-stone-800">
                {s.shop.country || "India"}
              </span>
            </div>
            {s.shop.gstin && (
              <div className="flex justify-between">
                <span className="text-stone-400">GSTIN</span>
                <span className="font-mono text-stone-900">{s.shop.gstin}</span>
              </div>
            )}
            {s.shop.phone && (
              <div className="flex justify-between">
                <span className="text-stone-400">Phone</span>
                <span className="text-stone-800">{s.shop.phone}</span>
              </div>
            )}
            {s.shop.signature && (
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                <span className="text-stone-400">Signature</span>
                <img
                  src={s.shop.signature}
                  alt="Sign"
                  className="h-6 max-w-[90px] object-contain"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Security / PIN */}
        <Card>
          <CardHead title="Access Control" />
          <div className="space-y-3 p-4">
            <p className="text-[12px] text-stone-500">
              Set an Owner PIN to restrict cashiers from viewing profit margins,
              editing supplier purchase prices, or resetting data.
            </p>
            <div>
              <Btn
                variant="ghost"
                onClick={async () => {
                  const currentPin = prompt(
                    "Enter current PIN (leave empty if not set):",
                  )
                  const newPin = prompt(
                    "Enter new 4-6 digit Owner PIN (or leave empty to remove):",
                  )
                  if (newPin !== null) {
                    const ok = await setOwnerPin(
                      currentPin || null,
                      newPin || null,
                    )
                    if (ok) {
                      alert(
                        newPin
                          ? "Owner PIN set successfully!"
                          : "Owner PIN removed.",
                      )
                    } else {
                      alert("Current PIN was incorrect!")
                    }
                  }
                }}
              >
                Configure Owner PIN
              </Btn>
            </div>
          </div>
        </Card>

        {/* Local Storage & Engine */}
        <Card>
          <CardHead title="Storage Engine" />
          <div className="space-y-2 p-4 text-[12px] text-stone-600">
            <div className="flex justify-between">
              <span className="text-stone-400">Database Engine</span>
              <span className="font-medium text-stone-900">
                SQLite 3 (WAL mode)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Financial Arithmetic</span>
              <span className="font-medium text-emerald-600">
                Deterministic Integer Paise
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Invoices Stored</span>
              <span className="font-medium text-stone-900">
                {s.invoices.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Data Location</span>
              <span
                className="text-stone-700 truncate max-w-[150px]"
                title="Stored in Local AppData"
              >
                Offline Local Disk
              </span>
            </div>
          </div>
        </Card>

        {/* WhatsApp & SMS Gateway Card */}
        <Card>
          <CardHead
            title="Messaging APIs"
            right={
              onOpenMessaging && (
                <button
                  type="button"
                  onClick={onOpenMessaging}
                  className="text-xs text-stone-600 hover:text-stone-900 font-medium underline"
                >
                  Configure
                </button>
              )
            }
          />
          <div className="space-y-2 p-4 text-[12px] text-stone-600">
            <div className="flex justify-between">
              <span className="text-stone-400">WhatsApp Gateway</span>
              <span className="font-semibold text-stone-900 capitalize">
                {msgConfig?.whatsappProvider === "none"
                  ? "Disabled"
                  : msgConfig?.whatsappProvider?.replace("_", " ") || "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">SMS Gateway</span>
              <span className="font-semibold text-stone-900 capitalize">
                {msgConfig?.smsProvider === "none"
                  ? "Disabled"
                  : msgConfig?.smsProvider || "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Digital Receipts</span>
              <span className="font-medium text-stone-900">
                {msgConfig?.autoSendWhatsapp || msgConfig?.autoSendSms
                  ? "Auto"
                  : "Manual"}
              </span>
            </div>
            {onOpenMessaging && (
              <div className="pt-2">
                <Btn
                  variant="ghost"
                  className="w-full justify-center text-xs"
                  onClick={onOpenMessaging}
                >
                  Open Gateway Setup
                </Btn>
              </div>
            )}
          </div>
        </Card>

        {/* AI Intelligence Engine Card */}
        <Card>
          <CardHead
            title="AI Engine"
            right={
              onOpenAI && (
                <button
                  type="button"
                  onClick={onOpenAI}
                  className="text-xs text-stone-600 hover:text-stone-900 font-medium underline"
                >
                  Configure
                </button>
              )
            }
          />
          <div className="space-y-2 p-4 text-[12px] text-stone-600">
            <div className="flex justify-between">
              <span className="text-stone-400">Current Mode</span>
              <span className="font-semibold text-stone-900 capitalize">
                {aiStatus?.mode === "heuristic"
                  ? "Heuristic (0MB)"
                  : aiStatus?.mode === "local_gguf"
                    ? "Offline GGUF"
                    : "Cloud LLM"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Model Engine</span>
              <span
                className="font-mono text-[11px] text-stone-700 truncate max-w-[110px]"
                title={aiStatus?.activeModelName}
              >
                {aiStatus?.activeModelName || "Heuristic Rules"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Privacy Status</span>
              <span className="font-medium text-emerald-600">
                Local Only (PII Safe)
              </span>
            </div>
            {onOpenAI && (
              <div className="pt-2">
                <Btn
                  variant="ghost"
                  className="w-full justify-center text-xs"
                  onClick={onOpenAI}
                >
                  AI Engine Settings
                </Btn>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Audit Log Table */}
      <Card>
        <CardHead title={`Audit log · ${s.audit.length} entries`} />
        <div className="divide-y divide-stone-100">
          {s.audit.slice(0, 100).map((e, i) => (
            <div
              key={i}
              className="grid grid-cols-[160px_200px_1fr] px-4 py-2 text-[13px]"
            >
              <span className="tabular-nums text-stone-400">
                {new Date(e.at).toLocaleString("en-IN", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              <span className="font-medium">{e.action}</span>
              <span className="text-stone-600">{e.detail}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Edit Shop Profile Modal */}
      {editModal && (
        <Modal
          title="Edit Shop Profile & Signature"
          onClose={() => setEditModal(false)}
          className="max-w-lg"
        >
          <form onSubmit={handleSaveProfile} className="space-y-3 p-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shop Name *">
                <Input
                  required
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                />
              </Field>
              <Field label="Proprietor / Owner">
                <Input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="GSTIN (Tax Number)">
                <Input
                  placeholder="27ABCDE1234F1Z5"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  className="font-mono uppercase text-xs"
                />
              </Field>
              <Field label="Phone / WhatsApp">
                <Input
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Address">
              <Input
                placeholder="Shop address and locality"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Digital Signature</span>
                {signature && (
                  <button
                    type="button"
                    onClick={() => {
                      setSignature("")
                      const canvas = canvasRef.current
                      if (canvas) {
                        const ctx = canvas.getContext("2d")
                        ctx?.clearRect(0, 0, canvas.width, canvas.height)
                      }
                    }}
                    className="text-stone-400 hover:text-red-600 underline"
                  >
                    Clear signature
                  </button>
                )}
              </div>
              <div className="border border-stone-200 rounded bg-stone-50 p-1">
                <canvas
                  ref={canvasRef}
                  width={380}
                  height={80}
                  className="w-full h-20 bg-white border border-stone-200 rounded cursor-crosshair"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Btn variant="ghost" onClick={() => setEditModal(false)}>
                Cancel
              </Btn>
              <Btn>Save Profile</Btn>
            </div>
          </form>
        </Modal>
      )}

      {importModal && (
        <ImportModal
          initialTarget={importTarget}
          s={s}
          dispatch={dispatch}
          onClose={() => setImportModal(false)}
        />
      )}
    </>
  )
}
