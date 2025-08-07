export enum QueueState {
  IDLE = 'idle',
  COALESCING = 'coalescing',
  PROCESSING = 'processing',
  ERROR = 'error',
  DRAINED = 'drained',
}

export interface QueueItemStatus {
  id: string;
  queueName: string;
  resourceKey: string;
  status: 'pending' | 'processing' | 'error';
  lastUpdatedAt: number;
  coalesceUntil: number;
}

export interface QueueStatus {
  processing: boolean;
  items: QueueItemStatus[];
}
