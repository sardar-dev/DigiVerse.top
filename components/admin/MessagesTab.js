import { useEffect, useState } from "react";
import { FormInput } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import Alert from "../ui/Alert";

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MessagesTab() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Compose form
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [targetEmail, setTargetEmail] = useState(""); // blank = broadcast
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendOk, setSendOk] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/messages");
    const data = await res.json();
    setLoading(false);
    if (data.success) setMessages(data.messages || []);
    else setError(data.error || "Failed to load messages.");
  }

  useEffect(() => { load(); }, []);

  async function sendMessage(e) {
    e.preventDefault();
    setSendError("");
    setSendOk(false);
    if (!subject.trim() || !body.trim()) {
      setSendError("Subject and message are required.");
      return;
    }
    setSending(true);

    // Resolve user_id from email if provided
    let user_id = null;
    if (targetEmail.trim()) {
      const res = await fetch(`/api/admin/messages?lookup_email=${encodeURIComponent(targetEmail.trim())}`);
      const data = await res.json();
      if (!data.success || !data.user_id) {
        setSendError(`No user found with email "${targetEmail.trim()}".`);
        setSending(false);
        return;
      }
      user_id = data.user_id;
    }

    const res = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, subject: subject.trim(), body: body.trim() }),
    });
    const data = await res.json();
    setSending(false);
    if (!data.success) {
      setSendError(data.error || "Failed to send.");
      return;
    }
    setSubject("");
    setBody("");
    setTargetEmail("");
    setSendOk(true);
    load();
  }

  async function deleteMsg(id) {
    if (!confirm("Delete this message?")) return;
    await fetch(`/api/admin/messages?id=${id}`, { method: "DELETE" });
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  const unread = messages.filter((m) => !m.read_at).length;
  const withReplies = messages.filter((m) => m.reply_body).length;

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-center">
          <p className="text-2xl font-bold text-ink">{messages.length}</p>
          <p className="text-xs text-muted">Total sent</p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{unread}</p>
          <p className="text-xs text-muted">Unread</p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-600">{withReplies}</p>
          <p className="text-xs text-muted">With replies</p>
        </div>
      </div>

      {/* Compose */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold text-ink">Send a message</h2>
        <form onSubmit={sendMessage} className="space-y-3">
          <FormInput
            label="To (email) — leave blank to broadcast to all users"
            type="email"
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
            placeholder="user@example.com (blank = everyone)"
          />
          <FormInput
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Important update about your order"
            maxLength={120}
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-ink">Message</label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message here…"
              maxLength={2000}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand dark:bg-surface"
            />
            <p className="text-right text-xs text-muted">{body.length}/2000</p>
          </div>
          {sendError && <Alert variant="error">{sendError}</Alert>}
          {sendOk && <Alert variant="success">Message sent successfully.</Alert>}
          <PrimaryButton type="submit" disabled={sending}>
            {sending ? "Sending…" : targetEmail.trim() ? "Send to user" : "Broadcast to all users"}
          </PrimaryButton>
        </form>
      </section>

      {/* Message list */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Sent messages</h2>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">No messages sent yet.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl border p-4 ${msg.reply_body ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30" : msg.read_at ? "border-border bg-surface" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{msg.subject}</p>
                    <p className="text-xs text-muted">
                      {msg.user_email ? `To: ${msg.user_email}` : "📢 Broadcast to all users"}
                      {" · "}
                      {timeAgo(msg.created_at)}
                      {" · "}
                      {msg.reply_body ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">✓ Replied</span>
                      ) : msg.read_at ? (
                        <span className="text-muted">Dismissed</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Unread</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteMsg(msg.id)}
                    className="shrink-0 text-xs text-muted hover:text-red-500"
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>

                <p className="mt-2 text-sm text-ink/80 whitespace-pre-wrap">{msg.body}</p>

                {msg.reply_body && (
                  <div className="mt-3 rounded-lg border border-green-200 bg-green-100 px-3 py-2 dark:border-green-800 dark:bg-green-900/30">
                    <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                      User reply · {timeAgo(msg.reply_at)}
                    </p>
                    <p className="text-sm text-ink whitespace-pre-wrap">{msg.reply_body}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
