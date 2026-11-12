import { useCallback, useEffect, useRef } from "react";
import { useStreamBuffer } from "./useStreamBuffer";

export interface StreamOptions {
  url: string;
  token: string;
  onChunk: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Authenticated streaming transport for ChatB2K.
 * Network reads remain lossless while UI delivery is frame-buffered.
 */
export function useChatStream() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);
  const onChunkRef = useRef<((chunk: string) => void) | null>(null);

  const { pushChunk, clearBuffer } = useStreamBuffer((chunk) => {
    onChunkRef.current?.(chunk);
  });

  const startStream = useCallback(
    async ({ url, token, onChunk, onComplete, onError }: StreamOptions) => {
      abortControllerRef.current?.abort();
      clearBuffer();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      onChunkRef.current = onChunk;
      decoderRef.current = new TextDecoder();

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`ChatB2K stream failed: HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("ChatB2K stream returned an empty response body");
        }

        const reader = response.body.getReader();
        const decoder = decoderRef.current;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) pushChunk(decoder.decode(value, { stream: true }));
          }

          const tail = decoder.decode();
          if (tail) pushChunk(tail);
          clearBuffer();
          onComplete?.();
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          clearBuffer();
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        decoderRef.current = null;
        onChunkRef.current = null;
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [clearBuffer, pushChunk],
  );

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearBuffer();
    decoderRef.current = null;
    onChunkRef.current = null;
  }, [clearBuffer]);

  useEffect(() => stopStream, [stopStream]);

  return { startStream, stopStream };
}
