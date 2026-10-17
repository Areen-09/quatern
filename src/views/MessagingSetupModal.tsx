import { useState, useEffect } from "react"
import {
  getMessagingConfig,
  saveMessagingConfig,
  testMessaging,
  MessagingConfig,
} from "../lib/api"
import { Btn, Field, Icon, Input, Modal } from "../ui"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export default function MessagingSetupModal({
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<"whatsapp" | "sms" | "receipts" | "test">(
    "whatsapp",
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState<MessagingConfig>({
    whatsappProvider: "none",
    metaAccessToken: "",
    metaPhoneNumberId: "",
    metaWabaId: "",
    metaTemplateName: "dukaan_receipt",
    smsProvider: "none",
    smsAuthKey: "",
    smsSenderId: "",
    smsEntityId: "",
    smsTemplateId: "",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioPhoneNumber: "",
    twilioWhatsappNumber: "",
    autoSendWhatsapp: false,
    autoSendSms: false,
    receiptFooter: "Thank you for shopping with us! Visit again.",
  })

  // Test state
  const [testPhone, setTestPhone] = useState("+91 ")
  const [testCustomMsg, setTestCustomMsg] = useState("")
  const [testResult, setTestResult] = useState<{
    ok?: boolean
    message?: string
    error?: string
    url?: string
  } | null>(null)
  const [testingChannel, setTestingChannel] =
    useState<"whatsapp" | "sms" | null>(null)

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      getMessagingConfig().then((c) => {
        if (c) setCfg(c)
        setLoading(false)
      })
      setTestResult(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    setSaving(true)
    const res = await saveMessagingConfig(cfg)
    setSaving(false)
    if (res) {
      setCfg(res)
      if (onSaved) onSaved()
      onClose()
    }
  }

  const handleRunTest = async (channel: "whatsapp" | "sms") => {
    const rawDigits = testPhone.replace(/\D/g, "")
    if (rawDigits.length < 10) {
      alert("Please enter a valid 10-digit mobile number")
      return
    }
    setTestingChannel(channel)
    setTestResult(null)

    const res = await testMessaging(
      channel,
      testPhone,
      testCustomMsg.trim() || undefined,
    )
    setTestingChannel(null)
    setTestResult(res)

    if (res.url && channel === "whatsapp") {
      window.open(res.url, "_blank")
    }
  }

  return (
    <Modal
      title="WhatsApp & SMS Gateway Setup"
      onClose={onClose}
      className="max-w-2xl"
    >
      <div className="flex flex-col h-[520px] justify-between">
        {/* Navigation Tabs - Modern Segmented Control */}
        <div>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-stone-100 p-1">
            {[
              { id: "whatsapp", label: "WhatsApp API", icon: "send" },
              { id: "sms", label: "SMS Gateway", icon: "bill" },
              { id: "receipts", label: "Receipts & Rules", icon: "box" },
              { id: "test", label: "Live Test", icon: "shield" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as any)}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-all ${
                  tab === t.id
                    ? "bg-white text-stone-900 shadow-xs font-semibold"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <Icon name={t.icon as any} className="size-3.5" />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Body - Fixed scrollable container keeping constant height */}
        <div className="flex-1 overflow-y-auto py-3 pr-2 space-y-4">
          {/* Tab 1: WhatsApp Configuration */}
          {tab === "whatsapp" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Choose WhatsApp Provider
                </label>
                <div className="mt-2 grid grid-cols-4 gap-2.5">
                  {[
                    { id: "none", title: "Disabled", badge: "OFF" },
                    { id: "wa_me", title: "Direct wa.me", badge: "ZERO COST" },
                    {
                      id: "meta_cloud",
                      title: "Meta Cloud",
                      badge: "OFFICIAL",
                    },
                    { id: "twilio", title: "Twilio", badge: "CLOUD API" },
                  ].map((p) => {
                    const active = cfg.whatsappProvider === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setCfg({ ...cfg, whatsappProvider: p.id as any })
                        }
                        className={`group flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                          active
                            ? "border-stone-900 bg-stone-900 text-white shadow-sm ring-1 ring-stone-900"
                            : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                        }`}
                      >
                        <span className="text-xs font-semibold leading-tight">
                          {p.title}
                        </span>
                        <span
                          className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${
                            active
                              ? "bg-amber-400 text-stone-900"
                              : "bg-stone-100 text-stone-500 group-hover:bg-stone-200/80"
                          }`}
                        >
                          {p.badge}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {cfg.whatsappProvider === "none" && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50 py-12 text-center">
                  <div className="flex size-9 items-center justify-center rounded-full bg-stone-200/70 text-stone-500 mb-2.5">
                    <Icon name="send" className="size-4" />
                  </div>
                  <div className="text-xs font-semibold text-stone-700">
                    WhatsApp Messaging Disabled
                  </div>
                  <div className="mt-1 text-[11px] text-stone-400 max-w-sm leading-relaxed">
                    Select &ldquo;Direct wa.me&rdquo; for instant zero-cost
                    WhatsApp billing, or Meta Cloud / Twilio for automated
                    background dispatch.
                  </div>
                </div>
              )}

              {cfg.whatsappProvider === "wa_me" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                    <span className="flex size-5 items-center justify-center rounded-full bg-emerald-200 text-emerald-800">
                      <Icon name="check" className="size-3" />
                    </span>
                    Direct wa.me Active · Zero Setup Required
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed pl-7">
                    Clicking WhatsApp on any bill launches WhatsApp Web or
                    Desktop with pre-filled messages and receipts. No developer
                    account or API credentials needed.
                  </p>
                  <div className="mt-1 pl-7 flex items-center gap-2 text-[11px] text-emerald-700 font-medium">
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                    100% Free · No Meta Business Verification · No Credit Card
                    Required
                  </div>
                </div>
              )}

              {cfg.whatsappProvider === "meta_cloud" && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-800">
                      Meta WhatsApp Cloud API Credentials
                    </span>
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:underline"
                    >
                      Meta Developers &rarr;
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone Number ID">
                      <Input
                        placeholder="e.g. 104592847592841"
                        value={cfg.metaPhoneNumberId || ""}
                        onChange={(e) =>
                          setCfg({ ...cfg, metaPhoneNumberId: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="WhatsApp Business Account ID (WABA ID)">
                      <Input
                        placeholder="e.g. 109283746501928"
                        value={cfg.metaWabaId || ""}
                        onChange={(e) =>
                          setCfg({ ...cfg, metaWabaId: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Permanent Access Token (System User Token)">
                    <Input
                      type="password"
                      placeholder="EAAGm..."
                      value={cfg.metaAccessToken || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, metaAccessToken: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Message Template Name (Optional)">
                    <Input
                      placeholder="e.g. dukaan_receipt or hello_world"
                      value={cfg.metaTemplateName || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, metaTemplateName: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}

              {cfg.whatsappProvider === "twilio" && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-800">
                      Twilio WhatsApp Credentials
                    </span>
                    <a
                      href="https://console.twilio.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:underline"
                    >
                      Twilio Console &rarr;
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Twilio Account SID">
                      <Input
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={cfg.twilioAccountSid || ""}
                        onChange={(e) =>
                          setCfg({ ...cfg, twilioAccountSid: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Twilio Auth Token">
                      <Input
                        type="password"
                        placeholder="Auth token"
                        value={cfg.twilioAuthToken || ""}
                        onChange={(e) =>
                          setCfg({ ...cfg, twilioAuthToken: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Twilio WhatsApp Sender Number">
                    <Input
                      placeholder="e.g. +14155238886 (or Sandbox number)"
                      value={cfg.twilioWhatsappNumber || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, twilioWhatsappNumber: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: SMS Gateway */}
          {tab === "sms" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Choose SMS Gateway
                </label>
                <div className="mt-2 grid grid-cols-4 gap-2.5">
                  {[
                    { id: "none", title: "Disabled", badge: "OFF" },
                    { id: "msg91", title: "MSG91", badge: "INDIA DLT" },
                    { id: "fast2sms", title: "Fast2SMS", badge: "QUICK OTP" },
                    { id: "twilio", title: "Twilio SMS", badge: "GLOBAL" },
                  ].map((p) => {
                    const active = cfg.smsProvider === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setCfg({ ...cfg, smsProvider: p.id as any })
                        }
                        className={`group flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                          active
                            ? "border-stone-900 bg-stone-900 text-white shadow-sm ring-1 ring-stone-900"
                            : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                        }`}
                      >
                        <span className="text-xs font-semibold leading-tight">
                          {p.title}
                        </span>
                        <span
                          className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${
                            active
                              ? "bg-amber-400 text-stone-900"
                              : "bg-stone-100 text-stone-500 group-hover:bg-stone-200/80"
                          }`}
                        >
                          {p.badge}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {cfg.smsProvider === "none" && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50 py-12 text-center">
                  <div className="flex size-9 items-center justify-center rounded-full bg-stone-200/70 text-stone-500 mb-2.5">
                    <Icon name="bill" className="size-4" />
                  </div>
                  <div className="text-xs font-semibold text-stone-700">
                    SMS Gateway Disabled
                  </div>
                  <div className="mt-1 text-[11px] text-stone-400 max-w-sm leading-relaxed">
                    Select MSG91 (TRAI DLT compliant), Fast2SMS, or Twilio above
                    if you want to enable automatic transaction SMS to buyers.
                  </div>
                </div>
              )}

              {cfg.smsProvider === "msg91" && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-800">
                      MSG91 Indian DLT Credentials
                    </span>
                    <a
                      href="https://msg91.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:underline"
                    >
                      MSG91 Portal &rarr;
                    </a>
                  </div>
                  <Field label="Auth Key">
                    <Input
                      type="password"
                      placeholder="Enter MSG91 AuthKey"
                      value={cfg.smsAuthKey || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, smsAuthKey: e.target.value })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Sender ID / DLT Header (6 characters)">
                      <Input
                        maxLength={6}
                        placeholder="e.g. DUKAAN"
                        value={cfg.smsSenderId || ""}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            smsSenderId: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </Field>
                    <Field label="DLT Entity ID (Principal Entity ID)">
                      <Input
                        placeholder="e.g. 1201159..."
                        value={cfg.smsEntityId || ""}
                        onChange={(e) =>
                          setCfg({ ...cfg, smsEntityId: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="DLT Content Template ID">
                    <Input
                      placeholder="e.g. 1207161..."
                      value={cfg.smsTemplateId || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, smsTemplateId: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}

              {cfg.smsProvider === "fast2sms" && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-800">
                      Fast2SMS Configuration
                    </span>
                    <a
                      href="https://www.fast2sms.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:underline"
                    >
                      Fast2SMS Portal &rarr;
                    </a>
                  </div>
                  <Field label="Fast2SMS Authorization Key">
                    <Input
                      type="password"
                      placeholder="Fast2SMS API Key"
                      value={cfg.smsAuthKey || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, smsAuthKey: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Sender ID (Optional, defaults to TXTIND)">
                    <Input
                      placeholder="e.g. TXTIND or registered DLT header"
                      value={cfg.smsSenderId || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, smsSenderId: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}

              {cfg.smsProvider === "twilio" && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                  <span className="text-xs font-semibold text-stone-800">
                    Twilio SMS Configuration
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Twilio Account SID">
                      <Input
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={cfg.twilioAccountSid || ""}
                        onChange={(e) =>
                          setCfg({ ...cfg, twilioAccountSid: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Twilio Auth Token">
                      <Input
                        type="password"
                        placeholder="Auth token"
                        value={cfg.twilioAuthToken || ""}
                        onChange={(e) =>
                          setCfg({ ...cfg, twilioAuthToken: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Twilio Outbound Phone Number">
                    <Input
                      placeholder="e.g. +1234567890"
                      value={cfg.twilioPhoneNumber || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, twilioPhoneNumber: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Receipts & Automations */}
          {tab === "receipts" && (
            <div className="space-y-4">
              <div className="space-y-2.5 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Automatic Digital Receipts
                </span>
                <label className="flex items-start gap-2.5 pt-1 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.autoSendWhatsapp || false}
                    onChange={(e) =>
                      setCfg({ ...cfg, autoSendWhatsapp: e.target.checked })
                    }
                    className="mt-0.5 rounded border-stone-300 text-stone-900"
                  />
                  <div>
                    <div className="font-semibold text-stone-800">
                      Automatically dispatch bill via WhatsApp
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      When completing checkout for a customer with a saved
                      mobile number, immediately send digital invoice.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 pt-2 text-xs text-stone-700 cursor-pointer border-t border-stone-200/60">
                  <input
                    type="checkbox"
                    checked={cfg.autoSendSms || false}
                    onChange={(e) =>
                      setCfg({ ...cfg, autoSendSms: e.target.checked })
                    }
                    className="mt-0.5 rounded border-stone-300 text-stone-900"
                  />
                  <div>
                    <div className="font-semibold text-stone-800">
                      Automatically dispatch bill via SMS
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      Sends concise transaction total & bill ID via SMS if an
                      SMS Gateway is configured.
                    </div>
                  </div>
                </label>
              </div>

              <Field label="Digital Receipt Footer Message">
                <Input
                  placeholder="e.g. Thank you for shopping with us! Visit again."
                  value={cfg.receiptFooter || ""}
                  onChange={(e) =>
                    setCfg({ ...cfg, receiptFooter: e.target.value })
                  }
                />
              </Field>

              <div className="rounded-xl border border-dashed border-stone-300 bg-white p-3.5 font-mono text-[11px]">
                <div className="text-stone-400 uppercase tracking-wider text-[10px] font-sans mb-1 font-semibold">
                  Receipt Message Live Preview
                </div>
                <div className="text-stone-800 font-semibold truncate">
                  🧾 *My Retail Store*
                </div>
                <div className="text-stone-500 text-[10px]">
                  Invoice: INV-00001 · Today
                </div>
                <div className="my-1.5 border-t border-dashed border-stone-200" />
                <div className="text-stone-700 flex justify-between">
                  <span>1x Atta 5kg</span>
                  <span>₹265.00</span>
                </div>
                <div className="text-stone-700 flex justify-between">
                  <span>2x Milk 500ml</span>
                  <span>₹54.00</span>
                </div>
                <div className="my-1.5 border-t border-dashed border-stone-200" />
                <div className="text-stone-800 font-semibold flex justify-between">
                  <span>Total (Cash)</span>
                  <span>₹319.00</span>
                </div>
                <div className="mt-2 text-stone-500 italic font-sans text-[11px] border-t border-stone-100 pt-1.5 break-words">
                  &ldquo;
                  {cfg.receiptFooter ||
                    "Thank you for shopping with us! Visit again."}
                  &rdquo;
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Live Verification */}
          {tab === "test" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800">
                <span className="font-semibold">Live Message Dispatcher:</span>{" "}
                Enter a mobile number below to verify your WhatsApp link or
                cloud SMS connectivity in real-time.
              </div>

              <Field label="Recipient Mobile Number (with country code)">
                <Input
                  placeholder="+91 98765 43210"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
              </Field>

              <Field label="Custom Test Message (Optional)">
                <Input
                  placeholder="Leave blank for default verification message"
                  value={testCustomMsg}
                  onChange={(e) => setTestCustomMsg(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Btn
                  disabled={testingChannel !== null}
                  onClick={() => handleRunTest("whatsapp")}
                  className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Icon name="send" />
                  {testingChannel === "whatsapp"
                    ? "Sending WhatsApp..."
                    : "Test WhatsApp"}
                </Btn>

                <Btn
                  disabled={
                    testingChannel !== null || cfg.smsProvider === "none"
                  }
                  onClick={() => handleRunTest("sms")}
                  className="justify-center"
                >
                  <Icon name="bill" />
                  {testingChannel === "sms" ? "Sending SMS..." : "Test SMS"}
                </Btn>
              </div>

              {testResult && (
                <div
                  className={`rounded-xl border p-3.5 text-xs ${
                    testResult.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <div className="font-semibold">
                    {testResult.ok ? "✓ Test Successful!" : "✗ Test Failed"}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed">
                    {testResult.message || testResult.error}
                  </div>
                  {testResult.url && (
                    <div className="mt-2.5">
                      <a
                        href={testResult.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline hover:text-emerald-900 break-all"
                      >
                        Open WhatsApp Web chat link &rarr;
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons - Pinned at bottom with constant alignment */}
        <div className="flex items-center justify-between border-t border-stone-200 pt-3.5 mt-1">
          <div className="flex items-center gap-2 text-[11px] text-stone-500">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            <span>
              Active: WhatsApp (
              <strong className="font-semibold text-stone-800 capitalize">
                {cfg.whatsappProvider?.replace("_", " ") || "none"}
              </strong>
              ) · SMS (
              <strong className="font-semibold text-stone-800 capitalize">
                {cfg.smsProvider || "none"}
              </strong>
              )
            </span>
          </div>
          <div className="flex gap-2.5">
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save Configuration"}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
