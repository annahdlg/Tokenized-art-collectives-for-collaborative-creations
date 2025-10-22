import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PRODUCT_ID = 101;
const ERR_INVALID_METADATA_HASH = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_PRODUCT_ALREADY_EXISTS = 104;
const ERR_PRODUCT_NOT_FOUND = 105;
const ERR_AUTHORITY_NOT_VERIFIED = 107;
const ERR_INVALID_PRODUCER = 108;
const ERR_INVALID_UPDATE_PARAM = 109;
const ERR_MAX_PRODUCTS_EXCEEDED = 110;
const ERR_INVALID_ORIGIN = 111;
const ERR_INVALID_CATEGORY = 112;

interface Product {
  productId: string;
  producer: string;
  metadataHash: string;
  description: string;
  origin: string;
  category: string;
  timestamp: number;
  status: boolean;
}

interface ProductUpdate {
  updateMetadataHash: string;
  updateDescription: string;
  updateOrigin: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ProductRegistryMock {
  state: {
    nextProductId: number;
    maxProducts: number;
    registrationFee: number;
    authorityContract: string | null;
    products: Map<number, Product>;
    productUpdates: Map<number, ProductUpdate>;
    productsById: Map<string, number>;
  } = {
    nextProductId: 0,
    maxProducts: 10000,
    registrationFee: 500,
    authorityContract: null,
    products: new Map(),
    productUpdates: new Map(),
    productsById: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1PRODUCER";
  authorities: Set<string> = new Set(["ST1PRODUCER"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProductId: 0,
      maxProducts: 10000,
      registrationFee: 500,
      authorityContract: null,
      products: new Map(),
      productUpdates: new Map(),
      productsById: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1PRODUCER";
    this.authorities = new Set(["ST1PRODUCER"]);
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerProduct(
    productId: string,
    metadataHash: string,
    description: string,
    origin: string,
    category: string
  ): Result<number> {
    if (this.state.nextProductId >= this.state.maxProducts) return { ok: false, value: ERR_MAX_PRODUCTS_EXCEEDED };
    if (!productId || productId.length > 50) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (!metadataHash || metadataHash.length > 64) return { ok: false, value: ERR_INVALID_METADATA_HASH };
    if (!description || description.length > 200) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!origin || origin.length > 100) return { ok: false, value: ERR_INVALID_ORIGIN };
    if (!["food", "pharma", "luxury", "electronics"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (!this.authorities.has(this.caller)) return { ok: false, value: ERR_INVALID_PRODUCER };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (this.state.productsById.has(productId)) return { ok: false, value: ERR_PRODUCT_ALREADY_EXISTS };
    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextProductId;
    const product: Product = {
      productId,
      producer: this.caller,
      metadataHash,
      description,
      origin,
      category,
      timestamp: this.blockHeight,
      status: true,
    };
    this.state.products.set(id, product);
    this.state.productsById.set(productId, id);
    this.state.nextProductId++;
    return { ok: true, value: id };
  }

  getProduct(id: number): Product | null {
    return this.state.products.get(id) || null;
  }

  updateProduct(id: number, newMetadataHash: string, newDescription: string, newOrigin: string): Result<boolean> {
    const product = this.state.products.get(id);
    if (!product) return { ok: false, value: false };
    if (product.producer !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!newMetadataHash || newMetadataHash.length > 64) return { ok: false, value: ERR_INVALID_METADATA_HASH };
    if (!newDescription || newDescription.length > 200) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!newOrigin || newOrigin.length > 100) return { ok: false, value: ERR_INVALID_ORIGIN };
    const updated: Product = {
      ...product,
      metadataHash: newMetadataHash,
      description: newDescription,
      origin: newOrigin,
      timestamp: this.blockHeight,
    };
    this.state.products.set(id, updated);
    this.state.productUpdates.set(id, {
      updateMetadataHash: newMetadataHash,
      updateDescription: newDescription,
      updateOrigin: newOrigin,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  verifyProduct(id: number): Result<boolean> {
    const product = this.state.products.get(id);
    if (!product) return { ok: false, value: false };
    return { ok: true, value: product.status };
  }

  getProductCount(): Result<number> {
    return { ok: true, value: this.state.nextProductId };
  }

  checkProductExistence(productId: string): Result<boolean> {
    return { ok: true, value: this.state.productsById.has(productId) };
  }
}

describe("ProductRegistry", () => {
  let contract: ProductRegistryMock;

  beforeEach(() => {
    contract = new ProductRegistryMock();
    contract.reset();
  });

  it("registers a product successfully", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    const result = contract.registerProduct(
      "PROD001",
      "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      "Organic Coffee Beans",
      "Ethiopia",
      "food"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const product = contract.getProduct(0);
    expect(product?.productId).toBe("PROD001");
    expect(product?.producer).toBe("ST1PRODUCER");
    expect(product?.metadataHash).toBe("hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab");
    expect(product?.description).toBe("Organic Coffee Beans");
    expect(product?.origin).toBe("Ethiopia");
    expect(product?.category).toBe("food");
    expect(product?.status).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1PRODUCER", to: "ST2AUTHORITY" }]);
  });

  it("rejects duplicate product IDs", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    const result = contract.registerProduct("PROD001", "hashabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234", "Dark Roast Coffee", "Colombia", "food");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PRODUCT_ALREADY_EXISTS);
  });

  it("rejects non-authorized producer", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    contract.caller = "ST2FAKE";
    contract.authorities = new Set();
    const result = contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRODUCER);
  });

  it("rejects registration without authority contract", () => {
    const result = contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid product ID", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    const result = contract.registerProduct("", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRODUCT_ID);
  });

  it("rejects invalid metadata hash", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    const result = contract.registerProduct("PROD001", "", "Organic Coffee Beans", "Ethiopia", "food");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA_HASH);
  });

  it("rejects invalid category", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    const result = contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CATEGORY);
  });

  it("updates a product successfully", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    const result = contract.updateProduct(0, "hashabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234", "Dark Roast Coffee", "Colombia");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const product = contract.getProduct(0);
    expect(product?.metadataHash).toBe("hashabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234");
    expect(product?.description).toBe("Dark Roast Coffee");
    expect(product?.origin).toBe("Colombia");
    const update = contract.state.productUpdates.get(0);
    expect(update?.updateMetadataHash).toBe("hashabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234");
    expect(update?.updateDescription).toBe("Dark Roast Coffee");
    expect(update?.updateOrigin).toBe("Colombia");
  });

  it("rejects update for non-existent product", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    const result = contract.updateProduct(99, "hashabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234", "Dark Roast Coffee", "Colombia");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-producer", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    contract.caller = "ST3FAKE";
    const result = contract.updateProduct(0, "hashabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234", "Dark Roast Coffee", "Colombia");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("verifies product status correctly", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    const result = contract.verifyProduct(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.verifyProduct(99);
    expect(result2.ok).toBe(false);
    expect(result2.value).toBe(false);
  });

  it("returns correct product count", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    contract.registerProduct("PROD002", "hashabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234", "Dark Roast Coffee", "Colombia", "food");
    const result = contract.getProductCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks product existence correctly", () => {
    contract.setAuthorityContract("ST2AUTHORITY");
    contract.registerProduct("PROD001", "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab", "Organic Coffee Beans", "Ethiopia", "food");
    const result = contract.checkProductExistence("PROD001");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkProductExistence("PROD999");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });
});