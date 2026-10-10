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
