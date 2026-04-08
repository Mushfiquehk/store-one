# Test Orders & Reports API Reference

## Overview

These endpoints allow AI agents to simulate orders, verify inventory effects, and pull aggregate reports — all via the REST API. This closes the feedback loop for programmatic store management: create products, place test orders, then verify the results through reports.

---

## POST /api/admin/test-orders

Place a test order. This persists a sale record, deducts inventory using BOM-based logic (including sub-recipe resolution, scale-factor matrices, modifier BOM entries, and direct-inventory fallback), applies combo discounts if specified, and returns a full breakdown. Sale creation and inventory deductions happen atomically in a single database transaction.

### Request Body

```json
{
  "lineItems": [
    {
      "variantId": "variant_abc123",
      "qty": 2,
      "modifiers": [
        { "modifierId": "mod_xyz", "qty": 1 }
      ]
    },
    {
      "variantId": "variant_def456",
      "qty": 1
    }
  ],
  "taxRatePct": 8.25,
  "customerName": "Test Customer",
  "combos": [
    {
      "name": "Lunch Special",
      "pricingStrategy": "DISCOUNT_PERCENT",
      "discountPercent": 15,
      "lineIndices": [0, 1]
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lineItems` | array | Yes | At least one line item |
| `lineItems[].variantId` | string | Yes | ID of the variant to order |
| `lineItems[].qty` | integer | Yes | Quantity (>= 1) |
| `lineItems[].modifiers` | array | No | Modifier selections |
| `lineItems[].modifiers[].modifierId` | string | Yes | Modifier ID |
| `lineItems[].modifiers[].qty` | integer | No | Modifier quantity (default: 1) |
| `taxRatePct` | number | No | Tax rate percentage (default: 0) |
| `customerName` | string | No | Customer name (default: "") |
| `combos` | array | No | Combo discount specifications |
| `combos[].name` | string | Yes | Display name for the combo |
| `combos[].pricingStrategy` | string | Yes | One of: `FIXED`, `DISCOUNT_VALUE`, `DISCOUNT_PERCENT` |
| `combos[].fixedPriceCents` | number | No | Fixed total price for the combo (for FIXED strategy) |
| `combos[].discountValueCents` | number | No | Flat discount in cents (for DISCOUNT_VALUE strategy) |
| `combos[].discountPercent` | number | No | Percentage discount 0-100 (for DISCOUNT_PERCENT strategy) |
| `combos[].lineIndices` | array | Yes | Indices (0-based) of lineItems to include in the combo |

### Combo Pricing Strategies

- **FIXED**: The combo items cost exactly `fixedPriceCents` total. Discount = original total - fixed price.
- **DISCOUNT_VALUE**: A flat `discountValueCents` discount is applied to the combo items.
- **DISCOUNT_PERCENT**: A percentage discount is applied. `discountPercent: 15` means 15% off the combo items.

The discount is distributed proportionally across combo line items based on their original price weight.

### Response (200)

```json
{
  "sale": {
    "id": "sale_test_abc123_1712345678000",
    "createdAt": 1712345678000,
    "subtotalCents": 1275,
    "taxCents": 105,
    "totalCents": 1380,
    "comboDiscountCents": 225,
    "paymentMethod": "test",
    "status": "completed",
    "customerName": "Test Customer",
    "linesJson": [...]
  },
  "linesPricing": [
    {
      "variantId": "variant_abc123",
      "productId": "prod_abc",
      "productName": "Latte",
      "variantName": "Medium",
      "qty": 2,
      "unitPriceCents": 450,
      "originalPriceCents": 450,
      "finalPriceCents": 383,
      "comboName": "Lunch Special",
      "modifiers": [
        { "modifierId": "mod_xyz", "name": "Extra Shot", "qty": 1, "unitPrice": 150 }
      ],
      "lineTotalCents": 766
    }
  ],
  "inventoryEffects": [
    {
      "inventoryItemId": "inv_coffee",
      "inventoryItemName": "Coffee Beans",
      "unitOfMeasure": "oz",
      "quantityBefore": 100,
      "quantityAfter": 96,
      "delta": -4,
      "lowStockThreshold": 20,
      "belowThreshold": false
    }
  ],
  "warnings": []
}
```

### Error Responses

- **400**: Invalid request body, or validation failure (missing variants, modifiers, or referenced inventory items)
- **500**: Internal server error

### Example curl

