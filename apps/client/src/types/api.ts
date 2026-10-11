// Domain types derived from apps/server/prisma/schema.prisma and API responses

export type OrderStatus = 'ESTIMATE' | 'MEMO' | 'FINAL' | 'CANCELLED' | 'RETURNED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type PaymentMethod = 'CASH' | 'BANK' | 'ONLINE';
export type Role = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'STAFF';
export type ItemCondition = 'ORIGINAL_PULL' | 'COPY' | 'MINOR_SCRATCHES' | 'WORKING' | 'DEAD_DONOR' | 'DEFECTIVE';
export type InstanceStatus = 'AVAILABLE' | 'MEMO_LOCKED' | 'SOLD' | 'DEFECTIVE' | 'RETURNED_WORKING' | 'RETURNED_DEFECTIVE' | 'CONSUMED';
export type InventoryDirection = 'IN' | 'OUT';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  avatarUrl?: string | null;
  businessId?: string | null;
  createdAt?: Date;
  [key: string]: unknown;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  shopName?: string | null;
  email?: string | null;
  address?: string | null;
  cnicNumber?: string | null;
  cnic?: string | null;
  creditLimit: number;
  isDefaulter: boolean;
  guarantorPhone?: string | null;
  createdAt?: Date;
  type?: string;
  orders?: number;
  spent?: number;
  orderHistory?: Order[];
  metrics?: {
    totalOrders?: number;
    lifetimeValue?: number;
    outstandingBalance?: number;
    ledgerBalance?: number;
  };
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  defaultCostPrice?: number | null;
  categoryId?: string | null;
  businessId: string;
  createdAt?: Date;
  sold?: number;
  revenue?: number;
  daysUnsold?: number;
  stock?: number;
  tiedValue?: number;
}

export interface ProductInstance {
  id: string;
  productId: string;
  cabinetId?: string | null;
  branchId: string;
  vendorId?: string | null;
  unitCost?: number | null;
  condition: ItemCondition;
  status: InstanceStatus;
  serialNumber?: string | null;
  createdAt: Date;
  updatedAt?: Date;
  product?: Product;
  cabinet?: Cabinet | null;
  branch?: Branch;
  vendor?: Vendor | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId?: string | null;
  quantity: number;
  price: number;
  isService: boolean;
  serviceName?: string | null;
  notes?: string | null;
  product?: Product | null;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  receivedBy: string;
  createdAt: Date;
  receiver?: User;
}

export interface Order {
  id: string;
  orderNumber?: number | string;
  customerId?: string | null;
  businessId: string;
  branchId?: string | null;
  discount?: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  totalAmount?: number;
  createdBy?: string | null;
  walkInName?: string | null;
  walkInPhone?: string | null;
  createdAt?: Date | string;
  customer?: Customer | null;
  creator?: User | null;
  items?: OrderItem[];
  payments?: Payment[];
  financials?: {
    subtotal?: number;
    discount?: number;
    total?: number;
    paid?: number;
    balance?: number;
  };
  amountPaid?: number;
  date?: string;
}

export interface Branch {
  id: string;
  name: string;
  location?: string | null;
  phone?: string | null;
  businessId?: string;
  deletedAt?: Date | null;
  createdAt?: string | Date;
}

export interface Cabinet {
  id: string;
  name: string;
  rack?: string | null;
  shelf?: string | null;
  bin?: string | null;
  location?: string | null;
  businessId: string;
  branchId: string;
  createdAt?: Date;
}

export interface Vendor {
  id: string;
  businessName: string;
  contactName?: string | null;
  phone?: string | null;
  address?: string | null;
  businessId: string;
  createdAt?: Date;
}

export interface Transaction {
  id: string;
  businessId: string;
  referenceId?: string | null;
  type: string;
  description?: string | null;
  createdAt: Date;
}

export interface Posting {
  id: string;
  transactionId: string;
  accountId: string;
  accountType: string;
  amount: number;
  createdAt: Date;
}

export interface Expense {
  id: string;
  businessId: string;
  branchId?: string | null;
  amount: number;
  category: string;
  description?: string | null;
  createdById?: string | null;
  transactionId?: string | null;
  sessionId?: string | null;
  createdAt: Date;
}

export interface CashRegisterSession {
  id: string;
  businessId: string;
  branchId?: string | null;
  openedById: string;
  closedById?: string | null;
  status: 'OPEN' | 'CLOSED';
  openingBalance: number;
  cashSales: number;
  cashExpenses: number;
  expectedCash: number;
  actualCash?: number | null;
  difference?: number | null;
  notes?: string | null;
  openedAt: Date;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  cabinetId?: string | null;
  fromCondition?: ItemCondition | null;
  toCondition: ItemCondition;
  quantity: number;
  direction: InventoryDirection;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  userId: string;
  businessId: string;
  vendorId?: string | null;
  createdAt: Date;
}

export interface ExpenseCategory {
  total: number;
  count: number;
}

export interface ItemizedExpense {
  id: string;
  category: string;
  description?: string | null;
  amount: number;
  createdAt: Date;
  createdBy?: { name: string } | null;
}

export interface ZReportSummary {
  openingBalance: number;
  cashSales: number;
  cashExpenses: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  discrepancyType: 'BALANCED' | 'SHORTAGE' | 'OVERAGE';
}

export interface ZReportSession {
  id: string;
  openedAt: Date;
  closedAt?: Date | null;
  openedBy?: { name: string } | null;
  closedBy?: { name: string } | null;
  branch?: { name: string } | null;
  notes?: string | null;
}

export interface ZReportData {
  session: ZReportSession;
  summary: ZReportSummary;
  expensesByCategory: Record<string, ExpenseCategory>;
  itemizedSales?: unknown[];
  itemizedExpenses: ItemizedExpense[];
  salesCount: number;
  expensesCount: number;
}

export interface ChartDataPoint {
  date: string;
  revenue?: number;
  profit?: number;
}

export interface PaymentFlowItem {
  name: string;
  value: number;
  color?: string;
}

export interface FinancialReportData {
  success: boolean;
  kpis: {
    totalRevenue?: number;
    netProfit?: number;
    averageOrderValue?: number;
    pendingDues?: number;
  };
  revenueTrend: ChartDataPoint[];
  paymentFlow: PaymentFlowItem[];
}
