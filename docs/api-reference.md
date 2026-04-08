# Admin REST API Reference

Base URL: `/api/admin`

## Conventions

### IDs

All entity IDs are client-generated strings (typically UUIDs). They must be non-empty. The `id` field is always required on creation and serves as the primary key.

### Timestamps

- `updatedAt` — Unix epoch in **milliseconds** (e.g. `1712234567890`). Automatically set by the server on create/update.
- `deletedAt` — Unix epoch in milliseconds when soft-deleted, or `null` if active.
- Clients never need to send `updatedAt` or `deletedAt`; the server manages both.

### Soft-Delete

Delete operations set `deletedAt` to the current timestamp rather than removing the row. List endpoints only return records where `deletedAt IS NULL`.

### Pagination

All list endpoints accept optional query parameters:

| Parameter | Type    | Default | Description                         |
|-----------|---------|---------|-------------------------------------|
| `limit`   | integer | none    | Max items to return (1–500).        |
| `offset`  | integer | 0       | Number of items to skip.            |

When neither `limit` nor `offset` is provided, all matching records are returned.

### Response Envelope

**Success — single item:**

```json
{
  "data": { ... }
}
```

**Success — list:**

```json
{
  "data": [ ... ],
  "meta": {
    "total": 42,
    "limit": 50,
    "offset": 0
  }
}
```

- `meta.total` is the count of all matching records (ignoring `limit`/`offset`).
- `meta.limit` is `null` when no limit was requested.

**Error:**

```json
{
  "error": "Human-readable error message",
  "details": { ... }
}
```

- HTTP 400 — validation failure. `details` contains Zod flattened error output.
- HTTP 404 — entity not found.
- HTTP 500 — internal server error.

---

## Products

A product represents a sellable item (e.g. a drink, a meal).

### List Products

```
GET /api/admin/products
```

**Query Parameters:**

| Parameter | Type    | Required | Description            |
|-----------|---------|----------|------------------------|
| `limit`   | integer | no       | Pagination limit.      |
| `offset`  | integer | no       | Pagination offset.     |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/products?limit=10&offset=0'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "prod-001",
      "name": "Espresso",
      "type": "RESTAURANT",
      "isComposite": false,
      "availableAsIngredient": false,
      "attributes": null,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": 10, "offset": 0 }
}
```

### Get Product

```
GET /api/admin/products/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/products/prod-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "prod-001",
    "name": "Espresso",
    "type": "RESTAURANT",
    "isComposite": false,
    "availableAsIngredient": false,
    "attributes": null,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create Product

```
POST /api/admin/products
```

**Request Body Schema:**

| Field                  | Type                          | Required | Default     | Constraints            | Description                              |
|------------------------|-------------------------------|----------|-------------|------------------------|------------------------------------------|
| `id`                   | string                        | yes      | —           | min length 1           | Unique product identifier.               |
| `name`                 | string                        | yes      | —           | min length 1           | Display name.                            |
| `type`                 | `"RETAIL"` \| `"RESTAURANT"` | no       | `"RETAIL"`  | enum                   | Product category type.                   |
| `isComposite`          | boolean                       | no       | `false`     | —                      | Whether the product is a composite.      |
| `availableAsIngredient`| boolean                       | no       | `false`     | —                      | Whether it can be used as an ingredient. |
| `attributes`           | object \| null                | no       | `null`      | —                      | Arbitrary key-value metadata.            |
| `createdAt`            | string                        | no       | auto        | —                      | ISO 8601 creation timestamp.             |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/products \
  -H 'Content-Type: application/json' \
  -d '{"id":"prod-001","name":"Espresso","type":"RESTAURANT"}'
