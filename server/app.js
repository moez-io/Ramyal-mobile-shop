import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { del, put } from "@vercel/blob";
import { z } from "zod";
import {
  connect,
  User,
  Phone,
  Customer,
  Sale,
  Payment,
  Setting,
  Audit,
  Inquiry,
  Refund,
  transaction,
  isConnected,
  clearAuditAndInquiryRecords,
  resetBusinessData,
} from "./db.js";
import {
  quote,
  money,
  schedule,
  allocations,
  MIN_DOWN_PAYMENT,
} from "./finance.js";
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  process.env.JWT_SECRET.startsWith("REPLACE")
)
  throw Error("Set a random JWT_SECRET of at least 32 characters");
const app = express();
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
// Vercel never runs index.js, so connect to the database lazily on the first
// API request and reuse the same connection afterwards.
let ready;
app.use("/api", async (req, res, next) => {
  try {
    ready ??= connect();
    await ready;
    next();
  } catch (err) {
    ready = undefined; // retry on the next request
    next(err);
  }
});
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 60000, limit: 300 }));
// Same-origin cookie requests only. Vite proxies API calls during development.
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin) {
    const origin = new URL(req.headers.origin);
    if (origin.host !== req.headers.host)
      return res.status(403).json({ error: "Cross-origin request rejected" });
  }
  next();
});
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const auth = wrap(async (req, res, next) => {
  try {
    const p = jwt.verify(req.cookies.session, process.env.JWT_SECRET);
    req.user = await User.findById(p.id);
    if (!req.user?.active) throw Error();
    next();
  } catch {
    return res.status(401).json({ error: "Please log in" });
  }
});
const admin = (req, res, next) =>
  req.user.role === "admin"
    ? next()
    : res.status(403).json({ error: "Admin permission required" });
const audit = (req, action, target, details = "") =>
  Audit.create({
    actor: req.user.email,
    action,
    target: String(target),
    details,
  });
