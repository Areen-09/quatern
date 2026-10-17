import { useState, useEffect } from "react"
import { Action, Campaign, State, segmentOf, uid } from "../lib/store"
import {
  Badge,
  Btn,
  Card,
  CardHead,
  Field,
  Icon,
  Input,
  PageHead,
  Tone,
  selectCls,
} from "../ui"
import {
  broadcastCampaign,
  openWhatsAppLink,
  getAIRecommendations,
  AIRecommendation,
  getMessagingConfig,
  MessagingConfig,
} from "../lib/api"
import AISetupModal from "./AISetupModal"
import MessagingSetupModal from "./MessagingSetupModal"

const tone = (st: Campaign["status"]): Tone =>
  st === "Sent"
    ? "green"
    : st === "Pending approval"
      ? "amber"
      : st === "Rejected"
        ? "red"
        : "stone"

export default function Campaigns({
  s,
  dispatch,
  onOpenMessaging,
}: {
  s: State
  dispatch: (a: Action) => void
  onOpenMessaging?: () => void
}) {
  const [d, setD] = useState({
    name: "",
    channel: "WhatsApp" as Campaign["channel"],
    segment: "All consented",
    message: "Namaste {name}! ",
  })
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [aiRecs, setAiRecs] = useState<AIRecommendation[]>([])
  const [aiModal, setAiModal] = useState(false)
  const [messagingModal, setMessagingModal] = useState(false)
  const [loadingAi, setLoadingAi] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [messagingConfig, setMessagingConfig] =
    useState<MessagingConfig | null>(null)
  const [cardLangs, setCardLangs] =
    useState<Record<string, "hinglish" | "hindi" | "english">>({})

  const reach = segmentOf(s, d.segment)

  useEffect(() => {
    loadConfig()
    loadRecommendations()
  }, [])

  const loadConfig = async () => {
    setLoadingConfig(true)
    const c = await getMessagingConfig()
    setMessagingConfig(c)
    setLoadingConfig(false)
  }

  const loadRecommendations = async () => {
    setLoadingAi(true)
    const recs = await getAIRecommendations()
    setAiRecs(recs)
    setLoadingAi(false)
  }

  const isWhatsAppConfigured = Boolean(
    messagingConfig &&
      (messagingConfig.whatsappProvider === "wa_me" ||
        (messagingConfig.whatsappProvider === "meta_cloud" &&
          messagingConfig.metaAccessToken &&
          messagingConfig.metaPhoneNumberId) ||
        (messagingConfig.whatsappProvider === "twilio" &&
          messagingConfig.twilioAccountSid &&
          messagingConfig.twilioAuthToken &&
          messagingConfig.twilioWhatsappNumber)),
  )

  const isSmsConfigured = Boolean(
    messagingConfig &&
      (((messagingConfig.smsProvider === "msg91" ||
        messagingConfig.smsProvider === "fast2sms") &&
        messagingConfig.smsAuthKey &&
        messagingConfig.smsAuthKey !== "test_key") ||
        (messagingConfig.smsProvider === "twilio" &&
          messagingConfig.twilioAccountSid &&
          messagingConfig.twilioAuthToken &&
          messagingConfig.twilioPhoneNumber)),
  )

  const isConfigured = Boolean(
    messagingConfig &&
      messagingConfig.updatedAt &&
      messagingConfig.updatedAt > 0 &&
      (isWhatsAppConfigured || isSmsConfigured),
  )

  const handleApplyRecommendation = (r: AIRecommendation) => {
    const lang = cardLangs[r.id] || "hinglish"
    const msg =
      lang === "hindi"
        ? r.copyHindi
        : lang === "english"
          ? r.copyEnglish
          : r.copyHinglish

    setD({
      name: r.title,
      channel:
        r.suggestedChannel as any ||
        (isWhatsAppConfigured ? "WhatsApp" : "SMS"),
      segment: r.tagFilter || "All consented",
      message: msg,
    })
  }

  const handleApproveAndSend = async (c: Campaign) => {
    setSendingId(c.id)
    const recipients = segmentOf(s, c.segment).map((cust) => ({
      phone: cust.phone,
      name: cust.name,
    }))

    if (recipients.length > 0) {
      const res = await broadcastCampaign(
        c.id,
        c.channel,
        c.message,
        recipients,
      )
      if (!res.ok && c.channel === "WhatsApp" && recipients[0]) {
        const text = c.message.replace(
          "{name}",
          recipients[0].name.split(" ")[0] || "Customer",
        )
        openWhatsAppLink(recipients[0].phone, text)
      }
    }
    dispatch({ type: "campaignStatus", id: c.id, status: "Sent" })
    setSendingId(null)
  }

  const openConfig = () => {
    if (onOpenMessaging) onOpenMessaging()
    else setMessagingModal(true)
  }

  return (
    <>
      <PageHead
        title="Campaigns & Messaging"
        sub="Broadcast messages go only to customers who opted in, and only after you approve."
        right={
          <div className="flex items-center gap-2">
            {isConfigured && (
              <button
                type="button"
                onClick={() => setAiModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-xs hover:border-stone-300 hover:bg-stone-50"
              >
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                AI Engine Settings
              </button>
            )}
            <Btn variant="ghost" onClick={openConfig}>
              <Icon name="send" /> WhatsApp / SMS Setup
            </Btn>
          </div>
        }
      />

      {/* If neither WhatsApp nor SMS is configured, show setup gateway state first */}
      {!loadingConfig && !isConfigured ? (
        <Card className="my-8 max-w-lg mx-auto p-8 text-center border-stone-200 shadow-xs">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 mb-3">
            <Icon name="send" className="size-6" />
          </div>
          <h2 className="text-base font-semibold text-stone-900">
            Setup WhatsApp or SMS Gateway
          </h2>
          <p className="mt-2 text-xs text-stone-500 leading-relaxed">
            To start creating and broadcasting marketing campaigns, refill
            reminders, and customer offers, please configure your WhatsApp or
            SMS gateway first.
          </p>
          <div className="mt-5 flex justify-center">
            <Btn onClick={openConfig}>
              <Icon name="send" /> Configure Gateway
            </Btn>
          </div>
        </Card>
      ) : (
        <>
          {/* AI Audience Radar Component - Only shown if real targeting opportunities exist */}
          {aiRecs.length > 0 && (
            <Card className="mb-4 border-amber-200/80 bg-gradient-to-r from-amber-50/40 via-stone-50 to-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs font-semibold text-stone-900 flex items-center gap-1.5">
                    <span className="flex size-5 items-center justify-center rounded bg-stone-900 text-[10px] text-amber-300 font-bold">
                      AI
                    </span>
                    AI Audience Radar · Smart Targeting Suggestions
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    Analyzes offline purchasing intervals, staples refill
                    cycles, and slow-moving stock to suggest high-conversion
                    campaigns.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadRecommendations}
                    disabled={loadingAi}
                    className="text-xs text-stone-500 hover:text-stone-900 font-medium underline"
                  >
                    {loadingAi ? "Analyzing..." : "Refresh Radar"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {aiRecs.map((r) => {
                  const currentLang = cardLangs[r.id] || "hinglish"
                  const currentText =
                    currentLang === "hindi"
                      ? r.copyHindi
                      : currentLang === "english"
                        ? r.copyEnglish
                        : r.copyHinglish
                  const badgeTone =
                    r.archetype === "replenishment_overdue"
                      ? "amber"
                      : r.archetype === "win_back_inactive"
                        ? "blue"
                        : "green"

                  return (
                    <div
                      key={r.id}
                      className="flex flex-col justify-between rounded-lg border border-stone-200 bg-white p-3 shadow-xs hover:border-stone-300 transition"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span
                            className="text-xs font-semibold text-stone-900 truncate"
                            title={r.title}
                          >
                            {r.title}
                          </span>
                          <Badge tone={badgeTone as any}>
                            {r.eligibleCustomerCount > 0
                              ? `${r.eligibleCustomerCount} matches`
                              : "Ready"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                          {r.rationale}
                        </p>

                        {/* Language Selector */}
                        <div className="my-2 flex items-center justify-between border-y border-stone-100 py-1.5">
                          <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">
                            Preview Tone:
                          </span>
                          <div className="flex gap-1 text-[10px]">
                            {(["hinglish", "hindi", "english"] as const).map(
                              (lang) => (
                                <button
                                  key={lang}
                                  type="button"
                                  onClick={() =>
                                    setCardLangs({ ...cardLangs, [r.id]: lang })
                                  }
                                  className={`rounded px-1.5 py-0.5 font-medium capitalize transition ${
                                    currentLang === lang
                                      ? "bg-stone-900 text-white"
                                      : "text-stone-500 hover:bg-stone-100"
                                  }`}
                                >
                                  {lang}
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        <div className="rounded-md bg-stone-50 p-2 font-sans text-[11px] text-stone-700 leading-snug line-clamp-3">
                          {currentText}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-[10px] text-stone-400">
                          {r.suggestedDiscountPct > 0
                            ? `${r.suggestedDiscountPct}% off suggested`
                            : "Personalized"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleApplyRecommendation(r)}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                        >
                          Use this campaign &rarr;
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-[380px_1fr] items-start gap-3">
            <Card>
              <CardHead title="New campaign" />
              <div className="space-y-3 p-4">
                <Field label="Name">
                  <Input
                    value={d.name}
                    onChange={(e) => setD({ ...d, name: e.target.value })}
                    placeholder="e.g. Weekend atta offer"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Channel">
                    <select
                      value={d.channel}
                      onChange={(e) =>
                        setD({
                          ...d,
                          channel: e.target.value as Campaign["channel"],
                        })
                      }
                      className={selectCls}
                    >
                      {isWhatsAppConfigured && (
                        <option value="WhatsApp">WhatsApp</option>
                      )}
                      {isSmsConfigured && <option value="SMS">SMS</option>}
                      {!isWhatsAppConfigured && !isSmsConfigured && (
                        <option value="WhatsApp">WhatsApp</option>
                      )}
                    </select>
                  </Field>
                  <Field label="Audience">
                    <select
                      value={d.segment}
                      onChange={(e) => setD({ ...d, segment: e.target.value })}
                      className={selectCls}
                    >
                      <option>All consented</option>
                      <option>Regular</option>
                      <option>New</option>
                    </select>
                  </Field>
                </div>
                <Field label="Message · use {name} to personalise">
                  <textarea
                    rows={4}
                    value={d.message}
                    onChange={(e) => setD({ ...d, message: e.target.value })}
                    className="w-full rounded-md border border-stone-200 p-2.5 text-[13px] outline-none focus:border-stone-400"
                  />
                </Field>
                <div className="rounded-lg bg-[#e7f3e3] p-3 text-[13px] text-stone-800">
                  {d.message
                    .split("{name}")
                    .join(reach[0]?.name.split(" ")[0] ?? "Customer")}
                  <div className="mt-1 text-right text-[10px] text-stone-500">
                    Reply STOP to opt out
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-stone-500">
                    {reach.length} recipients · {d.message.length} chars
                  </span>
                  <Btn
                    disabled={!d.name || !reach.length}
                    onClick={() => {
                      dispatch({
                        type: "campaign",
                        campaign: {
                          id: uid(),
                          ...d,
                          status: "Pending approval",
                          createdAt: Date.now(),
                        },
                      })
                      setD({ ...d, name: "", message: "Namaste {name}! " })
                    }}
                  >
                    Submit for approval
                  </Btn>
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="All campaigns" />
              {s.campaigns.length > 0 ? (
                <div className="divide-y divide-stone-100">
                  {s.campaigns.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-4 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium">
                            {c.name}
                          </span>
                          <Badge tone={tone(c.status)}>{c.status}</Badge>
                          <Badge>{c.channel}</Badge>
                        </div>
                        <p className="mt-1 truncate text-[12px] text-stone-500">
                          {c.message}
                        </p>
                        <p className="mt-1 text-[11px] text-stone-400">
                          {c.segment} ·{" "}
                          {c.status === "Sent"
                            ? `${c.sentTo ?? 0} sent · ${c.conversions ?? 0} conversions`
                            : `${segmentOf(s, c.segment).length} would receive`}
                        </p>
                      </div>
                      {c.status === "Pending approval" && (
                        <div className="flex shrink-0 gap-2">
                          <Btn
                            variant="danger"
                            onClick={() =>
                              dispatch({
                                type: "campaignStatus",
                                id: c.id,
                                status: "Rejected",
                              })
                            }
                          >
                            Reject
                          </Btn>
                          <Btn
                            disabled={sendingId === c.id}
                            onClick={() => handleApproveAndSend(c)}
                          >
                            <Icon name="check" />
                            {sendingId === c.id
                              ? "Sending..."
                              : "Approve & send"}
                          </Btn>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-stone-400">
                  <div className="font-medium text-stone-700 mb-1">
                    No campaigns created yet
                  </div>
                  <div>
                    Compose a promotional offer on the left to reach your
                    customers.
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <AISetupModal
        isOpen={aiModal}
        onClose={() => setAiModal(false)}
        onSaved={loadRecommendations}
      />

      <MessagingSetupModal
        isOpen={messagingModal}
        onClose={() => setMessagingModal(false)}
        onSaved={() => {
          loadConfig()
          loadRecommendations()
        }}
      />
    </>
  )
}
