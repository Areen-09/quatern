import { useState, useEffect } from "react"
import {
  getAIStatus,
  saveAIConfig,
  downloadAIModel,
  getAIDownloadProgress,
  AIStatus,
  AIConfig,
} from "../lib/api"
import { Btn, Card, Field, Icon, Input, Modal, selectCls } from "../ui"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export default function AISetupModal({ isOpen, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [mode, setMode] = useState<"heuristic" | "local_gguf" | "cloud">(
    "heuristic",
  )
  const [cloudProvider, setCloudProvider] = useState<"gemini" | "groq">(
    "gemini",
  )
  const [apiKey, setApiKey] = useState("")
  const [prefLang, setPrefLang] = useState<"hinglish" | "hindi" | "english">(
    "hinglish",
  )
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    if (isOpen) {
      loadStatus()
    }
  }, [isOpen])

  // Polling download progress if downloading
  useEffect(() => {
    let timer: any = null
    if (downloading) {
      timer = setInterval(async () => {
        const prog = await getAIDownloadProgress()
        setDownloadProgress(prog.progress)
        if (!prog.downloading) {
          setDownloading(false)
          loadStatus()
        }
      }, 1500)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [downloading])

  const loadStatus = async () => {
    const st = await getAIStatus()
    setStatus(st)
    setMode(st.mode)
    setDownloading(st.downloading)
    setDownloadProgress(st.downloadProgress)
  }

  if (!isOpen) return null

  const handleSave = async () => {
    setSaving(true)
    await saveAIConfig({
      mode,
      cloudProvider,
      apiKey: apiKey.trim(),
      preferredLanguage: prefLang,
    })
    setSaving(false)
    if (onSaved) onSaved()
    onClose()
  }

  const handleStartDownload = async () => {
    setDownloading(true)
    setDownloadProgress(1)
    const res = await downloadAIModel()
    if (!res.ok) {
      alert(res.message || "Failed to start download")
      setDownloading(false)
    }
  }

  return (
    <Modal
      title="AI & Intelligence Engine Setup"
      onClose={onClose}
      className="max-w-2xl"
    >
      <div className="flex flex-col h-[520px] justify-between">
        <div className="flex-1 overflow-y-auto pr-2 space-y-4 py-1">
          <p className="text-xs text-stone-500">
            Quatern uses intelligence to suggest customer targeting, refill
            cycles, and Hinglish WhatsApp campaigns. Choose how your AI model
            runs:
          </p>

          {/* Intelligence Tier Selector */}
          <div className="space-y-2">
            {[
              {
                id: "heuristic",
                title: "Built-in Heuristic Baseline",
                badge: "Default · 0 MB",
                desc: "Deterministic purchase interval & replenishment calculations. 100% offline with zero extra RAM or downloads required.",
              },
              {
                id: "local_gguf",
                title: "Offline Small LLM (Gemma 4 E2B Q4_K_M)",
                badge: "Offline · ~1.3 GB",
                desc: "Google DeepMind Gemma 4 E2B quantized edge model. Runs on CPU with minimal RAM for natural Hinglish/Hindi marketing copy.",
              },
              {
                id: "cloud",
                title: "Cloud LLM (Gemini 1.5 Flash / Groq)",
                badge: "Fastest · Free Tier",
                desc: "Uses a free API key from Google AI Studio. Lightning-fast response times with zero RAM consumed on your machine.",
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id as any)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  mode === t.id
                    ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                    : "border-stone-200 bg-white text-stone-900 hover:border-stone-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.title}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      mode === t.id
                        ? "bg-amber-300 text-stone-900"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {t.badge}
                  </span>
                </div>
                <p
                  className={`mt-1 text-[11px] leading-relaxed ${
                    mode === t.id ? "text-stone-300" : "text-stone-500"
                  }`}
                >
                  {t.desc}
                </p>
              </button>
            ))}
          </div>

          {/* Tier 1 Detail: Local GGUF Download Status */}
          {mode === "local_gguf" && (
            <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-800">
                  Local Gemma 4 E2B Model Status
                </span>
                {status?.localModelInstalled ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <Icon name="check" className="size-3.5" /> Installed & Ready
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-700 font-medium">
                    Not Downloaded Yet (~1.3 GB)
                  </span>
                )}
              </div>

              {status?.localModelInstalled ? (
                <div className="text-[11px] text-stone-500 break-all font-mono">
                  Location: {status.localModelPath}
                </div>
              ) : downloading ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-stone-600">
                    <span>Downloading Gemma 4 E2B Q4_K_M GGUF...</span>
                    <span className="font-semibold tabular-nums">
                      {downloadProgress.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-stone-200 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-stone-400">
                    Downloading from HuggingFace to your local storage. You can
                    continue billing while it downloads.
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-stone-500">
                    Download once to run 100% offline:
                  </span>
                  <Btn onClick={handleStartDownload} className="text-xs">
                    <Icon name="box" /> Download Model (~1.3 GB)
                  </Btn>
                </div>
              )}
            </div>
          )}

          {/* Tier 2 Detail: Cloud API Key */}
          {mode === "cloud" && (
            <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-800">
                  Cloud API Credentials
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Get Free Gemini API Key &rarr;
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cloud Provider">
                  <select
                    value={cloudProvider}
                    onChange={(e) => setCloudProvider(e.target.value as any)}
                    className={selectCls}
                  >
                    <option value="gemini">
                      Google Gemini 1.5 Flash (Free Tier)
                    </option>
                    <option value="groq">Groq (Ultra-Fast Llama-3)</option>
                  </select>
                </Field>
                <Field label="API Key">
                  <Input
                    type="password"
                    placeholder="Enter API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* Language Preference */}
          <div className="rounded-lg border border-stone-200 bg-white p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-stone-800">
                Preferred Campaign Language
              </div>
              <div className="text-[11px] text-stone-500">
                Default tone used for auto-generated messages
              </div>
            </div>
            <div className="flex gap-1 rounded-md bg-stone-100 p-0.5">
              {[
                { id: "hinglish", label: "Hinglish" },
                { id: "hindi", label: "Hindi" },
                { id: "english", label: "English" },
              ].map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setPrefLang(l.id as any)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    prefLang === l.id
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-500 hover:text-stone-900"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-stone-200 pt-3">
          <div className="text-[11px] text-stone-500">
            Active Mode:{" "}
            <span className="font-semibold text-stone-800 capitalize">
              {mode.replace("_", " ")}
            </span>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save AI Configuration"}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
