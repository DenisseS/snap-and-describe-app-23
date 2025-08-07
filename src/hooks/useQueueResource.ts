import { useEffect, useState } from 'react';
import { QueueClient } from '@/services/sw/QueueClient';
import { QueueState } from '@/types/queue';

export const useQueueResource = (queueName: string, resourceKey: string) => {
  const [state, setState] = useState<QueueState>(QueueState.IDLE);

  useEffect(() => {
    let mounted = true;
    const client = QueueClient.getInstance();

    // Initial status fetch for this resource
    client.status(resourceKey).then((status) => {
      if (!mounted) return;
      const item = Array.isArray(status?.items) ? status.items.find((i: any) => i.resourceKey === resourceKey) : null;
      if (item) setState(QueueState.COALESCING); // pending implies either coalescing or ready
      if (status?.processing) setState(QueueState.PROCESSING);
    }).catch(() => {});

    // Subscribe to SW queue events
    const unsubscribe = client.subscribe((evt) => {
      const data = evt.data;
      if (data.queueName && data.queueName !== queueName) return;
      if (data.resourceKey && data.resourceKey !== resourceKey) return;
      switch (data.event) {
        case 'ready':
          setState(QueueState.COALESCING);
          break;
        case 'processing-start':
        case 'processing':
          setState(QueueState.PROCESSING);
          break;
        case 'processed':
          setState(QueueState.COALESCING); // may be more items
          break;
        case 'drained':
          setState(QueueState.DRAINED);
          break;
        case 'stopped':
          setState(QueueState.IDLE);
          break;
        case 'error':
          setState(QueueState.ERROR);
          break;
      }
    });

    return () => { mounted = false; unsubscribe(); };
  }, [queueName, resourceKey]);

  return { state } as const;
};
