import { useCallback, useEffect, useRef } from "react";

/**
 * Coalesces incoming stream chunks and flushes them at most once per
 * animation frame, keeping React rendering work off the network read loop.
 */
export function useStreamBuffer(
  onFlush: (bufferedChunk: string) => void,
  frameIntervalMs = 16.6,
) {
  const bufferRef = useRef("");
  const frameIdRef = useRef<number | null>(null);
  const lastFlushTimeRef = useRef(0);

  const flush = useCallback(
    (timestamp: number) => {
      if (timestamp - lastFlushTimeRef.current >= frameIntervalMs) {
        if (bufferRef.current.length > 0) {
          const chunk = bufferRef.current;
          bufferRef.current = "";
          onFlush(chunk);
        }
        lastFlushTimeRef.current = timestamp;
      }

      if (bufferRef.current.length > 0) {
        frameIdRef.current = requestAnimationFrame(flush);
      } else {
        frameIdRef.current = null;
      }
    },
    [frameIntervalMs, onFlush],
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
      onFlush(chunk);
    }
  }, [onFlush]);

  useEffect(() => {
    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
      }
      frameIdRef.current = null;
      bufferRef.current = "";
    };
  }, []);

  return { pushChunk, clearBuffer };
}
