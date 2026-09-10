import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./wagmi";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();

function showBootstrapError(error: unknown) {
  const root = document.getElementById("root");
  if (!root) return;
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = "";
  const panel = document.createElement("main");
  panel.style.cssText = "min-height:100vh;padding:32px;background:#050505;color:#fff;font-family:sans-serif";
  panel.innerHTML = `<h1 style="font-size:24px;margin-bottom:12px">Hyper-Cross Nexus could not load</h1><p style="color:#fca5a5">${message.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character)}</p>`;
  root.appendChild(panel);
  console.error("Application bootstrap failed", error);
}

window.addEventListener("error", (event) => {
  showBootstrapError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showBootstrapError(event.reason);
});

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  private readonly children: ReactNode;
  state: { error: Error | null } = { error: null };

  constructor(props: { children: ReactNode }) {
    super(props);
    this.children = props.children;
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: "100vh", padding: "32px", background: "#050505", color: "#fff", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>Hyper-Cross Nexus could not load</h1>
          <p style={{ color: "#fca5a5", marginBottom: "16px" }}>{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 16px", color: "#fff", background: "#1500ff", border: 0, borderRadius: "6px", cursor: "pointer" }}>
            Reload application
          </button>
        </main>
      );
    }
    return this.children;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  showBootstrapError("The application root element is missing.");
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <AppErrorBoundary>
          <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </WagmiProvider>
        </AppErrorBoundary>
      </StrictMode>
    );
  } catch (error) {
    showBootstrapError(error);
  }
}