```

**Example Response:**

```json
{
  "data": {
    "id": "prod-001",
    "name": "Espresso",
    "type": "RESTAURANT",
    "isComposite": false,
    "availableAsIngredient": false,
    "attributes": null,
    "createdAt": "2025-04-04T12:00:00.000Z",
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update Product

```
PUT /api/admin/products/:id
```

**Request Body Schema (all fields optional):**

| Field                  | Type                          | Required | Constraints  | Description                              |
|------------------------|-------------------------------|----------|--------------|------------------------------------------|
| `name`                 | string                        | no       | min length 1 | Display name.                            |
| `type`                 | `"RETAIL"` \| `"RESTAURANT"` | no       | enum         | Product category type.                   |
| `isComposite`          | boolean                       | no       | —            | Whether the product is a composite.      |
| `availableAsIngredient`| boolean                       | no       | —            | Whether it can be used as an ingredient. |
| `attributes`           | object \| null                | no       | —            | Arbitrary key-value metadata.            |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/products/prod-001 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Double Espresso"}'
```

**Example Response:**

```json
{
  "data": {
    "id": "prod-001",
    "name": "Double Espresso",
    "type": "RESTAURANT",
    "isComposite": false,
    "availableAsIngredient": false,
    "attributes": null,
    "createdAt": "2025-04-04T12:00:00.000Z",
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete Product

```
DELETE /api/admin/products/:id
```

Soft-deletes the product and cascades to its variants, product-modifier-group links, and BOM entries.

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/products/prod-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

---

## Variants

A variant is a specific purchasable configuration of a product (e.g. "Small Espresso", "Large Espresso").

### List Variants

```
GET /api/admin/variants
```

**Query Parameters:**

| Parameter   | Type    | Required | Description                          |
|-------------|---------|----------|--------------------------------------|
| `limit`     | integer | no       | Pagination limit.                    |
| `offset`    | integer | no       | Pagination offset.                   |
| `productId` | string  | no       | Filter variants by parent product.   |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/variants?productId=prod-001&limit=10'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "var-001",
      "productId": "prod-001",
      "name": "Small Espresso",
      "sku": null,
      "basePrice": 3.5,
      "directInventoryId": null,
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": 10, "offset": 0 }
}
```

### Get Variant

```
GET /api/admin/variants/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/variants/var-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "var-001",
    "productId": "prod-001",
    "name": "Small Espresso",
    "sku": null,
    "basePrice": 3.5,
    "directInventoryId": null,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create Variant

```
POST /api/admin/variants
```

**Request Body Schema:**

| Field              | Type           | Required | Default | Constraints  | Description                                    |
|--------------------|----------------|----------|---------|--------------|------------------------------------------------|
| `id`               | string         | yes      | —       | min length 1 | Unique variant identifier.                     |
| `productId`        | string         | yes      | —       | min length 1 | Parent product ID.                             |
| `name`             | string         | yes      | —       | min length 1 | Display name.                                  |
| `sku`              | string \| null | no       | `null`  | —            | Stock keeping unit code.                       |
| `basePrice`        | number         | no       | `0`     | —            | Base price (in your currency unit).            |
| `directInventoryId`| string \| null | no       | `null`  | —            | Linked inventory item for direct deduction.    |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/variants \
  -H 'Content-Type: application/json' \
  -d '{"id":"var-001","productId":"prod-001","name":"Small Espresso","basePrice":3.50}'
```

**Example Response:**

```json
{
  "data": {
    "id": "var-001",
    "productId": "prod-001",
    "name": "Small Espresso",
    "sku": null,
    "basePrice": 3.5,
    "directInventoryId": null,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update Variant

```
PUT /api/admin/variants/:id
```

**Request Body Schema (all fields optional):**

| Field              | Type           | Required | Constraints  | Description                                 |
|--------------------|----------------|----------|--------------|---------------------------------------------|
| `name`             | string         | no       | min length 1 | Display name.                               |
| `productId`        | string         | no       | min length 1 | Parent product ID.                          |
| `sku`              | string \| null | no       | —            | Stock keeping unit code.                    |
| `basePrice`        | number         | no       | —            | Base price.                                 |
| `directInventoryId`| string \| null | no       | —            | Linked inventory item for direct deduction. |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/variants/var-001 \
  -H 'Content-Type: application/json' \
  -d '{"basePrice":4.00}'
```

**Example Response:**

```json
{
  "data": {
    "id": "var-001",
    "productId": "prod-001",
    "name": "Small Espresso",
    "sku": null,
    "basePrice": 4.0,
    "directInventoryId": null,
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete Variant

```
DELETE /api/admin/variants/:id
```

Soft-deletes the variant and cascades to related BOM entries.

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/variants/var-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

---

## Modifier Groups

A modifier group defines a set of modifiers a customer can choose from (e.g. "Milk Options", "Toppings").

### List Modifier Groups

```
GET /api/admin/modifier-groups
```

**Query Parameters:**

| Parameter | Type    | Required | Description        |
|-----------|---------|----------|--------------------|
| `limit`   | integer | no       | Pagination limit.  |
| `offset`  | integer | no       | Pagination offset. |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/modifier-groups?limit=10&offset=0'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "mg-001",
      "name": "Milk Options",
      "minSelections": 0,
      "maxSelections": 1,
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": 10, "offset": 0 }
}
```

### Get Modifier Group

```
GET /api/admin/modifier-groups/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/modifier-groups/mg-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "mg-001",
    "name": "Milk Options",
    "minSelections": 0,
    "maxSelections": 1,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create Modifier Group

```
POST /api/admin/modifier-groups
```

**Request Body Schema:**

| Field           | Type    | Required | Default | Constraints       | Description                              |
|-----------------|---------|----------|---------|-------------------|------------------------------------------|
| `id`            | string  | yes      | —       | min length 1      | Unique modifier group identifier.        |
| `name`          | string  | yes      | —       | min length 1      | Display name.                            |
| `minSelections` | integer | no       | `0`     | >= 0              | Minimum number of selections required.   |
| `maxSelections` | integer | no       | `0`     | >= 0              | Maximum number of selections allowed (0 = unlimited). |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/modifier-groups \
  -H 'Content-Type: application/json' \
  -d '{"id":"mg-001","name":"Milk Options","minSelections":0,"maxSelections":1}'
```

**Example Response:**

```json
{
  "data": {
    "id": "mg-001",
    "name": "Milk Options",
    "minSelections": 0,
    "maxSelections": 1,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update Modifier Group

```
PUT /api/admin/modifier-groups/:id
```

**Request Body Schema (all fields optional):**

| Field           | Type    | Required | Constraints  | Description                              |
|-----------------|---------|----------|--------------|------------------------------------------|
| `name`          | string  | no       | min length 1 | Display name.                            |
| `minSelections` | integer | no       | >= 0         | Minimum selections required.             |
| `maxSelections` | integer | no       | >= 0         | Maximum selections allowed.              |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/modifier-groups/mg-001 \
  -H 'Content-Type: application/json' \
  -d '{"maxSelections":2}'
```

**Example Response:**

```json
{
  "data": {
    "id": "mg-001",
    "name": "Milk Options",
    "minSelections": 0,
    "maxSelections": 2,
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete Modifier Group

```
DELETE /api/admin/modifier-groups/:id
```

Soft-deletes the group and cascades to its modifiers and product-modifier-group links.

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/modifier-groups/mg-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

---

## Modifiers

A modifier is a single option within a modifier group (e.g. "Oat Milk", "Extra Shot").

### List Modifiers

```
GET /api/admin/modifiers
```

**Query Parameters:**

| Parameter         | Type    | Required | Description                             |
|-------------------|---------|----------|-----------------------------------------|
| `limit`           | integer | no       | Pagination limit.                       |
| `offset`          | integer | no       | Pagination offset.                      |
| `modifierGroupId` | string  | no       | Filter modifiers by parent group.       |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/modifiers?modifierGroupId=mg-001'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "mod-001",
      "modifierGroupId": "mg-001",
      "name": "Oat Milk",
      "baseUpcharge": 0.75,
      "inventoryItemId": null,
      "quantityPerUse": null,
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": null, "offset": 0 }
}
```

### Get Modifier

```
GET /api/admin/modifiers/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/modifiers/mod-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "mod-001",
    "modifierGroupId": "mg-001",
    "name": "Oat Milk",
    "baseUpcharge": 0.75,
    "inventoryItemId": null,
    "quantityPerUse": null,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create Modifier

```
POST /api/admin/modifiers
```

**Request Body Schema:**

| Field             | Type           | Required | Default | Constraints  | Description                                 |
|-------------------|----------------|----------|---------|--------------|---------------------------------------------|
| `id`              | string         | yes      | —       | min length 1 | Unique modifier identifier.                 |
| `modifierGroupId` | string         | yes      | —       | min length 1 | Parent modifier group ID.                   |
| `name`            | string         | yes      | —       | min length 1 | Display name.                               |
| `baseUpcharge`    | number         | no       | `0`     | —            | Additional price when this modifier is selected. |
| `inventoryItemId` | string \| null | no       | `null`  | —            | Inventory item consumed when selected.      |
| `quantityPerUse`  | number \| null | no       | `null`  | —            | Quantity of inventory consumed per use.     |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/modifiers \
  -H 'Content-Type: application/json' \
  -d '{"id":"mod-001","modifierGroupId":"mg-001","name":"Oat Milk","baseUpcharge":0.75}'
```

**Example Response:**

```json
{
  "data": {
    "id": "mod-001",
    "modifierGroupId": "mg-001",
    "name": "Oat Milk",
    "baseUpcharge": 0.75,
    "inventoryItemId": null,
    "quantityPerUse": null,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update Modifier

```
PUT /api/admin/modifiers/:id
```

**Request Body Schema (all fields optional):**

| Field             | Type           | Required | Constraints  | Description                                 |
|-------------------|----------------|----------|--------------|---------------------------------------------|
| `name`            | string         | no       | min length 1 | Display name.                               |
| `modifierGroupId` | string         | no       | min length 1 | Parent modifier group ID.                   |
| `baseUpcharge`    | number         | no       | —            | Additional price.                           |
| `inventoryItemId` | string \| null | no       | —            | Inventory item consumed when selected.      |
| `quantityPerUse`  | number \| null | no       | —            | Quantity consumed per use.                  |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/modifiers/mod-001 \
  -H 'Content-Type: application/json' \
  -d '{"baseUpcharge":1.00}'
```

**Example Response:**

```json
{
  "data": {
    "id": "mod-001",
    "modifierGroupId": "mg-001",
    "name": "Oat Milk",
    "baseUpcharge": 1.0,
    "inventoryItemId": null,
    "quantityPerUse": null,
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete Modifier

```
DELETE /api/admin/modifiers/:id
```

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/modifiers/mod-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

---

## Product Modifier Groups

Links products to modifier groups, with optional per-product scale factors.

### List Product Modifier Groups

```
GET /api/admin/product-modifier-groups
```

**Query Parameters:**

| Parameter   | Type    | Required | Description                              |
|-------------|---------|----------|------------------------------------------|
| `limit`     | integer | no       | Pagination limit.                        |
| `offset`    | integer | no       | Pagination offset.                       |
| `productId` | string  | no       | Filter by product.                       |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/product-modifier-groups?productId=prod-001'
```

**Example Response:**

```json
{
  "data": [
    {
      "productId": "prod-001",
      "modifierGroupId": "mg-001",
      "scaleFactors": null,
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": null, "offset": 0 }
}
```

### Set Product Modifier Groups

Replaces the set of modifier groups linked to a product. Groups not in the new list are soft-deleted; groups already linked are preserved.

```
POST /api/admin/product-modifier-groups/set
```

**Request Body Schema:**

| Field      | Type     | Required | Constraints  | Description                         |
|------------|----------|----------|--------------|-------------------------------------|
| `productId`| string   | yes      | min length 1 | The product to update.              |
| `groupIds` | string[] | yes      | non-empty strings | The new set of modifier group IDs. |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/product-modifier-groups/set \
  -H 'Content-Type: application/json' \
  -d '{"productId":"prod-001","groupIds":["mg-001","mg-002"]}'
```

**Example Response:**

```json
{ "data": { "success": true } }
```

### Set Scale Factors

Sets modifier-level scale factors for a specific product–modifier-group link.

```
POST /api/admin/product-modifier-groups/scale-factors
```

**Request Body Schema:**

| Field             | Type    | Required | Constraints  | Description                                   |
|-------------------|---------|----------|--------------|-----------------------------------------------|
| `productId`       | string  | yes      | min length 1 | The product.                                  |
| `modifierGroupId` | string  | yes      | min length 1 | The modifier group.                           |
| `scaleFactors`    | any     | yes      | —            | Scale factor data (typically `Record<string, Record<string, number>>`). |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/product-modifier-groups/scale-factors \
  -H 'Content-Type: application/json' \
  -d '{"productId":"prod-001","modifierGroupId":"mg-001","scaleFactors":{"mod-001":{"inv-001":1.5}}}'
```

**Example Response:**

```json
{ "data": { "success": true } }
```

---

## Inventory Items

Represents a trackable ingredient or supply item.

### List Inventory Items

```
GET /api/admin/inventory-items
```

**Query Parameters:**

| Parameter | Type    | Required | Description        |
|-----------|---------|----------|--------------------|
| `limit`   | integer | no       | Pagination limit.  |
| `offset`  | integer | no       | Pagination offset. |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/inventory-items?limit=10&offset=0'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "inv-001",
      "name": "Espresso Beans",
      "unitOfMeasure": "oz",
      "currentQuantity": 100,
      "lowStockThreshold": 20,
      "lastPurchasePrice": 1200,
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": 10, "offset": 0 }
}
```

### Get Inventory Item

```
GET /api/admin/inventory-items/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/inventory-items/inv-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "inv-001",
    "name": "Espresso Beans",
    "unitOfMeasure": "oz",
    "currentQuantity": 100,
    "lowStockThreshold": 20,
    "lastPurchasePrice": 1200,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create Inventory Item

```
POST /api/admin/inventory-items
```

**Request Body Schema:**

| Field              | Type           | Required | Default  | Constraints  | Description                               |
|--------------------|----------------|----------|----------|--------------|-------------------------------------------|
| `id`               | string         | yes      | —        | min length 1 | Unique inventory item identifier.         |
| `name`             | string         | yes      | —        | min length 1 | Display name.                             |
| `unitOfMeasure`    | string         | no       | `"each"` | —            | Unit (e.g. "oz", "each", "lb").           |
| `currentQuantity`  | number         | no       | `0`      | —            | Current stock level.                      |
| `lowStockThreshold`| number \| null | no       | `null`   | —            | Alert threshold.                          |
| `lastPurchasePrice`| number \| null | no       | `null`   | —            | Last known purchase price (cents).        |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/inventory-items \
  -H 'Content-Type: application/json' \
  -d '{"id":"inv-001","name":"Espresso Beans","unitOfMeasure":"oz","currentQuantity":100}'
```

**Example Response:**

```json
{
  "data": {
    "id": "inv-001",
    "name": "Espresso Beans",
    "unitOfMeasure": "oz",
    "currentQuantity": 100,
    "lowStockThreshold": null,
    "lastPurchasePrice": null,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update Inventory Item

```
PUT /api/admin/inventory-items/:id
```

**Request Body Schema (all fields optional):**

| Field              | Type           | Required | Constraints  | Description                        |
|--------------------|----------------|----------|--------------|------------------------------------|
| `name`             | string         | no       | min length 1 | Display name.                      |
| `unitOfMeasure`    | string         | no       | —            | Unit of measure.                   |
| `currentQuantity`  | number         | no       | —            | Current stock level.               |
| `lowStockThreshold`| number \| null | no       | —            | Alert threshold.                   |
| `lastPurchasePrice`| number \| null | no       | —            | Last known purchase price (cents). |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/inventory-items/inv-001 \
  -H 'Content-Type: application/json' \
  -d '{"lowStockThreshold":20}'
```

**Example Response:**

```json
{
  "data": {
    "id": "inv-001",
    "name": "Espresso Beans",
    "unitOfMeasure": "oz",
    "currentQuantity": 100,
    "lowStockThreshold": 20,
    "lastPurchasePrice": null,
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete Inventory Item

```
DELETE /api/admin/inventory-items/:id
```

Soft-deletes the item and cascades to related BOM entries.

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/inventory-items/inv-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

### Adjust Inventory Quantity

Atomically adjusts the current quantity by a delta value. The result is clamped to a minimum of 0.

```
POST /api/admin/inventory-items/:id/adjust
```

**Request Body Schema:**

| Field  | Type   | Required | Constraints | Description                                   |
|--------|--------|----------|-------------|-----------------------------------------------|
| `delta`| number | yes      | —           | Amount to add (positive) or subtract (negative). |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/inventory-items/inv-001/adjust \
  -H 'Content-Type: application/json' \
  -d '{"delta":-5}'
```

**Example Response:**

```json
{
  "data": {
    "id": "inv-001",
    "name": "Espresso Beans",
    "unitOfMeasure": "oz",
    "currentQuantity": 95,
    "lowStockThreshold": 20,
    "lastPurchasePrice": 1200,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

---

## Bill of Materials (BOM)

Defines ingredient recipes — how much of each inventory item is consumed when a product or variant is sold.

### List BOM Entries

```
GET /api/admin/bom
```

**Query Parameters:**

| Parameter        | Type    | Required | Description                                   |
|------------------|---------|----------|-----------------------------------------------|
| `limit`          | integer | no       | Pagination limit.                             |
| `offset`         | integer | no       | Pagination offset.                            |
| `sourceId`       | string  | no       | Filter by source entity ID (variant or product). |
| `sourceProductId`| string  | no       | Filter by source product ID.                  |
| `inventoryItemId`| string  | no       | Filter by inventory item.                     |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/bom?sourceId=var-001&limit=10'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "bom-001",
      "sourceType": "VARIANT",
      "sourceId": "var-001",
      "sourceProductId": "prod-001",
      "inventoryItemId": "inv-001",
      "quantityDeducted": 18,
      "scaleFactorMatrix": null,
      "overrideModifierGroupId": null,
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": 10, "offset": 0 }
}
```

### Get BOM Entry

```
GET /api/admin/bom/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/bom/bom-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "bom-001",
    "sourceType": "VARIANT",
    "sourceId": "var-001",
    "sourceProductId": "prod-001",
    "inventoryItemId": "inv-001",
    "quantityDeducted": 18,
    "scaleFactorMatrix": null,
    "overrideModifierGroupId": null,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create BOM Entry

```
POST /api/admin/bom
```

**Request Body Schema:**

| Field                    | Type                      | Required | Default | Constraints  | Description                                    |
|--------------------------|---------------------------|----------|---------|--------------|------------------------------------------------|
| `id`                     | string                    | yes      | —       | min length 1 | Unique BOM entry identifier.                   |
| `sourceType`             | string                    | yes      | —       | min length 1 | `"PRODUCT"` or `"VARIANT"`.                    |
| `sourceId`               | string                    | yes      | —       | min length 1 | ID of the source product or variant.           |
| `inventoryItemId`        | string                    | yes      | —       | min length 1 | Inventory item consumed.                       |
| `sourceProductId`        | string \| null            | no       | `null`  | —            | Parent product ID (for variant sources).       |
| `quantityDeducted`       | number                    | no       | `0`     | —            | Quantity consumed per sale.                    |
| `scaleFactorMatrix`      | `Record<string, number>` \| null | no | `null`  | —            | Modifier-based quantity multipliers.           |
| `overrideModifierGroupId`| string \| null            | no       | `null`  | —            | Modifier group that overrides base deduction.  |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/bom \
  -H 'Content-Type: application/json' \
  -d '{"id":"bom-001","sourceType":"VARIANT","sourceId":"var-001","inventoryItemId":"inv-001","sourceProductId":"prod-001","quantityDeducted":18}'
```

**Example Response:**

```json
{
  "data": {
    "id": "bom-001",
    "sourceType": "VARIANT",
    "sourceId": "var-001",
    "sourceProductId": "prod-001",
    "inventoryItemId": "inv-001",
    "quantityDeducted": 18,
    "scaleFactorMatrix": null,
    "overrideModifierGroupId": null,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update BOM Entry

```
PUT /api/admin/bom/:id
```

**Request Body Schema (all fields optional):**

| Field                    | Type                      | Required | Constraints  | Description                                    |
|--------------------------|---------------------------|----------|--------------|------------------------------------------------|
| `sourceType`             | string                    | no       | min length 1 | `"PRODUCT"` or `"VARIANT"`.                    |
| `sourceId`               | string                    | no       | min length 1 | ID of the source product or variant.           |
| `inventoryItemId`        | string                    | no       | min length 1 | Inventory item consumed.                       |
| `sourceProductId`        | string \| null            | no       | —            | Parent product ID.                             |
| `quantityDeducted`       | number                    | no       | —            | Quantity consumed per sale.                    |
| `scaleFactorMatrix`      | `Record<string, number>` \| null | no | —            | Modifier-based quantity multipliers.           |
| `overrideModifierGroupId`| string \| null            | no       | —            | Modifier group override.                       |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/bom/bom-001 \
  -H 'Content-Type: application/json' \
  -d '{"quantityDeducted":20}'
```

**Example Response:**

```json
{
  "data": {
    "id": "bom-001",
    "sourceType": "VARIANT",
    "sourceId": "var-001",
    "sourceProductId": "prod-001",
    "inventoryItemId": "inv-001",
    "quantityDeducted": 20,
    "scaleFactorMatrix": null,
    "overrideModifierGroupId": null,
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete BOM Entry

```
DELETE /api/admin/bom/:id
```

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/bom/bom-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

---

## Invoices

Represents a supplier purchase invoice.

### List Invoices

```
GET /api/admin/invoices
```

**Query Parameters:**

| Parameter | Type    | Required | Description        |
|-----------|---------|----------|--------------------|
| `limit`   | integer | no       | Pagination limit.  |
| `offset`  | integer | no       | Pagination offset. |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/invoices?limit=10&offset=0'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "inv-001",
      "supplierName": "Bean Co",
      "invoiceNumber": "INV-2025-042",
      "date": "2025-04-04",
      "status": "recorded",
      "notes": "",
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": 10, "offset": 0 }
}
```

### Get Invoice

```
GET /api/admin/invoices/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/invoices/inv-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "inv-001",
    "supplierName": "Bean Co",
    "invoiceNumber": "INV-2025-042",
    "date": "2025-04-04",
    "status": "recorded",
    "notes": "",
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create Invoice

```
POST /api/admin/invoices
```

**Request Body Schema:**

| Field           | Type   | Required | Default      | Constraints  | Description                    |
|-----------------|--------|----------|--------------|--------------|--------------------------------|
| `id`            | string | yes      | —            | min length 1 | Unique invoice identifier.     |
| `supplierName`  | string | yes      | —            | min length 1 | Name of the supplier.          |
| `invoiceNumber` | string | yes      | —            | min length 1 | Supplier's invoice number.     |
| `date`          | string | yes      | —            | min length 1 | Invoice date (e.g. `"2025-04-04"`). |
| `status`        | string | no       | `"recorded"` | —            | Invoice status.                |
| `notes`         | string | no       | `""`         | —            | Free-text notes.               |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/invoices \
  -H 'Content-Type: application/json' \
  -d '{"id":"inv-001","supplierName":"Bean Co","invoiceNumber":"INV-2025-042","date":"2025-04-04"}'
```

**Example Response:**

```json
{
  "data": {
    "id": "inv-001",
    "supplierName": "Bean Co",
    "invoiceNumber": "INV-2025-042",
    "date": "2025-04-04",
    "status": "recorded",
    "notes": "",
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update Invoice

```
PUT /api/admin/invoices/:id
```

**Request Body Schema (all fields optional):**

| Field           | Type   | Required | Constraints  | Description                |
|-----------------|--------|----------|--------------|----------------------------|
| `supplierName`  | string | no       | min length 1 | Supplier name.             |
| `invoiceNumber` | string | no       | min length 1 | Invoice number.            |
| `date`          | string | no       | min length 1 | Invoice date.              |
| `status`        | string | no       | —            | Invoice status.            |
| `notes`         | string | no       | —            | Free-text notes.           |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/invoices/inv-001 \
  -H 'Content-Type: application/json' \
  -d '{"status":"paid"}'
```

**Example Response:**

```json
{
  "data": {
    "id": "inv-001",
    "supplierName": "Bean Co",
    "invoiceNumber": "INV-2025-042",
    "date": "2025-04-04",
    "status": "paid",
    "notes": "",
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete Invoice

```
DELETE /api/admin/invoices/:id
```

Soft-deletes the invoice and cascades to its line items.

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/invoices/inv-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

### Create Invoice with Line Items

Creates an invoice and its line items atomically. Also updates inventory item quantities and last purchase prices.

```
POST /api/admin/invoices/with-line-items
```

**Request Body Schema:**

| Field       | Type                          | Required | Description                         |
|-------------|-------------------------------|----------|-------------------------------------|
| `invoice`   | Invoice create object         | yes      | See Create Invoice schema above.    |
| `lineItems` | InvoiceLineItem create array  | yes      | See below. `invoiceId` is optional here — the server derives it from the created invoice. |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/invoices/with-line-items \
  -H 'Content-Type: application/json' \
  -d '{
    "invoice": {
      "id": "inv-001",
      "supplierName": "Bean Co",
      "invoiceNumber": "INV-2025-042",
      "date": "2025-04-04"
    },
    "lineItems": [
      {
        "id": "ili-001",
        "inventoryItemId": "item-001",
        "description": "Espresso Beans 5lb",
        "quantity": 5,
        "unitPriceCents": 1200
      }
    ]
  }'
```

**Example Response:**

```json
{
  "data": {
    "invoice": {
      "id": "inv-001",
      "supplierName": "Bean Co",
      "invoiceNumber": "INV-2025-042",
      "date": "2025-04-04",
      "status": "recorded",
      "notes": "",
      "updatedAt": 1712234567890,
      "deletedAt": null
    },
    "lineItems": [
      {
        "id": "ili-001",
        "invoiceId": "inv-001",
        "inventoryItemId": "item-001",
        "description": "Espresso Beans 5lb",
        "quantity": 5,
        "unitPriceCents": 1200,
        "updatedAt": 1712234567890,
        "deletedAt": null
      }
    ]
  }
}
```

---

## Invoice Line Items

Individual items on an invoice.

### List Invoice Line Items

```
GET /api/admin/invoice-line-items
```

**Query Parameters:**

| Parameter   | Type    | Required | Description                             |
|-------------|---------|----------|-----------------------------------------|
| `limit`     | integer | no       | Pagination limit.                       |
| `offset`    | integer | no       | Pagination offset.                      |
| `invoiceId` | string  | no       | Filter line items by parent invoice.    |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/invoice-line-items?invoiceId=inv-001'
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "ili-001",
      "invoiceId": "inv-001",
      "inventoryItemId": "item-001",
      "description": "Espresso Beans 5lb",
      "quantity": 5,
      "unitPriceCents": 1200,
      "updatedAt": 1712234567890,
      "deletedAt": null
    }
  ],
  "meta": { "total": 1, "limit": null, "offset": 0 }
}
```

### Get Invoice Line Item

```
GET /api/admin/invoice-line-items/:id
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/invoice-line-items/ili-001'
```

**Example Response:**

```json
{
  "data": {
    "id": "ili-001",
    "invoiceId": "inv-001",
    "inventoryItemId": "item-001",
    "description": "Espresso Beans 5lb",
    "quantity": 5,
    "unitPriceCents": 1200,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Create Invoice Line Item

```
POST /api/admin/invoice-line-items
```

**Request Body Schema:**

| Field            | Type   | Required | Default | Constraints  | Description                         |
|------------------|--------|----------|---------|--------------|-------------------------------------|
| `id`             | string | yes      | —       | min length 1 | Unique line item identifier.        |
| `invoiceId`      | string | yes      | —       | min length 1 | Parent invoice ID.                  |
| `inventoryItemId`| string | yes      | —       | min length 1 | Inventory item purchased.           |
| `description`    | string | no       | `""`    | —            | Description of the line item.       |
| `quantity`       | number | no       | `0`     | —            | Quantity purchased.                 |
| `unitPriceCents` | number | no       | `0`     | —            | Price per unit in cents.            |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/invoice-line-items \
  -H 'Content-Type: application/json' \
  -d '{"id":"ili-001","invoiceId":"inv-001","inventoryItemId":"item-001","description":"Espresso Beans 5lb","quantity":5,"unitPriceCents":1200}'
```

**Example Response:**

```json
{
  "data": {
    "id": "ili-001",
    "invoiceId": "inv-001",
    "inventoryItemId": "item-001",
    "description": "Espresso Beans 5lb",
    "quantity": 5,
    "unitPriceCents": 1200,
    "updatedAt": 1712234567890,
    "deletedAt": null
  }
}
```

### Update Invoice Line Item

```
PUT /api/admin/invoice-line-items/:id
```

**Request Body Schema (all fields optional):**

| Field            | Type   | Required | Constraints  | Description                  |
|------------------|--------|----------|--------------|------------------------------|
| `description`    | string | no       | —            | Description.                 |
| `quantity`       | number | no       | —            | Quantity purchased.          |
| `unitPriceCents` | number | no       | —            | Price per unit in cents.     |
| `inventoryItemId`| string | no       | min length 1 | Inventory item purchased.    |

**Example Request:**

```bash
curl -X PUT http://localhost:5000/api/admin/invoice-line-items/ili-001 \
  -H 'Content-Type: application/json' \
  -d '{"quantity":10}'
```

**Example Response:**

```json
{
  "data": {
    "id": "ili-001",
    "invoiceId": "inv-001",
    "inventoryItemId": "item-001",
    "description": "Espresso Beans 5lb",
    "quantity": 10,
    "unitPriceCents": 1200,
    "updatedAt": 1712234568000,
    "deletedAt": null
  }
}
```

### Delete Invoice Line Item

```
DELETE /api/admin/invoice-line-items/:id
```

**Example Request:**

```bash
curl -X DELETE http://localhost:5000/api/admin/invoice-line-items/ili-001
```

**Example Response:**

```json
{ "data": { "success": true } }
```

---

## Bulk / Utility Endpoints

### Get All Admin Data

Returns all active (non-deleted) admin records across all entity types in a single request.

```
GET /api/admin/all-data
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/all-data'
```

**Example Response:**

```json
{
  "data": {
    "products": [{ "id": "prod-001", "name": "Espresso", "..." : "..." }],
    "variants": [{ "id": "var-001", "productId": "prod-001", "..." : "..." }],
    "modifierGroups": [],
    "productModifierGroups": [],
    "modifiers": [],
    "inventoryItems": [],
    "billOfMaterials": [],
    "invoices": [],
    "invoiceLineItems": []
  }
}
```

### Get All Admin Data (Including Deleted)

Same as above but includes soft-deleted records.

```
GET /api/admin/all-data-with-deleted
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/all-data-with-deleted'
```

**Example Response:**

```json
{
  "data": {
    "products": [{ "id": "prod-001", "name": "Espresso", "deletedAt": null, "..." : "..." }],
    "variants": [{ "id": "var-001", "deletedAt": 1712234567890, "..." : "..." }],
    "modifierGroups": [],
    "productModifierGroups": [],
    "modifiers": [],
    "inventoryItems": [],
    "billOfMaterials": [],
    "invoices": [],
    "invoiceLineItems": []
  }
}
```

### Get Client Sync Data

Returns all sync records for a specific POS client, grouped by table name.

```
GET /api/admin/client-data/:clientCode
```

**Path Parameters:**

| Parameter    | Type   | Description                   |
|--------------|--------|-------------------------------|
| `clientCode` | string | The POS client's unique code. |

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/client-data/POS-001'
```

**Example Response:**

```json
{
  "data": {
    "products": [{ "id": "prod-001", "name": "Espresso", "..." : "..." }],
    "variants": [],
    "modifierGroups": [],
    "modifiers": [],
    "inventoryItems": [],
    "billOfMaterials": []
  }
}
```

### Apply Sync Changes

Applies a batch of admin-side changes to the admin tables.

```
POST /api/admin/apply-sync-changes
```

**Request Body Schema:**

| Field    | Type  | Required | Description                  |
|----------|-------|----------|------------------------------|
| `changes`| array | yes      | Array of change objects.     |

Each change object:

| Field      | Type   | Required | Description                                  |
|------------|--------|----------|----------------------------------------------|
| `tableName`| string | yes      | Entity table name (e.g. `"products"`).       |
| `recordId` | string | yes      | Record identifier.                           |
| `data`     | object | yes      | Full record data.                            |
| `action`   | string | yes      | `"add"`, `"update"`, or `"delete"`.          |

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/apply-sync-changes \
  -H 'Content-Type: application/json' \
  -d '{
    "changes": [
      {
        "tableName": "products",
        "recordId": "prod-002",
        "data": { "id": "prod-002", "name": "Latte", "type": "RESTAURANT" },
        "action": "add"
      }
    ]
  }'
```

**Example Response:**

```json
{ "data": { "success": true } }
```

### Apply Client Sync Changes

Applies changes to a specific POS client's sync records.

```
POST /api/admin/apply-client-sync-changes/:clientCode
```

**Path Parameters:**

| Parameter    | Type   | Description                   |
|--------------|--------|-------------------------------|
| `clientCode` | string | The POS client's unique code. |

Same request body schema as Apply Sync Changes.

**Example Request:**

```bash
curl -X POST http://localhost:5000/api/admin/apply-client-sync-changes/POS-001 \
  -H 'Content-Type: application/json' \
  -d '{
    "changes": [
      {
        "tableName": "products",
        "recordId": "prod-002",
        "data": { "id": "prod-002", "name": "Latte", "type": "RESTAURANT" },
        "action": "add"
      }
    ]
  }'
```

**Example Response:**

```json
{ "data": { "success": true } }
```

### Admin Metrics

Returns aggregate counts across all clients.

```
GET /api/admin/metrics
```

**Example Request:**

```bash
curl 'http://localhost:5000/api/admin/metrics'
```

**Example Response:**

```json
{
  "data": {
    "clientCount": 3,
    "totalProducts": 42,
    "totalVariants": 120,
    "totalInventoryItems": 85,
    "totalSales": 1530
  }
}
```
