import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@rr/offline_queue';

export interface QueuedRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
  retries: number;
}

export async function enqueue(request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retries'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...request,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    retries: 0,
  });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue(): Promise<QueuedRequest[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedRequest[]) : [];
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((r) => r.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

/**
 * Flush the offline queue by replaying each request.
 * Pass your axios instance (or fetch wrapper) as `executor`.
 */
export async function flushQueue(
  executor: (req: QueuedRequest) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ succeeded: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < queue.length; i++) {
    const req = queue[i];
    try {
      await executor(req);
      await removeFromQueue(req.id);
      succeeded++;
    } catch {
      failed++;
      // Increment retry counter but keep in queue
      const updated = await getQueue();
      const idx = updated.findIndex((r) => r.id === req.id);
      if (idx !== -1) {
        updated[idx].retries += 1;
        // Drop requests that have failed too many times
        if (updated[idx].retries >= 5) {
          updated.splice(idx, 1);
        }
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
      }
    }
    onProgress?.(i + 1, queue.length);
  }

  return { succeeded, failed };
}
