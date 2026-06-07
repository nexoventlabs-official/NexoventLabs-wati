import React, { useEffect, useState, useCallback } from "react";
import {
  Image as ImageIcon,
  UploadCloud,
  Trash2,
  X,
  Save,
  Clock,
  Phone,
  ThumbsUp,
  ThumbsDown,
  Link,
} from "lucide-react";
import AdminShell from "./AdminShell.jsx";
import { Welcome, Uploads } from "../api/client";

export default function AdminFollowUp({ onNavigate, onLogout }) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    delayMinutes: 5,
    callNumber: "",
    callCtaText: "Call Us",
    promptBody: "",
    interestedBody: "",
    notInterestedBody: "",
    demoCTAUrl: "",
    demoCTAText: "Book a Demo",
    notInterestedCtaText: "Our Services",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busySlot, setBusySlot] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await Welcome.getFollowUp();
      setCfg(d);
      setForm({
        delayMinutes: d.delayMinutes ?? 5,
        callNumber: d.callNumber || "",
        callCtaText: d.callCtaText || "Call Us",
        promptBody: d.promptBody || "",
        interestedBody: d.interestedBody || "",
        notInterestedBody: d.notInterestedBody || "",
        demoCTAUrl: d.demoCTAUrl || "",
        demoCTAText: d.demoCTAText || "Book a Demo",
        notInterestedCtaText: d.notInterestedCtaText || "Our Services",
      });
    } catch (e) {
      setError(
        e?.response?.data?.error ||
          e.message ||
          "Failed to load follow-up settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function save() {
    setSaving(true);
    try {
      const d = await Welcome.updateFollowUp(form);
      setCfg(d);
      showToast("success", "Follow-up settings saved.");
    } catch (e) {
      showToast("error", e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickImage(slot, file) {
    if (!file) return;
    setBusySlot(slot);
    try {
      const up = await Uploads.upload(file);
      // The welcome image endpoint stores by slot key.
      await Welcome.setImage(slot, up.url, up.public_id);
      await load();
      showToast("success", "Image updated.");
    } catch (e) {
      showToast("error", e?.response?.data?.error || e.message);
    } finally {
      setBusySlot("");
    }
  }

  async function removeImage(slot) {
    if (!confirm("Remove this image?")) return;
    setBusySlot(slot);
    try {
      await Welcome.removeImage(slot);
      await load();
      showToast("success", "Image removed.");
    } catch (e) {
      showToast("error", e?.response?.data?.error || e.message);
    } finally {
      setBusySlot("");
    }
  }

  return (
    <AdminShell
      active="followup"
      onNavigate={onNavigate}
      onLogout={onLogout}
      title="Follow-up Automation"
    >
      <div className="mb-6 animate-fade-in-up">
        <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">
          Interested / Not Interested follow-up
        </h2>
        <p className="text-[14px] text-slate-500 font-medium mt-1 max-w-3xl">
          After a customer picks a service and receives the demo, we wait a few
          minutes and then send an Interested / Not Interested prompt. Based on
          their tap, they get a tailored reply with a Call button, and their
          status is recorded as Interested / Not Interested in the dashboard.
        </p>
      </div>

      {error && (
        <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {loading && !cfg ? (
        <div className="h-96 bg-white rounded-2xl border border-slate-100 shadow-sm animate-shimmer" />
      ) : (
        <div className="space-y-6 animate-fade-in-up stagger-2 max-w-4xl">
          {/* Timing + call number */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4">
            <Field label="Delay before prompt (minutes)" icon={Clock}>
              <input
                type="number"
                min="0"
                className="adm-input"
                value={form.delayMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, delayMinutes: e.target.value }))
                }
              />
            </Field>
            <Field label="Call number (Call CTA)" icon={Phone}>
              <input
                className="adm-input"
                value={form.callNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, callNumber: e.target.value }))
                }
                placeholder="918106811285"
              />
            </Field>
            <Field label="Call button label">
              <input
                className="adm-input"
                maxLength={20}
                value={form.callCtaText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, callCtaText: e.target.value }))
                }
                placeholder="Call Us"
              />
            </Field>
          </div>

          {/* Prompt message */}
          <Card title="Follow-up prompt (with Interested / Not Interested buttons)">
            <ImageRow
              slot="followup"
              url={cfg?.promptHeader}
              busy={busySlot === "followup"}
              onPick={(f) => pickImage("followup", f)}
              onRemove={() => removeImage("followup")}
            />
            <textarea
              className="adm-input resize-none mt-3"
              rows={3}
              value={form.promptBody}
              onChange={(e) =>
                setForm((f) => ({ ...f, promptBody: e.target.value }))
              }
              placeholder="Did our service catch your interest?"
            />
          </Card>

          {/* Interested reply */}
          <Card title="Interested reply" icon={ThumbsUp} accent="emerald">
            <ImageRow
              slot="interested"
              url={cfg?.interestedHeader}
              busy={busySlot === "interested"}
              onPick={(f) => pickImage("interested", f)}
              onRemove={() => removeImage("interested")}
            />
            <textarea
              className="adm-input resize-none mt-3"
              rows={3}
              value={form.interestedBody}
              onChange={(e) =>
                setForm((f) => ({ ...f, interestedBody: e.target.value }))
              }
              placeholder="Our team will contact you shortly…"
            />
            <div className="mt-4 grid sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
              <Field label="Demo URL (CTA button)" icon={Link}>
                <input
                  className="adm-input"
                  type="url"
                  value={form.demoCTAUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, demoCTAUrl: e.target.value }))
                  }
                  placeholder="https://nexoventlabs.com/demo"
                />
              </Field>
              <Field label="Demo button label">
                <input
                  className="adm-input"
                  maxLength={20}
                  value={form.demoCTAText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, demoCTAText: e.target.value }))
                  }
                  placeholder="Book a Demo"
                />
              </Field>
            </div>
          </Card>

          {/* Not interested reply */}
          <Card title="Not Interested reply" icon={ThumbsDown} accent="amber">
            <ImageRow
              slot="not_interested"
              url={cfg?.notInterestedHeader}
              busy={busySlot === "not_interested"}
              onPick={(f) => pickImage("not_interested", f)}
              onRemove={() => removeImage("not_interested")}
            />
            <textarea
              className="adm-input resize-none mt-3"
              rows={3}
              value={form.notInterestedBody}
              onChange={(e) =>
                setForm((f) => ({ ...f, notInterestedBody: e.target.value }))
              }
              placeholder="Whenever you want to transform your business into a digital presence…"
            />
            <div className="mt-4 border-t border-slate-100 pt-4">
              <Field label={`"Our Services" button label (opens the flow)`}>
                <input
                  className="adm-input"
                  maxLength={30}
                  value={form.notInterestedCtaText}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      notInterestedCtaText: e.target.value,
                    }))
                  }
                  placeholder="Our Services"
                />
              </Field>
            </div>
          </Card>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white text-sm font-semibold shadow-md disabled:opacity-60"
          >
            <Save size={16} /> {saving ? "Saving…" : "Save follow-up settings"}
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm flex items-start gap-2 max-w-sm ${toast.type === "error" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}`}
        >
          <span className="flex-1 whitespace-pre-line">{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            className="opacity-80 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon size={13} />} {label}
      </span>
      {children}
    </label>
  );
}

function Card({ title, icon: Icon, accent = "slate", children }) {
  const accentCls =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "amber"
        ? "text-amber-600"
        : "text-admin-accent";
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        {Icon && <Icon size={18} className={accentCls} />} {title}
      </div>
      {children}
    </div>
  );
}

function ImageRow({ url, busy, onPick, onRemove }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-28 h-20 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200 shrink-0">
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={22} className="text-slate-300" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white text-[13px] font-semibold cursor-pointer shadow-sm">
          <UploadCloud size={15} />
          {busy ? "Uploading…" : url ? "Replace" : "Upload header"}
          <input
            type="file"
            hidden
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              onPick(f);
            }}
          />
        </label>
        {url && (
          <button
            onClick={onRemove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 rounded-xl disabled:opacity-60"
          >
            <Trash2 size={15} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
