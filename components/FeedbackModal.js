import { useState } from "react";
import Modal from "./ui/Modal";
import Alert from "./ui/Alert";
import { FormInput, FormTextarea } from "./ui/FormInput";
import { PrimaryButton } from "./ui/Button";

const ERRORS = {
  invalid_email: "Please enter a valid email address.",
  message_required: "Please write a short message.",
  message_too_long: "That's a bit long — please keep it under 2000 characters.",
  too_many_requests: "You've sent a lot of feedback recently — please try again later.",
};

export default function FeedbackModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, website }),
      });
      const data = await res.json();
      if (data.success) setSent(true);
      else setError(ERRORS[data.error] || "Couldn't send feedback — please try again.");
    } catch {
      setError("Couldn't send feedback — check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <Modal title="Give us feedback" onClose={onClose}>
      {sent ? (
        <div className="space-y-4">
          <Alert variant="success">Thank you! Your feedback helps us improve.</Alert>
          <PrimaryButton onClick={onClose} className="w-full">
            Close
          </PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted">
            Tell us what we can do better — we read every message.
          </p>
          <FormInput
            label="Your email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            maxLength={200}
          />
          <FormTextarea
            label="Your feedback"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="What should we improve?"
            required
          />
          {/* Honeypot — hidden from people, bots tend to fill it */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />
          <Alert variant="error">{error}</Alert>
          <PrimaryButton type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Submit"}
          </PrimaryButton>
        </form>
      )}
    </Modal>
  );
}
