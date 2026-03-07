import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- Products ---
  app.get("/api/products", (_req, res) => {
    res.json(storage.getProducts());
  });
  app.post("/api/products", (req, res) => {
    try {
      const product = storage.createProduct(req.body);
      res.status(201).json(product);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/products/:id", (req, res) => {
    const result = storage.updateProduct(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.delete("/api/products/:id", (req, res) => {
    storage.deleteProduct(req.params.id);
    res.status(204).end();
  });

  // --- Variants ---
  app.get("/api/variants", (req, res) => {
    const productId = req.query.productId as string | undefined;
    res.json(storage.getVariants(productId));
  });
  app.post("/api/variants", (req, res) => {
    try {
      const variant = storage.createVariant(req.body);
      res.status(201).json(variant);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/variants/:id", (req, res) => {
    const result = storage.updateVariant(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.delete("/api/variants/:id", (req, res) => {
    storage.deleteVariant(req.params.id);
    res.status(204).end();
  });

  // --- Modifier Groups ---
  app.get("/api/modifier-groups", (_req, res) => {
    res.json(storage.getModifierGroups());
  });
  app.post("/api/modifier-groups", (req, res) => {
    try {
      const group = storage.createModifierGroup(req.body);
      res.status(201).json(group);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/modifier-groups/:id", (req, res) => {
    const result = storage.updateModifierGroup(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.delete("/api/modifier-groups/:id", (req, res) => {
    storage.deleteModifierGroup(req.params.id);
    res.status(204).end();
  });

  // --- Product Modifier Groups ---
  app.get("/api/product-modifier-links", (_req, res) => {
    res.json(storage.getAllProductModifierGroupLinks());
  });
  app.get("/api/product-modifier-scale-factors", (_req, res) => {
    res.json(storage.getAllProductModifierScaleFactors());
  });
  app.get("/api/products/:id/modifier-groups", (req, res) => {
    res.json(storage.getProductModifierGroups(req.params.id));
  });
  app.put("/api/products/:id/modifier-groups", (req, res) => {
    storage.setProductModifierGroups(req.params.id, req.body.groupIds || []);
    res.json({ ok: true });
  });
  app.put("/api/products/:productId/modifier-groups/:groupId/scale-factors", (req, res) => {
    storage.setProductModifierScaleFactors(req.params.productId, req.params.groupId, req.body.scaleFactors ?? null);
    res.json({ ok: true });
  });

  // --- Modifiers ---
  app.get("/api/modifiers", (req, res) => {
    const groupId = req.query.groupId as string | undefined;
    res.json(storage.getModifiers(groupId));
  });
  app.post("/api/modifiers", (req, res) => {
    try {
      const modifier = storage.createModifier(req.body);
      res.status(201).json(modifier);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/modifiers/:id", (req, res) => {
    const result = storage.updateModifier(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.delete("/api/modifiers/:id", (req, res) => {
    storage.deleteModifier(req.params.id);
    res.status(204).end();
  });

  // --- Inventory Items ---
  app.get("/api/inventory", (_req, res) => {
    res.json(storage.getInventoryItems());
  });
  app.post("/api/inventory", (req, res) => {
    try {
      const item = storage.createInventoryItem(req.body);
      res.status(201).json(item);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/inventory/:id", (req, res) => {
    const result = storage.updateInventoryItem(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.post("/api/inventory/:id/adjust", (req, res) => {
    const { delta } = req.body;
    if (typeof delta !== "number") return res.status(400).json({ message: "delta required" });
    const result = storage.adjustInventoryQuantity(req.params.id, delta);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.delete("/api/inventory/:id", (req, res) => {
    storage.deleteInventoryItem(req.params.id);
    res.status(204).end();
  });

  // --- Bill of Materials ---
  app.get("/api/bom", (req, res) => {
    const sourceType = req.query.sourceType as string | undefined;
    const sourceId = req.query.sourceId as string | undefined;
    res.json(storage.getBom(sourceType, sourceId));
  });
  app.post("/api/bom", (req, res) => {
    try {
      const entry = storage.createBom(req.body);
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/bom/:id", (req, res) => {
    const result = storage.updateBom(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.delete("/api/bom/:id", (req, res) => {
    storage.deleteBom(req.params.id);
    res.status(204).end();
  });

  // --- Employees ---
  app.get("/api/employees", (_req, res) => {
    res.json(storage.getEmployees());
  });
  app.post("/api/employees", (req, res) => {
    try {
      const employee = storage.createEmployee(req.body);
      res.status(201).json(employee);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/employees/:id", (req, res) => {
    const result = storage.updateEmployee(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });
  app.delete("/api/employees/:id", (req, res) => {
    storage.deleteEmployee(req.params.id);
    res.status(204).end();
  });

  // --- Time Punches ---
  app.get("/api/time-punches", (req, res) => {
    const employeeId = req.query.employeeId as string | undefined;
    res.json(storage.getTimePunches(employeeId));
  });
  app.post("/api/time-punches", (req, res) => {
    try {
      const punch = storage.createTimePunch(req.body);
      res.status(201).json(punch);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/time-punches/:id", (req, res) => {
    const result = storage.updateTimePunch(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });

  // --- Sales ---
  app.get("/api/sales", (_req, res) => {
    res.json(storage.getSales());
  });
  app.post("/api/sales", (req, res) => {
    try {
      const sale = storage.createSale(req.body);
      res.status(201).json(sale);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  return httpServer;
}
