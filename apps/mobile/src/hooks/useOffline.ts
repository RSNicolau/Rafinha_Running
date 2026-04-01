import { useEffect, useState, useCallback } from 'react';
import { offlineService } from '../services/offline.service';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(offlineService.getIsOnline());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsubscribe = offlineService.onStatusChange((online) => {
      setIsOnline(online);
    });

    // Check pending queue size
    offlineService.getQueue().then((q) => setPendingCount(q.length));

    return unsubscribe;
  }, []);

  const syncNow = useCallback(async () => {
    const result = await offlineService.processQueue();
    const queue = await offlineService.getQueue();
    setPendingCount(queue.length);
    return result;
  }, []);

  return { isOnline, pendingCount, syncNow };
}
