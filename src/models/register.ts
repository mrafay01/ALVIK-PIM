// Importing this module registers every Mongoose model with the connection.
//
// Mongoose only knows about a model once its schema module has executed, so
// a route that calls .populate("vendorId") but never imports the Vendor
// model throws MissingSchemaError at request time (clean build, clean
// typecheck — see PROJECT-REPORT.md §10 item 2). Rather than sprinkling
// `import "@/models/Vendor"` across every file that populates a ref, db.ts
// imports this once, so any code path that opens a DB connection has all
// models registered.

import User from "./User";
import LoginOtp from "./LoginOtp";
import Vendor from "./Vendor";
import Item from "./Item";
import Quotation from "./Quotation";
import QuotationRow from "./QuotationRow";
import PurchaseOrder from "./PurchaseOrder";
import SyncLog from "./SyncLog";
import ImportBatch from "./ImportBatch";
import ImportBatchRow from "./ImportBatchRow";
import RateLimit from "./RateLimit";
import Job from "./Job";
import Migration from "./Migration";
import CatalogConflict from "./CatalogConflict";
import CatalogChange from "./CatalogChange";

// Reference each import so nothing is tree-shaken away as an unused binding.
export const MODELS = {
  User,
  LoginOtp,
  Vendor,
  Item,
  Quotation,
  QuotationRow,
  PurchaseOrder,
  SyncLog,
  ImportBatch,
  ImportBatchRow,
  RateLimit,
  Job,
  Migration,
  CatalogConflict,
  CatalogChange,
} as const;