const plans = async () => {
  const saved = (await Setting.findOne({ key: "plans" }).exec())?.value;
  const configured = Array.isArray(saved) ? saved : [];
  const defaultRates = { 3: 6, 6: 12, 9: 18, 12: 24 };
  return [3, 6, 9, 12].map((months) => {
    const savedPlan = configured.find((plan) => plan.months === months);
    return {
      months,
      rate:
        Number.isFinite(savedPlan?.rate) &&
        savedPlan.rate >= 0 &&
        savedPlan.rate <= 1000
          ? savedPlan.rate
          : defaultRates[months],
      enabled:
        typeof savedPlan?.enabled === "boolean" ? savedPlan.enabled : true,
    };
  });
};
const validateDownPayment = (price, down) => {
  if (down < MIN_DOWN_PAYMENT || down >= price)
    throw Error(
      "Down payment must be at least PKR 5,000 and less than the phone price",
    );
};
const phoneSchema = z.object({
  brand: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
  storage: z.string().max(50),
  color: z.string().max(50),
  condition: z.enum(["new", "used", "refurbished"]),
  description: z.string().max(3000),
  supplier: z.string().max(100).optional(),
  purchaseDate: z.string().optional(),
  photos: z
    .array(
      z
        .string()
        .refine((v) => v.startsWith("/uploads/") || v.startsWith("https://")),
    )
    .max(8),
  cost: z.coerce.number().nonnegative(),
  price: z.coerce.number().positive(),
  imeis: z
    .array(z.string().regex(/^\d{15}$/, "IMEI must contain 15 digits"))
    .max(2)
    .default([]),
});
app.get("/api/health", (req, res) =>
  res.json({ ok: true, database: isConnected() }),
);
app.post(
  "/api/login",
  rateLimit({ windowMs: 900000, limit: 15 }),
  wrap(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().trim().email(), password: z.string() })
      .parse(req.body);
    const u = await User.findOne({ email: email.toLowerCase(), active: true });
    if (!u || !(await bcrypt.compare(password, u.password)))
      return res.status(401).json({ error: "Invalid email or password" });
    res.cookie(
      "session",
      jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: "8h" }),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 28800000,
      },
    );
    res.json({ name: u.name, role: u.role });
  }),
);
app.post("/api/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) =>
  res.json({ name: req.user.name, role: req.user.role }),
);
app.get(
  "/api/plans",
  wrap(async (req, res) => res.json(await plans())),
);
app.put(
  "/api/plans",
  auth,
  admin,
  wrap(async (req, res) => {
    const p = z
      .array(
        z.object({
          months: z.union([
            z.literal(3),
            z.literal(6),
            z.literal(9),
            z.literal(12),
          ]),
          rate: z.coerce.number().min(0).max(1000),
          enabled: z.boolean(),
        }),
      )
      .length(4)
      .parse(req.body);
    if (new Set(p.map((x) => x.months)).size !== 4)
      throw Error("Each duration must appear once");
    await Setting.findOneAndUpdate(
      { key: "plans" },
      { value: p },
      { upsert: true },
    );
    await audit(req, "update plans", "plans");
    res.json(p);
  }),
);
app.get(
  "/api/catalog",
  wrap(async (req, res) =>
    res.json(
      await Phone.find({ status: "available" })
        .select("-imeis -cost")
        .sort({ createdAt: -1 })
        .limit(500),
    ),
  ),
);
app.post(
  "/api/quote",
  wrap(async (req, res) => {
    const id = z
      .string()
      .regex(/^[0-9a-f-]{36}$/i)
      .parse(req.body.phone);
    const p = await Phone.findOne({ _id: id, status: "available" });
    if (!p) throw Error("Phone unavailable");
    const plan = (await plans()).find(
      (x) => x.months === Number(req.body.months) && x.enabled,
    );
    if (!plan) throw Error("Plan unavailable");
    const down = money(req.body.down);
    validateDownPayment(p.price, down);
    res.json(quote(p.price, down, plan.months, plan.rate));
  }),
);
app.post(
  "/api/inquiries",
  rateLimit({ windowMs: 3600000, limit: 10 }),
  wrap(async (req, res) => {
    const data = z
      .object({
        name: z.string().min(2).max(100),
        phone: z.string().min(7).max(30),
        message: z.string().min(3).max(1000),
      })
      .parse(req.body);
    await Inquiry.create(data);
    res.status(201).json({ ok: true });
  }),
);
app.post(
  "/api/purchase-requests",
  rateLimit({ windowMs: 3600000, limit: 5 }),
  wrap(async (req, res) => {
    const body = z
      .object({
        phone: z.string().uuid(),
        name: z.string().trim().min(2).max(100),
        fatherName: z.string().trim().min(2).max(100),
        cnic: z
          .string()
          .regex(/^\d{5}-?\d{7}-?\d$/, "Enter a valid 13-digit CNIC")
          .optional()
          .or(z.literal(""))
          .default(""),
        contact: z.string().trim().min(7).max(30),
        address: z.string().trim().min(5).max(500),
      })
      .parse(req.body);
    const cnic = body.cnic.replaceAll("-", "");
    let purchaseRequest;
    await transaction(async () => {
      if (cnic) {
        const existing = await Inquiry.find({ type: "purchase", cnic }).exec();
        if (
          existing.some(
            (request) =>
              request.name.toLowerCase() !== body.name.toLowerCase() ||
              request.fatherName.toLowerCase() !==
                body.fatherName.toLowerCase(),
          )
        )
          throw Error(
            "This CNIC is already associated with a different name. Contact the shop for help.",
          );
      }
      const phone = await Phone.findOne({
        _id: body.phone,
        status: "available",
      });
      if (!phone) throw Error("This phone is no longer available");
      [purchaseRequest] = await Inquiry.create([
        {
          type: "purchase",
          phone: {
            id: phone.id,
            brand: phone.brand,
            name: phone.name,
            storage: phone.storage,
            color: phone.color,
            price: phone.price,
          },
          name: body.name,
          fatherName: body.fatherName,
          cnic,
          phoneNumber: body.contact,
          address: body.address,
          status: "pending",
        },
      ]);
    });
    res.status(201).json({ ok: true, id: purchaseRequest.id });
  }),
);
app.get(
  "/api/phones",
  auth,
  wrap(async (req, res) => {
    const list = await Phone.find().sort({ createdAt: -1 }).lean();
    res.json(
      list.map((p) => {
        if (req.user.role !== "admin") delete p.cost;
        return p;
      }),
    );
  }),
);
app.post(
  "/api/phones",
  auth,
  admin,
  wrap(async (req, res) => {
    if (Array.isArray(req.body.units)) {
      const batch = phoneSchema
        .omit({ imeis: true })
        .extend({
          units: z
            .array(
              z.object({
                imei1: z
                  .string()
                  .regex(/^\d{15}$/, "IMEI must contain 15 digits"),
                imei2: z
                  .string()
                  .regex(/^\d{15}$/, "IMEI must contain 15 digits")
                  .or(z.literal(""))
                  .optional(),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(req.body);
      const { units, ...phoneDetails } = batch;
      const imeis = units.flatMap((unit) =>
        [unit.imei1, unit.imei2].filter(Boolean),
      );
      if (new Set(imeis).size !== imeis.length)
        throw Error("Each phone must have unique IMEIs");
      const phones = await transaction(() =>
        Phone.create(
          units.map((unit) => ({
            ...phoneDetails,
            imeis: [unit.imei1, unit.imei2].filter(Boolean),
            cost: money(phoneDetails.cost),
            price: money(phoneDetails.price),
          })),
        ),
      );
      for (const phone of phones)
        await audit(
          req,
          "add stock",
          phone.id,
          `Added as part of ${phones.length}-unit batch`,
        );
      return res.status(201).json(phones);
    }
    const p = phoneSchema.parse(req.body);
    if (new Set(p.imeis).size !== p.imeis.length) throw Error("Duplicate IMEI");
    const phone = await Phone.create({
      ...p,
      cost: money(p.cost),
      price: money(p.price),
    });
    await audit(req, "add stock", phone.id);
    res.status(201).json(phone);
  }),
);
app.put(
  "/api/phones/:id",
  auth,
  admin,
  wrap(async (req, res) => {
    const data = phoneSchema.parse(req.body);
    if (new Set(data.imeis).size !== data.imeis.length)
      throw Error("Duplicate IMEI");
    const p = await Phone.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: "sold" } },
      { ...data, cost: money(data.cost), price: money(data.price) },
      { new: true, runValidators: true },
    );
    if (!p) throw Error("Sold units cannot be edited");
    await audit(req, "edit stock", p.id);
    res.json(p);
  }),
);
app.patch(
  "/api/phones/:id/status",
  auth,
  admin,
  wrap(async (req, res) => {
    const status = z
      .enum(["available", "damaged", "archived"])
      .parse(req.body.status);
    const p = await Phone.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: "sold" } },
      { status },
      { new: true },
    );
    if (!p) throw Error("Cannot change a sold unit");
    await audit(req, "stock status", p.id, status);
    res.json(p);
  }),
);
const uploadDir = path.join(serverDirectory, "uploads");
if (!process.env.VERCEL) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
app.post(
  "/api/upload",
  auth,
  admin,
  upload.single("image"),
  wrap(async (req, res) => {
    const b = req.file?.buffer;
    if (!b) throw Error("Choose an image");
    let ext;
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) ext = "jpg";
    else if (
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      ext = "png";
    else if (
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    )
      ext = "webp";
    else throw Error("Only JPEG, PNG and WebP images accepted");
    const name = crypto.randomUUID() + "." + ext;
    const contentType = {
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    }[ext];
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(name, b, {
        access: "public",
        addRandomSuffix: false,
        contentType,
      });
      return res.json({ url: blob.url });
    }
    if (process.env.VERCEL)
      throw Error(
        "Configure BLOB_READ_WRITE_TOKEN for persistent image uploads",
      );
    await fs.promises.writeFile(path.join(uploadDir, name), b);
    res.json({ url: "/uploads/" + name });
  }),
);
app.use(
  "/uploads",
  express.static(uploadDir, {
    setHeaders: (r) => r.set("X-Content-Type-Options", "nosniff"),
  }),
);
const customerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  fatherName: z.string().trim().max(100).optional().default(""),
  cnic: z
    .string()
    .regex(/^\d{5}-?\d{7}-?\d$/, "Enter a valid 13-digit CNIC")
    .transform((value) => value.replaceAll("-", ""))
    .optional()
    .or(z.literal(""))
    .default(""),
  phone: z.string().trim().min(7).max(30),
  address: z.string().trim().max(500),
  notes: z.string().max(1000).default(""),
});
app.get(
  "/api/customers",
  auth,
  wrap(async (req, res) =>
    res.json(await Customer.find().sort({ createdAt: -1 })),
  ),
);
app.post(
  "/api/customers",
  auth,
  wrap(async (req, res) =>
    res.status(201).json(await Customer.create(customerSchema.parse(req.body))),
  ),
);
app.put(
  "/api/customers/:id",
  auth,
  wrap(async (req, res) =>
    res.json(
      await Customer.findByIdAndUpdate(
        req.params.id,
        customerSchema.parse(req.body),
        { new: true },
      ),
    ),
  ),
);
app.delete(
  "/api/customers/:id",
  auth,
  admin,
  wrap(async (req, res) => {
    let removedSales = 0;
    let removedPurchaseRequests = 0;
    await transaction(async () => {
      const customer = await Customer.findById(req.params.id).exec();
      if (!customer) throw Error("Customer not found");
      const customerId = String(customer._id);
      const cnic = customer.cnic || "";
      const customerRecord = {
        ...customer.toObject(),
        name: "Deleted customer",
        fatherName: "",
        cnic: "",
        phone: "",
        address: "",
        notes: "",
      };
      await Customer.findByIdAndUpdate(customerId, customerRecord);

      for (const sale of await Sale.find().exec()) {
        if (String(sale.customer?._id) !== customerId) continue;
        await Sale.findByIdAndUpdate(sale._id, {
          customer: {
            ...sale.customer,
            name: "Deleted customer",
            fatherName: "",
            cnic: "",
            phone: "",
            address: "",
            notes: "",
          },
        });
        removedSales++;
      }

      if (cnic) {
        const normalizedCnic = cnic.replace(/\D/g, "");
        for (const inquiry of await Inquiry.find({ type: "purchase" }).exec()) {
          if (inquiry.cnic?.replace(/\D/g, "") !== normalizedCnic) continue;
          await Inquiry.findByIdAndUpdate(inquiry._id, {
            name: "Deleted customer",
            fatherName: "",
            cnic: "",
            phoneNumber: "",
            address: "",
          });
          removedPurchaseRequests++;
        }
      }
    });
    await audit(
      req,
      "remove customer personal data",
      req.params.id,
      `Anonymized ${removedSales} sale(s) and ${removedPurchaseRequests} purchase request(s); financial records retained`,
    );
    res.json({
      ok: true,
      removedSales,
      removedPurchaseRequests,
      message:
        "Customer personal details removed. Sales, invoices, balances and payment history were retained.",
    });
  }),
);
async function salesView() {
  const [sales, payments] = await Promise.all([
    Sale.find().sort({ createdAt: -1 }).lean(),
    Payment.find({ reversed: false }).lean(),
  ]);
  const refunds = await Refund.find().lean();
  return sales.map((s) => {
    const ps = payments.filter((p) => String(p.sale) === String(s._id));
    const paid = ps.reduce((n, p) => n + p.amount, 0);
    const total = s.type === "cash" ? s.price : s.quote.total;
    const rs = refunds.filter((r) => String(r.sale) === String(s._id));
    return {
      ...s,
      payments: ps,
      refunds: rs,
      refunded: rs.reduce((n, r) => n + r.amount, 0),
      paid,
      balance: s.status === "returned" ? 0 : total - paid,
      schedule: allocations(
        s.schedule || [],
        ps.filter((p) => p.kind !== "initial"),
      ),
    };
  });
}
app.get(
  "/api/sales",
  auth,
  wrap(async (req, res) => res.json(await salesView())),
);
app.post(
  "/api/sales",
  auth,
  wrap(async (req, res) => {
    const body = z
      .object({
        phone: z.string(),
        customer: z.string().optional(),
        buyer: customerSchema.optional(),
        type: z.enum(["cash", "installment"]),
        method: z.enum(["cash", "bank", "easypaisa"]),
        price: z.coerce.number().positive(),
        down: z.coerce.number().nonnegative(),
        months: z.coerce.number(),
        first: z.string(),
        imei: z
          .string()
          .regex(/^\d{15}$/, "IMEI must contain 15 digits")
          .optional()
          .or(z.literal(""))
          .default(""),
      })
      .refine((value) => value.customer || value.buyer, {
        message: "Enter the buyer details",
        path: ["buyer"],
      })
      .parse(req.body);
    const plan =
      body.type === "installment"
        ? (await plans()).find((x) => x.months === body.months && x.enabled)
        : null;
    if (body.type === "installment") {
      if (!plan) throw Error("Plan unavailable");
      validateDownPayment(money(body.price), money(body.down));
    }
    const invoice = "RM-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    let result;
    await transaction(async () => {
      let customer = body.customer
        ? await Customer.findById(body.customer).exec()
        : null;
      if (body.buyer) {
        const buyer = customerSchema.parse(body.buyer);
        const customers = await Customer.find().exec();
        const byCnic = buyer.cnic
          ? customers.find((candidate) => candidate.cnic === buyer.cnic)
          : null;
        if (
          byCnic &&
          (byCnic.name.toLowerCase() !== buyer.name.toLowerCase() ||
            (byCnic.fatherName &&
              byCnic.fatherName.toLowerCase() !==
                buyer.fatherName.toLowerCase()))
        )
          throw Error("This CNIC is already registered to a different buyer");
        customer =
          byCnic ||
          customers.find(
            (candidate) =>
              !candidate.cnic &&
              candidate.name.toLowerCase() === buyer.name.toLowerCase() &&
              candidate.phone.replace(/\D/g, "") ===
                buyer.phone.replace(/\D/g, ""),
          ) ||
          (await Customer.create(buyer));
        if (customer._id && customer.cnic !== buyer.cnic)
          customer = await Customer.findByIdAndUpdate(customer._id, buyer);
      }
      if (!customer) throw Error("Customer not found");
      const phoneRecord = await Phone.findOne({
        _id: body.phone,
        status: "available",
      }).exec();
      if (!phoneRecord) throw Error("Phone was already sold or is unavailable");
      if (
        phoneRecord.imeis?.length &&
        body.imei &&
        !phoneRecord.imeis.includes(body.imei)
      )
        throw Error("The sale IMEI does not match the selected phone");
      const phoneImeis = phoneRecord.imeis?.length
        ? phoneRecord.imeis
        : body.imei
          ? [body.imei]
          : [];
      if (!phoneImeis.length)
        throw Error("Enter the phone's IMEI to complete the sale");
      if (
        !phoneRecord.imeis?.length &&
        (await Phone.find().exec()).some(
          (candidate) =>
            String(candidate._id) !== String(phoneRecord._id) &&
            candidate.imeis?.includes(body.imei),
        )
      )
        throw Error("This IMEI is already assigned to another phone");
      const phone = await Phone.findOneAndUpdate(
        { _id: body.phone, status: "available" },
        { status: "sold", imeis: phoneImeis },
        { new: true },
      );
      if (!phone) throw Error("Phone was already sold or is unavailable");
      const price = money(body.price);
      let q,
        rows = [];
      const down = body.type === "cash" ? price : money(body.down);
      if (body.type === "installment") {
        q = quote(price, down, body.months, plan.rate);
        rows = schedule(q, body.first);
      }
      const snapshot = phone.toObject();
      delete snapshot.cost;
      [result] = await Sale.create([
        {
          invoice,
          customer: customer.toObject(),
          phone: snapshot,
          type: body.type,
          method: body.method,
          price,
          down,
          quote: q,
          schedule: rows,
          createdBy: req.user.email,
        },
      ]);
      if (down > 0)
        await Payment.create([
          {
            key: crypto.randomUUID(),
            sale: result._id,
            amount: down,
            method: body.method,
            note: body.type === "cash" ? "Cash sale" : "Down payment",
            kind: "initial",
            createdBy: req.user.email,
          },
        ]);
    });
    await audit(req, "sale", result.id, invoice);
    res.status(201).json(result);
  }),
);
app.post(
  "/api/sales/:id/payments",
  auth,
  wrap(async (req, res) => {
    const b = z
      .object({
        amount: z.coerce.number().positive(),
        method: z.enum(["cash", "bank", "easypaisa"]),
        key: z.string().uuid(),
        note: z.string().max(500),
      })
      .parse(req.body);
    const existing = await Payment.findOne({ key: b.key });
    if (existing) {
      if (
        String(existing.sale) !== req.params.id ||
        existing.amount !== money(b.amount) ||
        existing.method !== b.method
      )
        throw Error("Payment key already used for different details");
      return res.json(existing);
    }
    let result;
    await transaction(async () => {
      const sale = await Sale.findOneAndUpdate(
        { _id: req.params.id, status: "active" },
        { $set: { updatedAt: new Date() } },
        { new: true },
      );
      if (!sale) throw Error("Sale unavailable");
      const ps = await Payment.find({
        sale: sale._id,
        reversed: false,
      }).exec();
      const balance =
        (sale.type === "cash" ? sale.price : sale.quote.total) -
        ps.reduce((n, p) => n + p.amount, 0);
      const amount = money(b.amount);
      if (amount > balance) throw Error("Payment exceeds remaining balance");
      [result] = await Payment.create([
        { ...b, sale: sale._id, amount, createdBy: req.user.email },
      ]);
    });
    await audit(req, "payment", result.id);
    res.status(201).json(result);
  }),
);
app.get(
  "/api/payments",
  auth,
  wrap(async (req, res) =>
    res.json(await Payment.find().sort({ createdAt: -1 })),
  ),
);
app.post(
  "/api/payments/:id/reverse",
  auth,
  admin,
  wrap(async (req, res) => {
    const reason = z.string().min(5).max(500).parse(req.body.reason);
    let p;
    await transaction(async () => {
      p = await Payment.findById(req.params.id).exec();
      if (!p || p.reversed) throw Error("Payment unavailable");
      const s = await Sale.findOneAndUpdate(
        { _id: p.sale, status: "active" },
        { $set: { updatedAt: new Date() } },
      );
      if (!s) throw Error("Returned sale cannot be changed");
      if (p.kind === "initial")
        throw Error("Use the return workflow for initial payments");
      p.reversed = true;
      p.reason = reason;
      await p.save();
    });
    await audit(req, "reverse payment", p.id, reason);
    res.json(p);
  }),
);
app.post(
  "/api/sales/:id/return",
  auth,
  admin,
  wrap(async (req, res) => {
    const reason = z.string().min(5).max(500).parse(req.body.reason);
    await transaction(async () => {
      const s = await Sale.findOneAndUpdate(
        { _id: req.params.id, status: "active" },
        { status: "returned" },
        { new: true },
      );
      if (!s) throw Error("Sale unavailable");
      await Phone.updateOne(
        { _id: s.phone._id },
        { $set: { status: "damaged" } },
      );
      await Audit.create([
        {
          actor: req.user.email,
          action: "return; refund pending",
          target: s.id,
          details: reason,
        },
      ]);
    });
    res.json({
      ok: true,
      message:
        "Returned to inspection stock. Record any refund from the invoice screen.",
    });
  }),
);
app.post(
  "/api/sales/:id/refunds",
  auth,
  admin,
  wrap(async (req, res) => {
    const b = z
      .object({
        amount: z.coerce.number().positive(),
        method: z.enum(["cash", "bank", "easypaisa"]),
        note: z.string().min(5).max(500),
        key: z.string().uuid(),
      })
      .parse(req.body);
    let result;
    await transaction(async () => {
      const s = await Sale.findOneAndUpdate(
        { _id: req.params.id, status: "returned" },
        { $set: { updatedAt: new Date() } },
        { new: true },
      );
      if (!s) throw Error("Only returned sales can be refunded");
      const existing = await Refund.findOne({ key: b.key }).exec();
      if (existing) {
        if (
          String(existing.sale) !== s.id ||
          existing.amount !== money(b.amount)
        )
          throw Error("Refund key already used");
        result = existing;
        return;
      }
      const ps = await Payment.find({ sale: s._id, reversed: false }).exec();
      const rs = await Refund.find({ sale: s._id }).exec();
      const remaining =
          ps.reduce((n, p) => n + p.amount, 0) -
          rs.reduce((n, r) => n + r.amount, 0),
        amount = money(b.amount);
      if (amount > remaining)
        throw Error("Refund exceeds refundable collected amount");
      [result] = await Refund.create([
        { ...b, sale: s._id, amount, createdBy: req.user.email },
      ]);
    });
    await audit(req, "record refund", result.id);
    res.json(result);
  }),
);
app.get(
  "/api/shop",
  wrap(async (req, res) =>
    res.json(
      (await Setting.findOne({ key: "shop" }))?.value || {
        name: "Ramyal Mobile Shop",
        address: "",
        phone: "",
      },
    ),
  ),
);
app.put(
  "/api/shop",
  auth,
  admin,
  wrap(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(2).max(100),
        address: z.string().max(500),
        phone: z.string().max(30),
      })
      .parse(req.body);
    await Setting.findOneAndUpdate(
      { key: "shop" },
      { value: b },
      { upsert: true },
    );
    res.json(b);
  }),
);
app.get(
  "/api/audit",
  auth,
  admin,
  wrap(async (req, res) =>
    res.json(await Audit.find().sort({ createdAt: -1 }).limit(500)),
  ),
);
app.delete(
  "/api/admin/clear-audit-and-inquiries",
  auth,
  admin,
  wrap(async (req, res) => {
    z.object({
      confirmation: z.literal("CLEAR LOGS AND REQUESTS"),
    }).parse(req.body);
    const { auditCount, inquiryCount } = await clearAuditAndInquiryRecords();
    await audit(
      req,
      "clear audit logs and inquiries",
      "audit and inquiry records",
      `Removed ${auditCount} prior audit record(s) and ${inquiryCount} inquiry or purchase request(s); phone inventory, customers and financial history retained`,
    );
    res.json({
      ok: true,
      auditCount,
      inquiryCount,
      message: `Cleared ${auditCount} audit record(s) and ${inquiryCount} inquiry/request(s). Phone inventory and all customer and financial history were kept.`,
    });
  }),
);
app.delete(
  "/api/admin/reset-business-data",
  auth,
  admin,
  wrap(async (req, res) => {
    z.object({
      confirmation: z.literal("DELETE ALL BUSINESS DATA"),
    }).parse(req.body);
    const { removed, uploadedPhotos } = await resetBusinessData(req.user.id);
    let removedPhotos = 0;
    for (const photo of uploadedPhotos) {
      if (photo.startsWith("https://")) {
        await del(photo);
        removedPhotos++;
        continue;
      }
      const filename = path.basename(photo);
      if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(filename)) continue;
      try {
        await fs.promises.unlink(path.join(uploadDir, filename));
        removedPhotos++;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await audit(
      req,
      "reset all business data",
      "business records",
      `Removed records: ${JSON.stringify(removed)}; removed ${removedPhotos} uploaded phone photo(s); kept current admin and shop settings`,
    );
    res.json({
      ok: true,
      removed,
      removedPhotos,
      message:
        "All business data and linked phone photos were removed. Your admin account and shop settings were kept.",
    });
  }),
);
app.get(
  "/api/inquiries",
  auth,
  admin,
  wrap(async (req, res) =>
    res.json(await Inquiry.find().sort({ createdAt: -1 }).limit(500)),
  ),
);
app.get(
  "/api/users",
  auth,
  admin,
  wrap(async (req, res) => res.json(await User.find().select("-password"))),
);
app.post(
  "/api/users",
  auth,
  admin,
  wrap(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(12),
        role: z.enum(["admin", "staff"]),
      })
      .parse(req.body);
    const u = await User.create({
      ...b,
      email: b.email.toLowerCase(),
      password: await bcrypt.hash(b.password, 12),
    });
    await audit(req, "create user", u.id);
    res.json({ id: u.id });
  }),
);
app.patch(
  "/api/users/:id",
  auth,
  admin,
  wrap(async (req, res) => {
    if (req.params.id === req.user.id) throw Error("Cannot disable yourself");
    const active = z.boolean().parse(req.body.active);
    await User.findByIdAndUpdate(req.params.id, { active });
    await audit(req, "set user active", req.params.id, String(active));
    res.json({ ok: true });
  }),
);
app.use(express.static(path.resolve(serverDirectory, "../client/dist")));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({ error: "Unknown endpoint" });
  res.sendFile(path.resolve(serverDirectory, "../client/dist/index.html"));
});
app.use((err, req, res, next) => {
  const message =
    err instanceof z.ZodError
      ? err.issues.map((i) => i.message).join("; ")
      : err.code === 11000
        ? "Duplicate IMEI, email, invoice or payment reference"
        : err.name === "CastError"
          ? "Invalid record identifier"
          : err.message;
  res.status(400).json({ error: message || "Request failed" });
});
export default app;
