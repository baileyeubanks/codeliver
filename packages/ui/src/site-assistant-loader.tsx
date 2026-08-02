"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __CCO_CHATBOT_CONFIG__?: {
      apiUrl?: string;
      assistantName?: string;
      domain?: string;
      siteKey?: string;
      surface?: string;
    };
  }
}

type SiteAssistantLoaderProps = {
  apiUrl?: string;
  assistantName?: string;
  domain?: string;
  scriptUrl?: string;
  siteKey?: string;
  surface?: string;
};

export function SiteAssistantLoader({
  apiUrl,
  assistantName,
  domain,
  scriptUrl,
  siteKey,
  surface,
}: SiteAssistantLoaderProps) {
  useEffect(() => {
    if (!scriptUrl || typeof window === "undefined") {
      return;
    }

    window.__CCO_CHATBOT_CONFIG__ = {
      ...window.__CCO_CHATBOT_CONFIG__,
      apiUrl,
      assistantName,
      domain,
      siteKey,
      surface,
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-cco-chatbot="true"]');
    if (existing) {
      return;
    }

    let loaded = false;
    const scriptName = scriptUrl.split("?")[0]?.split("#")[0] || scriptUrl;
    const isWidgetScriptError = (value: unknown) => {
      if (!(value instanceof ErrorEvent)) {
        return false;
      }

      return typeof value.filename === "string" && value.filename.includes(scriptName);
    };

    const cleanup = () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, onInteract);
      }
      window.removeEventListener("error", onGlobalError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };

    const load = () => {
      if (loaded) return;
      loaded = true;
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.defer = true;
      script.dataset.ccoChatbot = "true";
      document.body.appendChild(script);
      cleanup();
    };

    const onInteract = () => load();
    const onGlobalError = (event: ErrorEvent) => {
      if (isWidgetScriptError(event)) {
        event.preventDefault();
      }
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isWidgetScriptError(event.reason)) {
        event.preventDefault();
      }
    };
    const eventOptions: AddEventListenerOptions = { passive: true, once: true };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];

    for (const eventName of events) {
      window.addEventListener(eventName, onInteract, eventOptions);
    }
    window.addEventListener("error", onGlobalError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return cleanup;
  }, [apiUrl, assistantName, domain, scriptUrl, siteKey, surface]);

  return null;
}
