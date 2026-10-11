export const TEST_PASSWORD = "DeepKhata#Test1";

export const users = {
  superAdmin: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "superadmin@deepkhata.test",
    name: "Super Admin",
    role: "SUPER_ADMIN",
    tenant: null,
  },
  ownerA: {
    id: "00000000-0000-4000-8000-000000000002",
    email: "owner@deepkhata.test",
    name: "Ahmed Khan",
    role: "OWNER",
    tenant: "A",
  },
  managerA: {
    id: "00000000-0000-4000-8000-000000000003",
    email: "manager@deepkhata.test",
    name: "Fatima Ali",
    role: "MANAGER",
    tenant: "A",
  },
  staffA: {
    id: "00000000-0000-4000-8000-000000000004",
    email: "staff@deepkhata.test",
    name: "Hassan Ali",
    role: "STAFF",
    tenant: "A",
  },
  ownerB: {
    id: "00000000-0000-4000-8000-000000000005",
    email: "ownerb@deepkhata.test",
    name: "Shahzaib Ahmed",
    role: "OWNER",
    tenant: "B",
  },
} as const;

export const tenants = {
  A: {
    id: "11111111-1111-4000-8000-000000000001",
    slug: "gm-traders",
    name: "GM Traders",
    branches: {
      hafeezCentre: {
        id: "11111111-1111-4000-8000-000000000100",
        name: "Hafeez Centre",
      },
      hallRoad: {
        id: "11111111-1111-4000-8000-000000000101",
        name: "Hall Road",
      },
    },
  },
  B: {
    id: "22222222-2222-4000-8000-000000000001",
    slug: "shahzaib-electronics",
    name: "Shahzaib Electronics",
    branches: {
      mainBranch: {
        id: "22222222-2222-4000-8000-000000000100",
        name: "Main Branch",
      },
    },
  },
} as const;

export type RoleKey = keyof typeof users;
