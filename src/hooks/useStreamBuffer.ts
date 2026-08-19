import { useCallback, useEffect, useRef } from "react";

/**
 * Batches streamed text into animation-frame-sized UI updates.
 * Network chunks are never discarded; they are concatenated until flushed.
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
        const buffered = bufferRef.current;
        if (buffered) {
          bufferRef.current = "";
          onFlush(buffered);
        }
        lastFlushTimeRef.current = timestamp;
      }

      if (bufferRef.current) {
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

    const buffered = bufferRef.current;
    bufferRef.current = "";
    if (buffered) onFlush(buffered);
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