```bash
curl -X POST http://localhost:5001/api/admin/test-orders \
  -H "Content-Type: application/json" \
  -d '{
    "lineItems": [{"variantId": "variant_abc123", "qty": 1}],
    "taxRatePct": 8.25
  }'
```

### Example with combo discount

```bash
curl -X POST http://localhost:5001/api/admin/test-orders \
  -H "Content-Type: application/json" \
  -d '{
    "lineItems": [
      {"variantId": "var_latte_med", "qty": 1},
      {"variantId": "var_muffin", "qty": 1}
    ],
    "combos": [
      {
        "name": "Morning Deal",
        "pricingStrategy": "FIXED",
        "fixedPriceCents": 600,
        "lineIndices": [0, 1]
      }
    ]
  }'
```

---

## POST /api/admin/test-orders/dry-run

Preview what a test order would do without persisting anything. The endpoint executes the full flow — validation, pricing, combo discounts, BOM deduction — inside a database transaction that is rolled back. No sale is created and no inventory is deducted.

### Request Body

Same as `POST /api/admin/test-orders`.

### Response (200)

Same shape as `POST /api/admin/test-orders`. The `sale.id` is generated but the sale is not saved. Inventory effects show what *would* happen.

### Example curl

```bash
curl -X POST http://localhost:5001/api/admin/test-orders/dry-run \
  -H "Content-Type: application/json" \
  -d '{
    "lineItems": [{"variantId": "variant_abc123", "qty": 3}],
    "taxRatePct": 0
  }'
```

---

## GET /api/admin/test-orders

List all persisted test order sales.

### Response (200)

```json
[
  {
    "id": "sale_test_abc123_1712345678000",
    "createdAt": 1712345678000,
    "subtotalCents": 1500,
    "taxCents": 124,
    "totalCents": 1624,
    "comboDiscountCents": 0,
    "paymentMethod": "test",
    "status": "completed",
    "customerName": "",
    "linesJson": [...],
    "closedAt": null,
    "updatedAt": 1712345678000,
    "deletedAt": null
  }
]
```

---

## GET /api/admin/test-orders/:id

Get a single test order sale by ID. Returns 404 for soft-deleted sales.

### Response (200)

Single sale object (same shape as list items above).

### Error Responses

- **404**: Sale not found

---

## GET /api/admin/reports/summary

Returns aggregate data from admin tables: sale count, revenue, average order value, product/variant/inventory counts, and low-stock items.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `since` | integer | No | Unix timestamp in milliseconds. Only include sales created after this time. Returns 400 if not a valid non-negative integer. |

### Response (200)

```json
{
  "saleCount": 15,
  "totalRevenueCents": 45000,
  "averageOrderValueCents": 3000,
  "productCount": 10,
  "productCountByType": {
    "RETAIL": 6,
    "RESTAURANT": 4
  },
  "variantCount": 25,
  "inventoryItemCount": 30,
  "lowStockItemCount": 2,
  "lowStockItems": [
    {
      "id": "inv_milk",
      "name": "Whole Milk",
      "currentQuantity": 3,
      "lowStockThreshold": 10
    }
  ]
}
```

When `since` is provided, it is echoed back in the response and only sales after that timestamp are included in `saleCount`, `totalRevenueCents`, and `averageOrderValueCents`.

### Example curl

```bash
curl "http://localhost:5001/api/admin/reports/summary"

curl "http://localhost:5001/api/admin/reports/summary?since=1712300000000"
```

---

## GET /api/admin/reports/inventory

Returns all inventory items with current quantities, low-stock status, last purchase price, and cumulative movement data (BOM-based deductions from all orders, and additions from all invoices).

### Response (200)

```json
{
  "items": [
    {
      "id": "inv_coffee",
      "name": "Coffee Beans",
      "unitOfMeasure": "oz",
      "currentQuantity": 96,
      "lowStockThreshold": 20,
      "lowStock": false,
      "lastPurchasePrice": 1200,
      "recentMovement": {
        "salesDeductions": -4.0,
        "ordersAffecting": 2,
        "invoiceAdditions": 50.0,
        "invoiceLineCount": 3
      }
    }
  ],
  "totalItems": 30,
  "lowStockCount": 2
}
```

