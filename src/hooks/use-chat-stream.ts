import { useCallback, useEffect, useRef } from "react";

interface StreamOptions {
  url: string;
  token: string;
  body?: unknown;
  onChunk: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

export function useChatStream() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async ({ url, token, body, onChunk, onComplete, onError }: StreamOptions) => {
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Stream request failed with HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Stream response body is null");

        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) onChunk(chunk);
          }

          const tail = decoder.decode();
          if (tail) onChunk(tail);
        } finally {
          reader.releaseLock();
        }

        onComplete?.();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (err.name !== "AbortError") onError?.(err);
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [],
  );

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  return { startStream, stopStream };
}
