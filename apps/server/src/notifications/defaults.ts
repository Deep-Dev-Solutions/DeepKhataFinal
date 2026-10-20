export type Channel = 'IN_APP' | 'EMAIL' | 'WHATSAPP_LINK';

export const CHANNELS: readonly Channel[] = ['IN_APP', 'EMAIL', 'WHATSAPP_LINK'];

export interface RuleConfig {
  enabled: boolean;
  channels: Channel[];
  daysBefore?: number;
  offsetsDays?: number[];
  time?: string;
}

export type RuleKey =
  | 'receivable.due_soon'
  | 'receivable.due_today'
  | 'receivable.overdue'
  | 'payable.due_soon'
  | 'payable.overdue'
  | 'digest.daily'
  | 'promise.broken'
  | 'register.not_closed'
  | 'stock.low';

export const RULE_KEYS: readonly RuleKey[] = [
  'receivable.due_soon',
  'receivable.due_today',
  'receivable.overdue',
  'payable.due_soon',
  'payable.overdue',
  'digest.daily',
  'promise.broken',
  'register.not_closed',
  'stock.low',
];

export type Recipients = 'OWNER_ONLY' | 'OWNER_AND_MANAGERS';

export const DEFAULT_RULES: Record<RuleKey, RuleConfig> = {
  'receivable.due_soon': { enabled: true, channels: ['IN_APP'], daysBefore: 1 },
  'receivable.due_today': { enabled: true, channels: ['IN_APP'] },
  'receivable.overdue': {
    enabled: true,
    channels: ['IN_APP'],
    offsetsDays: [3, 7, 14, 30],
  },
  'payable.due_soon': { enabled: true, channels: ['IN_APP'], daysBefore: 2 },
  'payable.overdue': {
    enabled: true,
    channels: ['IN_APP'],
    offsetsDays: [1, 7],
  },
  'digest.daily': { enabled: true, channels: ['IN_APP'], time: '10:00' },
  'promise.broken': { enabled: true, channels: ['IN_APP'] },
  'register.not_closed': { enabled: true, channels: ['IN_APP'], time: '23:00' },
  'stock.low': { enabled: false, channels: ['IN_APP'] },
};
