import { useCallback, useState } from "react";
import { api } from "../api";
import { CleanupRun, CleanupStreamEvent, ReasoningTraceItem } from "../types";

type ToastTone = "info" | "error" | "success";

type Options = {
  onToast: (message: string, tone?: ToastTone) => void;
  onStart?: () => void;
  afterRun?: () => Promise<void> | void;
};

function extractContent(event: CleanupStreamEvent, fallback = ""): string {
  if (event.data && typeof event.data === "object" && "content" in event.data) {
    return String((event.data as { content?: unknown }).content ?? "");
  }
  return fallback;
}

export function useCleanupStream({ onToast, onStart, afterRun }: Options) {
  const [running, setRunning] = useState(false);
  const [runEvents, setRunEvents] = useState<CleanupStreamEvent[]>([]);
  const [reasoningTrace, setReasoningTrace] = useState<ReasoningTraceItem[]>([]);
  const [modelOutput, setModelOutput] = useState("");
  const [liveRun, setLiveRun] = useState<CleanupRun | null>(null);

  const handleEvent = useCallback(
    (event: CleanupStreamEvent) => {
      setRunEvents((current) => [...current.slice(-499), event]);
      if (event.type === "model_delta") {
        setModelOutput((current) => `${current}${event.message}`.slice(-60000));
      }
      if (event.type === "model_result") {
        const content = extractContent(event);
        if (content) setModelOutput((current) => `${current}\n\nRaw model response:\n${content}\n`.slice(-60000));
        onToast("Model response completed.", "success");
      }
      if (event.type === "reasoning") {
        const content = extractContent(event, event.message);
        const metadata =
          event.data && typeof event.data === "object"
            ? (event.data as { emailId?: unknown; from?: unknown; subject?: unknown })
            : {};
        setReasoningTrace((current) => [
          ...current.slice(-99),
          {
            id: `${event.at}-${String(metadata.emailId ?? crypto.randomUUID())}`,
            at: event.at,
            title: event.message,
            from: typeof metadata.from === "string" ? metadata.from : undefined,
            subject: typeof metadata.subject === "string" ? metadata.subject : undefined,
            content
          }
        ]);
        setModelOutput((current) => `${current}\n\n${event.message}\n${content}\n`.slice(-60000));
      }
      if (event.type === "log" && event.message.startsWith("Processing ")) {
        onToast(event.message, "info");
      }
      if (event.type === "run") {
        if (event.data && typeof event.data === "object") setLiveRun(event.data as CleanupRun);
        if ((event.data as CleanupRun | undefined)?.status === "completed") {
          onToast("Cleanup run completed.", "success");
        }
      }
      if (event.type === "error") {
        onToast(event.message, "error");
      }
    },
    [onToast]
  );

  const runCleanup = useCallback(
    (mode: CleanupRun["mode"] = "manual") => {
      setRunning(true);
      onStart?.();
      setRunEvents([]);
      setReasoningTrace([]);
      setModelOutput("");
      setLiveRun(null);
      onToast("Cleanup run started.", "info");
      void api
        .runCleanupStream(mode, handleEvent)
        .then(() => afterRun?.())
        .catch((error: Error) => onToast(error.message, "error"))
        .finally(() => setRunning(false));
    },
    [afterRun, handleEvent, onStart, onToast]
  );

  return { running, runEvents, reasoningTrace, modelOutput, liveRun, runCleanup };
}
