import MiniSearch from "minisearch";

let productIndex: MiniSearch | null = null;
let customerIndex: MiniSearch | null = null;

function createProductIndex(): MiniSearch {
  return new MiniSearch({
    fields: ["name", "sku", "partNumber", "categoryName", "aliases", "compatibleWith"],
    storeFields: [
      "id",
      "name",
      "sku",
      "partNumber",
      "price",
      "stock",
      "branchId",
      "category",
      "cabinet",
      "instances",
    ],
    searchOptions: {
      boost: { name: 2, sku: 2, partNumber: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
    extractField: (document: any, fieldName: string) => {
      if (fieldName === "categoryName") return document.category?.name || "";
      if (fieldName === "aliases") {
        return Array.isArray(document.aliases) ? document.aliases.join(" ") : "";
      }
      if (fieldName === "compatibleWith") {
        return Array.isArray(document.compatibleWith)
          ? document.compatibleWith.join(" ")
          : "";
      }
      return document[fieldName] ?? "";
    },
  });
}

function createCustomerIndex(): MiniSearch {
  return new MiniSearch({
    fields: ["name", "phone", "shopName", "address"],
    storeFields: [
      "id",
      "name",
      "phone",
      "shopName",
      "address",
      "creditLimit",
      "isDefaulter",
    ],
    searchOptions: {
      boost: { name: 2, phone: 2, shopName: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
    extractField: (document: any, fieldName: string) => {
      return document[fieldName] ?? "";
    },
  });
}

self.onmessage = (e: MessageEvent) => {
  const { type, data, reqId } = e.data || {};

  switch (type) {
    case "INDEX_PRODUCTS": {
      const ms = createProductIndex();
      if (Array.isArray(data) && data.length > 0) {
        ms.addAll(data);
      }
      productIndex = ms;
      self.postMessage({ type: "INDEX_PRODUCTS_DONE", reqId });
      break;
    }

    case "INDEX_CUSTOMERS": {
      const ms = createCustomerIndex();
      if (Array.isArray(data) && data.length > 0) {
        ms.addAll(data);
      }
      customerIndex = ms;
      self.postMessage({ type: "INDEX_CUSTOMERS_DONE", reqId });
      break;
    }

    case "SEARCH_PRODUCTS": {
      const { query, category, limit = 50 } = data || {};
      if (!productIndex || !query) {
        self.postMessage({ type: "SEARCH_PRODUCTS_RESULT", results: [], reqId });
        return;
      }
      const rawResults = productIndex.search(query);
      let results = rawResults.slice(0, limit);
      if (category && category !== "All") {
        results = results.filter((r: any) => r.category?.name === category);
      }
      self.postMessage({ type: "SEARCH_PRODUCTS_RESULT", results, reqId });
      break;
    }

    case "SEARCH_CUSTOMERS": {
      const { query, limit = 30 } = data || {};
      if (!customerIndex || !query) {
        self.postMessage({ type: "SEARCH_CUSTOMERS_RESULT", results: [], reqId });
        return;
      }
      const rawResults = customerIndex.search(query);
      const results = rawResults.slice(0, limit);
      self.postMessage({ type: "SEARCH_CUSTOMERS_RESULT", results, reqId });
      break;
    }

    default:
      break;
  }
};
