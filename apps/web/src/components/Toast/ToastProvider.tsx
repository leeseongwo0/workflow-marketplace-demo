import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { Toast } from "./Toast";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  leaving: boolean;
}

const VISIBLE_MS = 3000;
// Keep in sync with --duration-exit / .fm-toast-leave in index.css.
const EXIT_MS = 200;

interface ToastContextValue {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, leaving: false }]);

    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, EXIT_MS);
    }, VISIBLE_MS);
  };

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    addToast(message, type);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  };

  return (
    <ToastContext.Provider value={{ addToast, showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            leaving={toast.leaving}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