| Field | Description |
|-------|-------------|
| `recentMovement.salesDeductions` | Total quantity deducted from this item across all orders (negative number, computed via BOM logic) |
| `recentMovement.ordersAffecting` | Number of orders that affected this inventory item |
| `recentMovement.invoiceAdditions` | Total quantity received from all invoices for this item |
| `recentMovement.invoiceLineCount` | Number of invoice line items referencing this item |

### Example curl

```bash
curl "http://localhost:5001/api/admin/reports/inventory"
```

---

## AI Agent Workflow

Here is how an AI agent would use these endpoints together to manage a store programmatically:

### 1. Set up products and inventory

```bash
curl -X POST http://localhost:5001/api/admin/products \
  -H "Content-Type: application/json" \
  -d '{"id": "prod_latte", "name": "Latte", "type": "RESTAURANT"}'

curl -X POST http://localhost:5001/api/admin/inventory-items \
  -H "Content-Type: application/json" \
  -d '{"id": "inv_coffee", "name": "Coffee Beans", "unitOfMeasure": "oz", "currentQuantity": 100, "lowStockThreshold": 20}'

curl -X POST http://localhost:5001/api/admin/variants \
  -H "Content-Type: application/json" \
  -d '{"id": "var_latte_med", "productId": "prod_latte", "name": "Medium", "basePrice": 450}'

curl -X POST http://localhost:5001/api/admin/bom \
  -H "Content-Type: application/json" \
  -d '{"id": "bom_latte_coffee", "sourceType": "VARIANT", "sourceId": "var_latte_med", "inventoryItemId": "inv_coffee", "quantityDeducted": 2}'
```

### 2. Preview the order (dry run)

```bash
curl -X POST http://localhost:5001/api/admin/test-orders/dry-run \
  -H "Content-Type: application/json" \
  -d '{"lineItems": [{"variantId": "var_latte_med", "qty": 2}], "taxRatePct": 8.25}'
```

This returns the pricing breakdown and shows that Coffee Beans would go from 100 to 96 — without actually changing anything.

### 3. Place the real order

```bash
curl -X POST http://localhost:5001/api/admin/test-orders \
  -H "Content-Type: application/json" \
  -d '{"lineItems": [{"variantId": "var_latte_med", "qty": 2}], "taxRatePct": 8.25}'
```

This persists the sale and deducts inventory atomically.

### 4. Place an order with combo discount

```bash
curl -X POST http://localhost:5001/api/admin/test-orders \
  -H "Content-Type: application/json" \
  -d '{
    "lineItems": [
      {"variantId": "var_latte_med", "qty": 1},
      {"variantId": "var_muffin", "qty": 1}
    ],
    "combos": [{
      "name": "Morning Combo",
      "pricingStrategy": "DISCOUNT_PERCENT",
      "discountPercent": 10,
      "lineIndices": [0, 1]
    }]
  }'
```

### 5. Verify with reports

```bash
curl "http://localhost:5001/api/admin/reports/summary"

curl "http://localhost:5001/api/admin/reports/inventory"
```

Check that the sale count increased, revenue matches expectations, and inventory quantities reflect the deductions.

### 6. Check order history

```bash
curl "http://localhost:5001/api/admin/test-orders"
```

---

## Inventory Deduction Logic

The test order engine uses the same BOM (Bill of Materials) based inventory deduction logic as the POS client:

1. **BOM entries for the variant**: Look up all BOM entries where `sourceType = "VARIANT"` and `sourceId = variantId`.
2. **Direct inventory fallback**: If no BOM entries exist, check if the variant has a `directInventoryId` and deduct the order quantity directly.
3. **Scale factor matrix**: If a BOM entry has a `scaleFactorMatrix`, look up the scale factor by variant ID or variant name and multiply.
4. **Override modifier group**: If a BOM entry has an `overrideModifierGroupId` and the customer selected a modifier from that group, skip that BOM entry.
5. **Sub-recipe resolution**: If a BOM entry has a `sourceProductId`, recursively resolve that product's default variant's BOM entries (up to depth 5, with cycle detection).
6. **Modifier BOM entries**: For each selected modifier, look up BOM entries where `sourceType = "MODIFIER"`. If none exist, fall back to the modifier's `inventoryItemId` and `quantityPerUse`.

## Validation

The endpoints validate all referenced entities before processing:

- All variant IDs must exist in the admin data store
- All product references from variants must exist
- All modifier IDs must exist
- All inventory items referenced by BOM entries, direct inventory links, or modifier fallbacks must exist
- Invalid references return a 400 error with specific details about which items are missing
