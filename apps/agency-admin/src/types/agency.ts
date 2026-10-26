export interface Branch {
  id: string;
  name: string;
  location: string | null;
  createdAt: string;
}

export interface TenantOwner {
  name: string;
  email: string;
  phone: string | null;
}

export interface TenantCounts {
  users: number;
  products: number;
  orders: number;
  branches: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  status?: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED';
  subscriptionExpiresAt?: string | null;
  owner: TenantOwner;
  _count: TenantCounts;
  branches: Branch[];
}

export interface BillingLog {
  id: string;
  amount: number;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
}

export interface TenantDetail extends Tenant {
  email: string | null;
  phone: string | null;
  address: string | null;
  status: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED';
  subscriptionExpiresAt: string | null;
  billingLogs: BillingLog[];
}

export interface LogPaymentResponse {
  message: string;
  billingLog: { amount: number };
  subscriptionExpiresAt: string | null;
  status: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED';
}

export interface SetDealResponse {
  message: string;
  businessId: string;
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string | null;
    billingCycle: string;
    customLimits: Record<string, unknown> | null;
    priceOverride: number | null;
  };
}

export interface DealHistoryRow {
  id: string;
  businessId: string;
  actorId: string | null;
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
  notes: string | null;
  changedAt: string;
}

export interface UpdateStatusResponse {
  message: string;
  businessId: string;
  status: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED';
}

export interface OnboardTenantRequest {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  phone: string;
  address: string;
}

export interface OnboardTenantResponse {
  message: string;
  business: Tenant;
  owner: {
    id: string;
    name: string;
    email: string;
    role: string;
    phone: string | null;
  };
}

export interface AddBranchRequest {
  name: string;
  location?: string;
}

export interface AddBranchResponse {
  message: string;
  branch: Branch;
}

export interface JwtPayload {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  businessId?: string | null;
  exp?: number;
}

export interface TenantHealth {
  score: number;
  reason: string;
  activeDays: number;
  trend: number;
  breadth: number;
}

export interface TenantRow {
  businessId: string;
  name: string;
  plan: string;
  planCode: string;
  status: string;
  trialDaysLeft: number | null;
  lastActiveAt: string | null;
  orders30: number;
  gmv30: string | number;
  activeUsers: number;
  maxUsers: number | null;
  products: number;
  maxProducts: number | null;
  branches: number;
  maxBranches: number | null;
  health: TenantHealth;
  planFit: "UPGRADE_CANDIDATE" | "CHURN_RISK" | null;
}

export interface OverviewAnalytics {
  mrr: number | string;
  trialsStartedThisMonth: number;
  trialToPaid: number;
  trialToPaidCounts: { started: number; converted: number };
  churned: number;
  totalGmv30: number | string;
  signupsByCity: { city: string; count: number }[];
  signupsByMarket: { market: string; count: number }[];
}

export interface TenantAnalyticsDetail {
  business: {
    id: string;
    name: string;
    city: string | null;
    market: string | null;
    source: string | null;
    followUpStatus: string | null;
    followUpNotes: string | null;
    lastActiveAt: string | null;
    createdAt: string;
    subscription: {
      id: string;
      status: string;
      plan: { code: string; name: string };
    } | null;
  };
  daily: { date: string; ordersCount: number; gmv: number | string }[];
  series: { date: string; orders: number; gmv: number | string }[];
  heatmap: number[][];
  topProducts: {
    productId: string;
    name: string;
    qty: number;
    revenue: number | string;
  }[];
  branchSplit: {
    branchId: string | null;
    name: string;
    orders: number;
    gmv: number | string;
  }[];
  users: {
    id: string;
    name: string;
    role: string;
    lastActiveAt: string | null;
    sessions: number;
  }[];
  limits: {
    maxBranches: number | null;
    maxUsers: number | null;
    maxProducts: number | null;
  };
  usage: {
    branches: number;
    users: number;
    products: number;
  };
  subscription: {
    current: {
      id: string;
      status: string;
      plan: { code: string; name: string };
      billingCycle: string;
      trialEndsAt: string | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      priceOverride: number | null;
    } | null;
    invoices: {
      id: string;
      number: string;
      status: string;
      total: number | string;
      dueDate: string;
      paidAt: string | null;
    }[];
    payments: {
      id: string;
      amount: number | string;
      method: string;
      reference: string | null;
      receivedAt: string;
    }[];
  };
  followUp: {
    status: string | null;
    notes: string | null;
    source: string | null;
  };
}
