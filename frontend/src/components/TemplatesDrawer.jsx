import React, { useEffect, useState } from "react";
import clsx from "clsx";
import {
  X,
  Plus,
  RefreshCw,
  Trash2,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Phone,
  MessageSquare,
  FileText,
  Eye,
  EyeOff,
  Send,
  Link,
  Save,
} from "lucide-react";
import { Templates } from "../api/client";
import { socket } from "../api/socket";
import TemplateEditor from "./TemplateEditor.jsx";

const STATUS_BADGE = {
  APPROVED: {
    icon: <CheckCircle2 size={14} />,
    cls: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  PENDING: {
    icon: <Clock size={14} />,
    cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  },
  REJECTED: {
    icon: <XCircle size={14} />,
    cls: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  DRAFT: {
    icon: <Clock size={14} />,
    cls: "bg-white/5 text-wati-muted border-wati-border",
  },
  PAUSED: {
    icon: <Clock size={14} />,
    cls: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  DISABLED: {
    icon: <XCircle size={14} />,
    cls: "bg-red-500/10 text-red-500 border-red-500/20",
  },
};

function TemplateSkeleton() {
  return (
    <div className="border border-wati-border rounded-lg bg-wati-sidebar p-3 animate-pulse flex items-center gap-3">
      <div className="w-4 h-4 rounded bg-white/5 shrink-0"></div>
      <div className="flex-1">
        <div className="h-3.5 bg-white/5 rounded w-1/3 mb-1.5"></div>
        <div className="h-2 bg-white/5 rounded w-1/4"></div>
      </div>
      <div className="w-[80px] h-5 rounded bg-white/5 shrink-0"></div>
      <div className="w-6 h-6 rounded bg-white/5 shrink-0"></div>
    </div>
  );
}

// Phone/WhatsApp style preview of a template (mirrors how Meta Business Manager
// previews a template). Used inside each template card in the drawer.
function TemplatePreview({ t }) {
  const header = t.header || {};
  const buttons = Array.isArray(t.buttons) ? t.buttons : [];

  function btnIcon(type) {
    if (type === "URL") return <ExternalLink size={13} />;
    if (type === "PHONE_NUMBER") return <Phone size={13} />;
    return <MessageSquare size={13} />;
  }

  return (
    <div className="mt-2 rounded-lg p-2.5 bg-wati-bg border border-wati-border">
      <div className="rounded-md overflow-hidden bg-wati-sidebar shadow-sm max-w-full">
        {/* Header */}
        {header.type === "IMAGE" && header.mediaUrl && (
          <img
            src={header.mediaUrl}
            alt=""
            className="w-full max-h-[160px] object-cover"
          />
        )}
        {header.type === "VIDEO" && header.mediaUrl && (
          <video
            src={header.mediaUrl}
            controls
            className="w-full max-h-[180px]"
          />
        )}
        {header.type === "DOCUMENT" && header.mediaUrl && (
          <a
            href={header.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-red-500/10 px-3 py-2 hover:bg-red-500/20 border-b border-wati-border"
          >
            <FileText size={18} className="text-red-500 shrink-0" />
            <span className="text-xs font-medium truncate text-wati-text">
              Document
            </span>
          </a>
        )}
        {header.type === "TEXT" && header.text && (
          <div className="px-3 pt-2 text-sm font-semibold break-words text-wati-text">
            {header.text}
          </div>
        )}

        {/* Body */}
        {t.body && (
          <div className="px-3 py-2 whitespace-pre-wrap text-sm text-wati-text break-words">
            {t.body}
          </div>
        )}

        {/* Footer */}
        {t.footer && (
          <div className="px-3 pb-2 text-[11px] text-wati-muted break-words">
            {t.footer}
          </div>
        )}
      </div>

      {/* Buttons - rendered OUTSIDE the bubble, like WhatsApp/Meta preview */}
      {buttons.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {buttons.map((b, i) => (
            <div
              key={i}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-wati-primary bg-wati-panel border border-wati-border rounded-md shadow-sm"
            >
              {btnIcon(b.type)}
              <span className="truncate">
                {b.text || (b.type === "URL" ? "Open link" : "Button")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplatesDrawer({ onClose, onPick }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null); // { type, msg }
  const [expandedId, setExpandedId] = useState(null); // which row shows the preview
  const [pickedId, setPickedId] = useState(null); // template selected via checkbox
  // Per-template demo URL being edited in the expanded view { [templateId]: url }
  const [demoUrlDraft, setDemoUrlDraft] = useState({});

  const picked = list.find((t) => t._id === pickedId) || null;

  const load = async () => {
    const data = await Templates.list();
    setList(data);
  };

  const sync = async () => {
    setLoading(true);
    try {
      await Templates.sync();
      await load();
    } finally {
      setLoading(false);
    }
  };

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }

  function extractError(e) {
    return (
      e?.response?.data?.error ||
      e?.response?.data?.details?.error?.message ||
      e?.message ||
      "Unknown error"
    );
  }

  useEffect(() => {
    load();
    sync();
  }, []);

  useEffect(() => {
    const onUpd = (t) =>
      setList((prev) => {
        const idx = prev.findIndex((x) => x._id === t._id);
        if (idx === -1) return [t, ...prev];
        const copy = prev.slice();
        copy[idx] = t;
        return copy;
      });
    const onDel = ({ id }) =>
      setList((prev) => prev.filter((x) => x._id !== id));
    socket.on("template:update", onUpd);
    socket.on("template:delete", onDel);
    return () => {
      socket.off("template:update", onUpd);
      socket.off("template:delete", onDel);
    };
  }, []);

  async function submit(id) {
    setBusyId(id);
    try {
      await Templates.submit(id);
      await load();
      showToast(
        "success",
        "Template submitted to Meta. Check status in a few minutes.",
      );
    } catch (e) {
      showToast("error", "Submit failed: " + extractError(e));
    } finally {
      setBusyId(null);
    }
  }
  async function refresh(id) {
    setBusyId(id);
    try {
      await Templates.refresh(id);
      await load();
    } catch (e) {
      showToast("error", "Refresh failed: " + extractError(e));
    } finally {
      setBusyId(null);
    }
  }
  async function remove(id) {
    if (
      !confirm(
        "Delete this template?\n\nThis will remove it from Meta (WABA), Cloudinary, and the panel database.",
      )
    )
      return;
    setBusyId(id);
    try {
      const resp = await Templates.delete(id);
      const r = resp?.result || {};
      const parts = [];
      if (r.meta === "deleted") parts.push("Meta ✓");
      else if (r.meta === "not_found_on_meta")
        parts.push("Meta (already gone) ✓");
      else if (r.meta === "skipped_never_submitted")
        parts.push("Meta (draft, skipped)");
      else if (typeof r.meta === "string" && r.meta.startsWith("error"))
        parts.push("Meta ✗");
      if (
        r.cloudinary === "ok" ||
        r.cloudinary === "deleted" ||
        r.cloudinary === "not found"
      )
        parts.push("Cloudinary ✓");
      else if (r.cloudinary === "skipped_no_media")
        parts.push("Cloudinary (no media)");
      else if (
        typeof r.cloudinary === "string" &&
        r.cloudinary.startsWith("error")
      )
        parts.push("Cloudinary ✗");
      if (r.mongo === "deleted") parts.push("DB ✓");
      await load();
      showToast("success", "Template deleted - " + parts.join(" · "));
    } catch (e) {
      // Backend now aborts local delete when Meta refuses (e.g. permission denied)
      // so the DB/Meta never drift apart. Show the hint if one is provided.
      const data = e?.response?.data;
      const hint = data?.hint ? `\n${data.hint}` : "";
      showToast(
        "error",
        `Delete blocked: ${data?.error || extractError(e)}${hint}`,
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex justify-end"
      // Clicking the dimmed backdrop (not the drawer body) dismisses the
      // drawer - matches the user's expectation that clicking empty space
      // closes open overlays.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="w-full max-w-lg bg-wati-sidebar border-l border-wati-border h-full flex flex-col shadow-2xl relative"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-wati-panel text-wati-text flex items-center justify-between border-b border-wati-border">
          <div className="font-semibold text-lg">Templates</div>
          <div className="flex items-center gap-1 text-wati-muted">
            <button
              onClick={sync}
              disabled={loading}
              title="Sync from Meta"
              className="p-2 rounded-full hover:bg-white/5 transition-colors"
            >
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setEditing(true)}
              title="New template"
              className="p-2 rounded-full hover:bg-white/5 transition-colors"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/5 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll p-3 space-y-3">
          {list.length === 0 && loading ? (
            <>
              <TemplateSkeleton />
              <TemplateSkeleton />
              <TemplateSkeleton />
              <TemplateSkeleton />
            </>
          ) : list.length === 0 ? (
            <div className="text-center text-wati-muted text-sm py-8">
              No templates yet. Click{" "}
              <span className="inline-flex items-center">
                <Plus size={14} />
              </span>{" "}
              to create one.
            </div>
          ) : (
            list.map((t) => {
              const badge = STATUS_BADGE[t.status] || STATUS_BADGE.DRAFT;
              const isExpanded = expandedId === t._id;
              const isPicked = pickedId === t._id;
              const canPick = t.status === "APPROVED";
              return (
                <div
                  key={t._id}
                  className={clsx(
                    "border rounded-lg bg-wati-sidebar overflow-hidden transition-colors",
                    isPicked
                      ? "border-wati-primary ring-1 ring-wati-primary/40"
                      : "border-wati-border",
                  )}
                >
                  {/* Compact row: name + select + view */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isPicked}
                      disabled={!canPick}
                      onChange={() => setPickedId(isPicked ? null : t._id)}
                      className="w-4 h-4 accent-wati-primary disabled:opacity-40 cursor-pointer"
                      title={
                        canPick
                          ? "Select to send"
                          : "Only APPROVED templates can be sent"
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {t.name}
                      </div>
                      <div className="text-[11px] text-wati-muted">
                        {t.category} · {t.language}
                      </div>
                    </div>
                    <span
                      className={clsx(
                        "text-[11px] border rounded px-1.5 py-0.5 inline-flex items-center gap-1 shrink-0",
                        badge.cls,
                      )}
                    >
                      {badge.icon} {t.status}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : t._id)}
                      className="p-1.5 rounded hover:bg-wati-panel text-wati-muted shrink-0"
                      title={isExpanded ? "Hide preview" : "View preview"}
                    >
                      {isExpanded ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Expanded area: preview + non-send actions */}
                  {isExpanded &&
                    (() => {
                      // Find the Interested Quick Reply button on this template
                      const intBtn = (t.buttons || []).find(
                        (b) =>
                          b.type === "QUICK_REPLY" &&
                          b.text?.toLowerCase().trim() === "interested",
                      );
                      // Draft URL: use in-progress edit value, or fall back to saved value
                      const currentDemoUrl =
                        demoUrlDraft[t._id] !== undefined
                          ? demoUrlDraft[t._id]
                          : intBtn?.demoUrl || "";

                      async function saveDemoUrl() {
                        setBusyId(t._id);
                        try {
                          await Templates.updateReplies(t._id, {
                            demoUrls: { Interested: currentDemoUrl },
                          });
                          await load();
                          setDemoUrlDraft((prev) => {
                            const n = { ...prev };
                            delete n[t._id];
                            return n;
                          });
                          showToast("success", "Demo URL saved.");
                        } catch (e) {
                          showToast("error", extractError(e));
                        } finally {
                          setBusyId(null);
                        }
                      }

                      return (
                        <div className="px-3 pb-3 border-t border-wati-border bg-wati-panel/30">
                          <TemplatePreview t={t} />
                          {t.rejectedReason && (
                            <div className="mt-2 text-xs text-red-500">
                              Rejected: {t.rejectedReason}
                            </div>
                          )}

                          {/* Demo URL editor — shown whenever the template has an Interested button */}
                          {intBtn && (
                            <div className="mt-3 p-2 border border-wati-border rounded bg-wati-sidebar/50">
                              <div className="flex items-center gap-1 text-[11px] text-wati-muted mb-1.5">
                                <Link size={11} /> Demo URL for Interested reply
                                CTA button
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  value={currentDemoUrl}
                                  onChange={(e) =>
                                    setDemoUrlDraft((prev) => ({
                                      ...prev,
                                      [t._id]: e.target.value,
                                    }))
                                  }
                                  placeholder="https://nexoventlabs.com/demo"
                                  className="flex-1 px-2 py-1.5 bg-wati-panel border border-wati-border text-wati-text rounded text-xs outline-none placeholder-wati-muted"
                                />
                                <button
                                  onClick={saveDemoUrl}
                                  disabled={busyId === t._id}
                                  className="px-2 py-1.5 text-xs bg-wati-primary text-white rounded flex items-center gap-1 disabled:opacity-60 shrink-0"
                                >
                                  <Save size={12} />{" "}
                                  {busyId === t._id ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-2">
                            {t.status === "DRAFT" && (
                              <button
                                onClick={() => submit(t._id)}
                                disabled={busyId === t._id}
                                className="px-3 py-1.5 text-xs bg-wati-primary text-white rounded disabled:opacity-60"
                              >
                                {busyId === t._id
                                  ? "Submitting…"
                                  : "Submit to Meta"}
                              </button>
                            )}
                            {t.status !== "DRAFT" &&
                              t.status !== "APPROVED" && (
                                <button
                                  onClick={() => refresh(t._id)}
                                  disabled={busyId === t._id}
                                  className="px-3 py-1.5 text-xs bg-wati-panel text-wati-text border border-wati-border rounded flex items-center gap-1 disabled:opacity-60 hover:bg-white/5"
                                >
                                  <RefreshCw
                                    size={14}
                                    className={
                                      busyId === t._id ? "animate-spin" : ""
                                    }
                                  />{" "}
                                  Refresh
                                </button>
                              )}
                            <button
                              onClick={() => remove(t._id)}
                              disabled={busyId === t._id}
                              className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 rounded flex items-center gap-1 ml-auto disabled:opacity-60"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                </div>
              );
            })
          )}
        </div>

        {/* Floating Send button - appears when a template is picked via checkbox */}
        {picked && (
          <div className="border-t border-wati-border bg-wati-sidebar p-3 flex items-center gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-wati-muted">
                Selected template
              </div>
              <div className="text-sm font-medium truncate">{picked.name}</div>
            </div>
            <button
              onClick={() => {
                onPick(picked);
                setPickedId(null);
              }}
              className="px-4 py-2 text-sm bg-wati-primary text-white rounded flex items-center gap-2 hover:brightness-110"
            >
              <Send size={16} /> Send
            </button>
          </div>
        )}

        {toast && (
          <div
            className={clsx(
              "absolute bottom-4 left-4 right-4 z-30 px-3 py-2 rounded shadow-lg text-sm flex items-start gap-2 break-words",
              toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-green-600 text-white",
            )}
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

        {editing && (
          <TemplateEditor
            onClose={() => setEditing(false)}
            onCreated={async () => {
              setEditing(false);
              await load();
            }}
          />
        )}
      </div>
    </div>
  );
}
