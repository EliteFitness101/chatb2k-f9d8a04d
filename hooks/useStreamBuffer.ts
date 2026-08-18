import { useCallback, useEffect, useRef } from "react";

/**
 * Batches incoming stream chunks to one UI update per animation frame.
 * This keeps token-heavy streams from forcing a React render for every chunk.
 */
export function useStreamBuffer(
  onFlush: (bufferedChunk: string) => void,
  frameIntervalMs = 16.6,
) {
  const bufferRef = useRef("");
  const frameIdRef = useRef<number | null>(null);
  const lastFlushTimeRef = useRef(0);
  const onFlushRef = useRef(onFlush);

  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  const flush = useCallback(
    (timestamp: number) => {
      const elapsed = timestamp - lastFlushTimeRef.current;

      if (elapsed >= frameIntervalMs && bufferRef.current.length > 0) {
        const chunk = bufferRef.current;
        bufferRef.current = "";
        lastFlushTimeRef.current = timestamp;
        onFlushRef.current(chunk);
      }

      if (bufferRef.current.length > 0) {
        frameIdRef.current = requestAnimationFrame(flush);
      } else {
        frameIdRef.current = null;
      }
    },
    [frameIntervalMs],
  );

  const pushChunk = useCallback(
    (chunk: string) => {
      if (!chunk) return;
      bufferRef.current += chunk;

      if (frameIdRef.current === null) {
        frameIdRef.current = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  const clearBuffer = useCallback(() => {
    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }

    if (bufferRef.current.length > 0) {
      const chunk = bufferRef.current;
      bufferRef.current = "";
      onFlushRef.current(chunk);
    }

    lastFlushTimeRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      bufferRef.current = "";
    };
  }, []);

  return { pushChunk, clearBuffer };
}
