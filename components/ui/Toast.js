import { useEffect, useState } from "react";

let toastQueue = [];
let listeners = [];

function subscribe(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function notify(message, type = "success", duration = 3000) {
  const id = Math.random();
  toastQueue = [...toastQueue, { id, message, type }];
  listeners.forEach((l) => l(toastQueue));

  if (duration > 0) {
    setTimeout(() => {
      toastQueue = toastQueue.filter((t) => t.id !== id);
      listeners.forEach((l) => l(toastQueue));
    }, duration);
  }

  return id;
}

export function useToast() {
  return { notify };
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribe(setToasts);
  }, []);

  return (
    <div className="fixed bottom-20 right-5 z-50 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg pointer-events-auto animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "success"
              ? "bg-success text-white"
              : toast.type === "error"
              ? "bg-danger text-white"
              : "bg-brand text-white"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
