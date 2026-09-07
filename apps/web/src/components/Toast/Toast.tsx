interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}

const typeStyles = {
  success: "border-l-4 border-green-600 bg-green-900/20 text-green-400",
  error: "border-l-4 border-red-600 bg-red-900/20 text-red-400",
  info: "border-l-4 border-blue-600 bg-blue-900/20 text-blue-400",
};

export function Toast({ message, type, onClose }: ToastProps) {
  return (
    <div
      className={`slide-in-right min-w-[280px] max-w-sm px-4 py-3 rounded-lg border-l-4 ${typeStyles[type]} text-white shadow-lg transition-all duration-300 ease-out`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={onClose}
          className="ml-4 text-white/70 hover:text-white transition-colors"
          aria-label="Close toast"
        >
          ✕
        </button>
      </div>
    </div>
  );
}