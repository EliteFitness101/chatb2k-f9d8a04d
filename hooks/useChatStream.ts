import { useCallback, useEffect, useRef } from "react";
import { useStreamBuffer } from "./useStreamBuffer";

interface StreamOptions {
  url: string;
  token?: string;
  body?: unknown;
  onChunk: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Abort-safe streaming transport for ChatB2K.
 * Incoming network chunks are frame-buffered before reaching React state.
 */
export function useChatStream() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef<Pick<StreamOptions, "onChunk" | "onComplete" | "onError"> | null>(null);

  const handleFlush = useCallback((chunk: string) => {
    callbacksRef.current?.onChunk(chunk);
  }, []);

  const { pushChunk, clearBuffer } = useStreamBuffer(handleFlush);

  const startStream = useCallback(
    async ({ url, token, body, onChunk, onComplete, onError }: StreamOptions) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      clearBuffer();
      callbacksRef.current = { onChunk, onComplete, onError };

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          Accept: "text/event-stream, text/plain, application/json",
        };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Chat stream failed: HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Chat stream response body is unavailable");
        }

        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value?.byteLength) {
              pushChunk(decoder.decode(value, { stream: true }));
            }
          }

          const trailing = decoder.decode();
          if (trailing) pushChunk(trailing);
        } finally {
          reader.releaseLock();
        }

        // Flush any tokens still waiting for the next animation frame before
        // signalling completion, preventing the final chunk from being lost.
        clearBuffer();
        callbacksRef.current?.onComplete?.();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          callbacksRef.current?.onError?.(
            err instanceof Error ? err : new Error("Unknown chat stream error"),
          );
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        callbacksRef.current = null;
      }
    },
    [clearBuffer, pushChunk],
  );

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearBuffer();
    callbacksRef.current = null;
  }, [clearBuffer]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      clearBuffer();
      callbacksRef.current = null;
    };
  }, [clearBuffer]);

  return { startStream, stopStream };
}
