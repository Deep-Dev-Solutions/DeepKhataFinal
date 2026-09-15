export const ROLE_PERMISSIONS = {
  OWNER: [
    "read:products", "write:products", "delete:products",
    "create:order", "read:orders", "update:order",
    "read:customers", "write:customers", "manage:risk",
    "read:reports", "manage:team", "manage:business",
    "manage:cash", "read:cash"
  ],
  MANAGER: [
    "read:products", "write:products",
    "create:order", "read:orders", "update:order",
    "read:customers", "write:customers", "manage:risk",
    "read:reports",
    "manage:cash", "read:cash"
  ],
  STAFF: [
    "read:products",
    "create:order", "read:orders", "update:order",
    "read:customers", "write:customers",
    "manage:cash", "read:cash"
  ]
};
