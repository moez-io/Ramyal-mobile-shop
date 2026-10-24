import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import bcrypt from "bcryptjs";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "royal-mobile-"));
const originalWorkingDirectory = process.cwd();
process.env.JWT_SECRET =
  "integration-test-only-secret-not-for-production-12345";
process.env.NODE_ENV = "test";
process.env.SQLITE_PATH = path.join(temp, "test.sqlite");
const { default: app } = await import("../app.js");
const {
  connect,
  User,
  Phone,
  Customer,
  Sale,
  Payment,
  Refund,
  Inquiry,
  Setting,
  close,
} = await import("../db.js");
const resetPhoto = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads",
  `${crypto.randomUUID()}.jpg`,
);
try {
  process.chdir(temp);
  await connect();
  const adminUser = await User.create({
    name: "Test Admin",
    email: "admin@example.test",
    password: await bcrypt.hash("test-password-1234", 10),
    role: "admin",
  });
  await User.create({
    name: "Staff",
    email: "staff@example.test",
    password: await bcrypt.hash("test-password-1234", 10),
    role: "staff",
  });
  const admin = request.agent(app),
    staff = request.agent(app);
  await admin
    .post("/api/login")
    .send({ email: " admin@example.test ", password: "test-password-1234" })
    .expect(200);
  await admin.post("/api/logout").expect(200);
  await admin
    .post("/api/login")
    .send({ email: "admin@example.test", password: "test-password-1234" })
    .expect(200);
  await admin.get("/api/me").expect(200);
  await staff
    .post("/api/login")
    .send({ email: "staff@example.test", password: "test-password-1234" })
    .expect(200);
  await request(app).get("/api/phones").expect(401);
  const phone = {
    brand: "Apple",
    name: "Test Phone",
    storage: "128GB",
    color: "Gold",
    condition: "new",
    description: "Integration test",
    photos: [`/uploads/${path.basename(resetPhoto)}`],
    cost: 80000,
    price: 100000,
    imeis: ["123456789012345", "223456789012345"],
  };
  fs.mkdirSync(path.dirname(resetPhoto), { recursive: true });
  fs.writeFileSync(resetPhoto, "integration test photo");
  await staff.post("/api/phones").send(phone).expect(403);
  const unit = (
    await admin
      .post("/api/phones")
      .send({ ...phone, imeis: [] })
      .expect(201)
  ).body;
  assert.deepEqual(unit.imeis, []);
  const batchPayload = {
    ...phone,
    units: [
      { imei1: "423456789012345", imei2: "523456789012345" },
      { imei1: "623456789012345", imei2: "" },
    ],
  };
  const addedBatch = await admin
    .post("/api/phones")
    .send(batchPayload)
    .expect(201);
  assert.equal(addedBatch.body.length, 2);
  const countBeforeDuplicateBatch = (await Phone.find().exec()).length;
  await admin
    .post("/api/phones")
    .send({
      ...phone,
      units: [
        { imei1: "723456789012345", imei2: "" },
        { imei1: "423456789012345", imei2: "" },
      ],
    })
    .expect(400);
  assert.equal((await Phone.find().exec()).length, countBeforeDuplicateBatch);
  await staff.post("/api/phones").send(batchPayload).expect(403);
  await admin
    .post("/api/phones")
    .send({ ...phone, imeis: ["423456789012345"] })
    .expect(400);
  await admin
    .post("/api/phones")
    .send({ ...phone, imeis: ["323456789012345", "323456789012345"] })
    .expect(400);
  const publicCatalog = (await request(app).get("/api/catalog").expect(200))
    .body;
  assert.equal(publicCatalog[0].cost, undefined);
  assert.equal(publicCatalog[0].imeis, undefined);
  await request(app).get("/api/inquiries").expect(401);
  await staff.get("/api/inquiries").expect(403);
  const purchaseRequest = {
    phone: unit._id,
    name: "Test Buyer",
    fatherName: "Test Father",
    cnic: "12345-1234567-1",
    contact: "03001234567",
    address: "12 Test Street, Test City",
  };
  await request(app)
    .post("/api/purchase-requests")
    .send(purchaseRequest)
    .expect(201);
  await request(app)
    .post("/api/purchase-requests")
    .send({ ...purchaseRequest, cnic: "1234512345671", name: "Other Buyer" })
    .expect(400);
  await request(app)
    .post("/api/purchase-requests")
    .send({ ...purchaseRequest, cnic: undefined, name: "Buyer Without CNIC" })
    .expect(201);
  const adminInquiries = (await admin.get("/api/inquiries").expect(200)).body;
  assert.equal(adminInquiries.length, 2);
  const cnicRequest = adminInquiries.find(
    (inquiry) => inquiry.name === "Test Buyer",
  );
  const optionalCnicRequest = adminInquiries.find(
    (inquiry) => inquiry.name === "Buyer Without CNIC",
  );
  assert.equal(cnicRequest.cnic, "1234512345671");
  assert.equal(cnicRequest.fatherName, "Test Father");
  assert.equal(cnicRequest.phoneNumber, "03001234567");
  assert.equal(optionalCnicRequest.cnic, "");
  const staffStock = (await staff.get("/api/phones").expect(200)).body;
  assert.equal(staffStock[0].cost, undefined);
  const customer = (
    await staff
      .post("/api/customers")
      .send({
        name: "Moez Test",
        phone: "03001234567",
        address: "Test",
        notes: "",
      })
      .expect(201)
  ).body;
  const saleBody = {
    phone: unit._id,
    buyer: {
      name: customer.name,
      fatherName: "Test Father",
      cnic: "12345-1234567-1",
      phone: customer.phone,
      address: customer.address,
      notes: "",
    },
    type: "installment",
    method: "cash",
    price: 100000,
    down: 25000,
    months: 6,
    first: "2026-01-31",
    imei: "823456789012345",
  };
  const concurrent = await Promise.all([
    admin.post("/api/sales").send(saleBody),
    staff.post("/api/sales").send(saleBody),
  ]);
  assert.equal(concurrent.filter((r) => r.status === 201).length, 1);
  assert.equal((await Sale.find().exec()).length, 1);
  assert.deepEqual((await Phone.findById(unit._id).exec()).imeis, [
    "823456789012345",
  ]);
  assert.equal(
    (await Customer.findById(customer._id).exec()).cnic,
    "1234512345671",
  );
  let sale = (await admin.get("/api/sales")).body[0];
  assert.equal(sale.balance, 8400000);
  assert.equal(sale.schedule[1].due, "2026-02-28");
  assert.equal(sale.phone.cost, undefined);
  const payment = {
    amount: 7000,
    method: "cash",
    note: "Partial payment",
    key: crypto.randomUUID(),
  };
  await staff.post(`/api/sales/${sale._id}/payments`).send(payment).expect(201);
  await staff.post(`/api/sales/${sale._id}/payments`).send(payment).expect(200);
  assert.equal((await Payment.find().exec()).length, 2);
  await staff
    .post(`/api/sales/${sale._id}/payments`)
    .send({ ...payment, amount: 999999, key: crypto.randomUUID() })
    .expect(400);
  sale = (await admin.get("/api/sales")).body[0];
  assert.equal(sale.balance, 7700000);
  assert.equal(sale.schedule[0].remaining, 700000);
  const p = sale.payments.find((p) => p.kind !== "initial");
  await staff
    .post(`/api/payments/${p._id}/reverse`)
    .send({ reason: "Mistaken payment" })
    .expect(403);
  await admin
    .post(`/api/payments/${p._id}/reverse`)
    .send({ reason: "Mistaken payment" })
    .expect(200);
  sale = (await admin.get("/api/sales")).body[0];
  assert.equal(sale.balance, 8400000);
  await admin
    .put("/api/plans")
    .send([
      { months: 3, rate: 99, enabled: true },
      { months: 6, rate: 99, enabled: true },
      { months: 9, rate: 99, enabled: true },
      { months: 12, rate: 99, enabled: true },
    ])
    .expect(200);
  sale = (await admin.get("/api/sales")).body[0];
  assert.equal(sale.quote.rate, 12);
  await admin
    .post(`/api/sales/${sale._id}/return`)
    .send({ reason: "Customer return for inspection" })
    .expect(200);
  assert.equal((await Phone.findById(unit._id).exec()).status, "damaged");
  const refund = {
    amount: 25000,
    method: "cash",
    note: "Down payment returned",
    key: crypto.randomUUID(),
  };
  await admin.post(`/api/sales/${sale._id}/refunds`).send(refund).expect(200);
  await admin.post(`/api/sales/${sale._id}/refunds`).send(refund).expect(200);
  assert.equal((await Refund.find().exec()).length, 1);
  await admin
    .post(`/api/sales/${sale._id}/refunds`)
    .send({ ...refund, amount: 1, key: crypto.randomUUID() })
    .expect(400);
  await staff.delete(`/api/customers/${customer._id}`).expect(403);
  const deletedCustomer = await admin
    .delete(`/api/customers/${customer._id}`)
    .expect(200);
  assert.equal(deletedCustomer.body.removedSales, 1);
  assert.equal(deletedCustomer.body.removedPurchaseRequests, 1);
  const anonymizedCustomer = await Customer.findById(customer._id).exec();
  assert.equal(anonymizedCustomer.name, "Deleted customer");
  assert.equal(anonymizedCustomer.cnic, "");
  assert.equal(anonymizedCustomer.phone, "");
  sale = (await admin.get("/api/sales")).body[0];
  assert.equal(sale.customer.name, "Deleted customer");
  assert.equal(sale.customer.cnic, "");
  assert.equal(sale.balance, 0);
  assert.equal(sale.payments.length, 1);
  const redactedRequest = (await admin.get("/api/inquiries")).body.find(
    (inquiry) => inquiry.name === "Deleted customer",
  );
  assert.equal(redactedRequest.cnic, "");
  assert.equal(redactedRequest.phoneNumber, "");
  assert.equal(sale.refunded, 2500000);
  await request(app)
    .post("/api/inquiries")
    .send({
      name: "General Inquiry",
      phone: "03001112222",
      message: "Is this phone available?",
    })
    .expect(201);
  const phoneCountBeforeClear = (await Phone.find().exec()).length;
  const auditCountBeforeClear = (await admin.get("/api/audit").expect(200)).body
    .length;
  await staff
    .delete("/api/admin/clear-audit-and-inquiries")
    .send({ confirmation: "CLEAR LOGS AND REQUESTS" })
    .expect(403);
  await admin
    .delete("/api/admin/clear-audit-and-inquiries")
    .send({ confirmation: "CLEAR" })
    .expect(400);
  const clearResult = await admin
    .delete("/api/admin/clear-audit-and-inquiries")
    .send({ confirmation: "CLEAR LOGS AND REQUESTS" })
    .expect(200);
  assert.equal(clearResult.body.auditCount, auditCountBeforeClear);
  assert.equal(clearResult.body.inquiryCount, 3);
  assert.equal((await Phone.find().exec()).length, phoneCountBeforeClear);
  assert.equal((await Inquiry.find().exec()).length, 0);
  assert.equal((await Sale.find().exec()).length, 1);
  assert.equal((await Payment.find().exec()).length, 2);
  assert.equal((await Refund.find().exec()).length, 1);
  const remainingAudit = (await admin.get("/api/audit").expect(200)).body;
  assert.equal(remainingAudit.length, 1);
  assert.equal(remainingAudit[0].action, "clear audit logs and inquiries");
  await close();
  await connect();
  assert.equal((await Sale.find().exec()).length, 1);
  await admin
    .put("/api/shop")
    .send({
      name: "Test Shop Settings",
      address: "Test Address",
      phone: "03001234567",
    })
    .expect(200);
  const resetResult = await admin
    .delete("/api/admin/reset-business-data")
    .send({ confirmation: "DELETE ALL BUSINESS DATA" })
    .expect(200);
  assert.equal(resetResult.body.removedPhotos, 1);
  assert.equal(fs.existsSync(resetPhoto), false);
  assert.equal((await Phone.find().exec()).length, 0);
  assert.equal((await Customer.find().exec()).length, 0);
  assert.equal((await Sale.find().exec()).length, 0);
  assert.equal((await Payment.find().exec()).length, 0);
  assert.equal((await Refund.find().exec()).length, 0);
  assert.equal((await Inquiry.find().exec()).length, 0);
  assert.equal((await User.find().exec()).length, 1);
  assert.equal((await User.findById(adminUser.id).exec()).role, "admin");
  assert.equal(
    (await Setting.findOne({ key: "shop" }).exec()).value.name,
    "Test Shop Settings",
  );
  assert.equal(await Setting.findOne({ key: "plans" }).exec(), null);
  await admin
    .get("/api/audit")
    .expect(200)
    .then((response) => {
      assert.equal(response.body.length, 1);
      assert.equal(response.body[0].action, "reset all business data");
    });
  console.log(
    "PASS: SQLite persistence, authentication, role checks, IMEI uniqueness, public privacy, purchase requests, atomic batch inventory, concurrent sale protection, partial payments, idempotency, reversals, historical terms, returns, refunds, customer-data anonymization and safe data clearing.",
  );
} finally {
  close();
  process.chdir(originalWorkingDirectory);
  if (fs.existsSync(resetPhoto)) fs.unlinkSync(resetPhoto);
  fs.rmSync(temp, { recursive: true, force: true });
}
