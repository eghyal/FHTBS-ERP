import { relations } from "drizzle-orm";
import { bigint, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const idempotencyRecords = pgTable("idempotency_records", {
  key: text("key").primaryKey(),
  responsePayload: text("response_payload").notNull(),
  createdAt: text("created_at").notNull(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  stockQuantity: text("stock_quantity").notNull().default("0"),
  updatedAt: text("updated_at"),
});

export const salesOrders = pgTable("sales_orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: text("customer_id").notNull(),
  totalAmount: text("total_amount").notNull().default("0"),
  status: text("status").notNull().default("PENDING"),
  createdById: text("created_by_id"),
  createdAt: text("created_at").notNull(),
});

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: text("unit_price").notNull().default("0"),
  subtotal: text("subtotal").notNull().default("0"),
});

export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(),
  entryNumber: text("entry_number").notNull().unique(),
  date: text("date").notNull(),
  description: text("description"),
  referenceId: text("reference_id"),
  createdById: text("created_by_id"),
  createdAt: text("created_at").notNull().default(""),
});

export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  journalId: text("journal_id").notNull(),
  accountCode: text("account_code").notNull(),
  debit: text("debit").notNull().default("0"),
  credit: text("credit").notNull().default("0"),
});
