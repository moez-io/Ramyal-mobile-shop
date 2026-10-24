import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Smartphone,
  LayoutDashboard,
  Package,
  Users,
  Receipt,
  Wallet,
  Settings,
  Search,
  LogOut,
  Menu,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Upload,
  Plus,
  Printer,
  Download,
  Trash2,
} from "lucide-react";
import "./style.css";
const cash = (n) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format((n || 0) / 100);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const MIN_DOWN_PAYMENT = 5000;
const phoneStockKey = (phone) =>
  JSON.stringify([
    phone.brand,
    phone.name,
    phone.storage,
    phone.color,
    phone.condition,
    phone.price,
  ]);
async function api(url, method = "GET", data) {
  const r = await fetch("/api" + url, {
    method,
    headers:
      data instanceof FormData ? {} : { "Content-Type": "application/json" },
    body: data
      ? data instanceof FormData
        ? data
        : JSON.stringify(data)
      : undefined,
  });
  const responseText = await r.text();
  let j;
  try {
    j = responseText ? JSON.parse(responseText) : null;
  } catch {
    if (!r.ok)
      throw Error(
        `Backend returned an invalid response (HTTP ${r.status}). Check the backend terminal for its startup or database error.`,
      );
    throw Error(`Backend returned invalid JSON (HTTP ${r.status}).`);
  }
  if (!r.ok)
    throw Error(
      j?.error ||
        `Backend request failed (HTTP ${r.status}). Check the backend terminal.`,
    );
  if (j === null)
    throw Error(
      `Backend returned an empty response (HTTP ${r.status}). Check that the API server is running.`,
    );
  return j;
}
const blankPhone = {
  brand: "",
  name: "",
  storage: "128GB",
  color: "",
  condition: "new",
  description: "",
  photos: [],
  cost: "",
  price: "",
  imei1: "",
  imei2: "",
};
function Field({ label, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function Select({ label, children, ...props }) {
  return (
    <label>
      {label}
      <select {...props}>{children}</select>
    </label>
  );
}
function PhoneArt() {
  return (
    <div className="phone-art">
      <div className="phone-back">
        <div className="lenses">
          <i />
          <i />
          <i />
        </div>
        <Smartphone size={45} />
      </div>
      <div className="phone-front">
        <div className="island" />
        <div className="orbit" />
        <span>
          RAMYAL
          <br />
          COLLECTION
        </span>
      </div>
    </div>
  );
}
function Picture({ p }) {
  return p.photos?.[0] ? (
    <img className="product-image" src={p.photos[0]} alt={p.name} />
  ) : (
    <div className="placeholder">
      <Smartphone size={76} />
      <span>{p.brand}</span>
    </div>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [mode, setMode] = useState("shop"),
    [page, setPage] = useState("Dashboard"),
    [data, setData] = useState({
      phones: [],
      customers: [],
      sales: [],
      payments: [],
      plans: [],
    }),
    [catalog, setCatalog] = useState([]),
    [plans, setPlans] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [quote, setQuote] = useState(null),
    [extra, setExtra] = useState([]),
    [filter, setFilter] = useState("all"),
    [shop, setShop] = useState({
      name: "Ramyal Mobile Shop",
      address: "",
      phone: "",
    });
  const notify = (s) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 6000);
  };
  async function publicLoad() {
    const [c, p] = await Promise.all([api("/catalog"), api("/plans")]);
    setCatalog(c);
    setPlans(p);
    setShop(await api("/shop"));
  }
  async function load() {
    const [p, c, s, y, t] = await Promise.all(
      ["/phones", "/customers", "/sales", "/payments", "/plans"].map((x) =>
        api(x),
      ),
    );
    setData({ phones: p, customers: c, sales: s, payments: y, plans: t });
    await publicLoad();
  }
  useEffect(() => {
    publicLoad().catch((e) => setError("Backend connection: " + e.message));
    api("/me")
      .then(setUser)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    setSearch("");
    setFilter("all");
    if (user && ["Audit", "Staff", "Inquiries"].includes(page))
      api(
        "/" + { Audit: "audit", Staff: "users", Inquiries: "inquiries" }[page],
      )
        .then(setExtra)
        .catch((e) => setError(e.message));
  }, [page, user]);
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(url, body, method = "POST") {
    await api(url, method, body);
    await load();
    setModal(null);
    notify("Saved successfully");
  }
  function exportCSV(rows, name) {
    const keys = Object.keys(rows[0] || {});
    const esc = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const text = [keys, ...rows.map((r) => keys.map((k) => r[k]))]
      .map((r) => r.map(esc).join(","))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\uFEFF" + text], { type: "text/csv" }),
    );
    a.download = name + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const match = (v) =>
    JSON.stringify(v).toLowerCase().includes(search.toLowerCase());
  const buyerSales = data.sales.filter((sale) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const numericQuery = query.replace(/\D/g, "");
    return [
      sale.invoice,
      sale.phone.brand,
      sale.phone.name,
      ...(sale.phone.imeis || []),
      sale.customer.name,
      sale.customer.phone,
      sale.customer.address,
      sale.customer.notes,
    ]
      .filter(Boolean)
      .some((value) => {
        const text = String(value).toLowerCase();
        const digits = text.replace(/\D/g, "");
        return (
          text.includes(query) ||
          (numericQuery.length >= 4 && digits.includes(numericQuery))
        );
      });
  });
  const activeSale =
    modal?.type === "detail"
      ? data.sales.find((sale) => sale._id === modal.sale._id) || modal.sale
      : null;
  const activeBuyer = activeSale
    ? data.customers.find(
        (customer) =>
          String(customer._id) === String(activeSale.customer._id),
      ) || activeSale.customer
    : null;
  const buyerHistory = activeBuyer
    ? data.sales.filter(
        (sale) =>
          String(sale.customer._id) === String(activeBuyer._id) ||
          (sale.customer.phone &&
            sale.customer.phone === activeBuyer.phone),
      )
    : [];
  const stockCounts = catalog.reduce((counts, phone) => {
    const key = phoneStockKey(phone);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const availablePhoneCount = data.phones.filter(
    (phone) => phone.status === "available",
  ).length;
  const refunded = data.sales.reduce((n, s) => n + (s.refunded || 0), 0);
  const outstanding = data.sales
      .filter((s) => s.status !== "returned")
      .reduce((n, s) => n + s.balance, 0),
    collected = data.payments
      .filter((p) => !p.reversed)
      .reduce((n, p) => n + p.amount, 0),
    overdue = data.sales
      .filter((s) => s.status !== "returned")
      .reduce(
        (n, s) =>
          n +
          s.schedule
            .filter((r) => r.due < today())
            .reduce((v, r) => v + r.remaining, 0),
        0,
      );
  const nav = [
    ["Dashboard", LayoutDashboard],
    ["Inventory", Package],
    ["Customers", Users],
    ["Sales", Receipt],
    ["Installments", Wallet],
    ...(user?.role === "admin" ? [["Buyer lookup", Search]] : []),
    ["Payments", Wallet],
    ["Reports", LayoutDashboard],
    ["Inquiries", Receipt],
    ...(user?.role === "admin"
      ? [
          ["Plans", Settings],
          ["Shop settings", Settings],
          ["Staff", Users],
          ["Audit", ShieldCheck],
          ["Clear data", Trash2],
        ]
      : []),
  ];
  return (
    <>
      <div className="toast-area">
        {error && (
          <div role="alert" className="toast error">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {notice && (
          <div role="status" className="toast">
            {notice}
          </div>
        )}
      </div>
      {mode === "shop" ? (
        <>
          <header>
            <a className="brand" href="#" onClick={() => setMode("shop")}>
              <Smartphone />
              <span>
                {shop.name.toUpperCase()}
                <small>PREMIUM PHONES · PERSONAL SERVICE</small>
              </span>
            </a>
            <nav>
              <a href="#collection">Phones</a>
              <a href="#calculator">Installments</a>
              <a href="#contact">Contact</a>
              <button
                className="outline"
                onClick={() => setMode(user ? "admin" : "login")}
              >
                {user ? "Dashboard" : "Admin Login"}
              </button>
            </nav>
          </header>
          <section className="hero">
            <div>
              <p className="eyebrow">THE RAMYAL COLLECTION</p>
              <h1>
                Premium phones.
                <br />
                <em>Flexible payments.</em>
              </h1>
              <p className="muted">
                Discover your next upgrade. Explore cash prices and clear
                installment plans over 3, 6, 9 or 12 months.
              </p>
              <div className="actions">
                <a className="button gold" href="#collection">
                  Browse phones <ArrowRight size={17} />
                </a>
                <a className="button outline" href="#calculator">
                  Calculate installments
                </a>
              </div>
              <div className="hero-foot">
                <span>
                  <ShieldCheck /> Clear payment terms
                </span>
                <span>
                  <Wallet /> Flexible plans
                </span>
                <span>
                  <Smartphone /> New & used phones
                </span>
              </div>
            </div>
            <PhoneArt />
          </section>
          <main className="store">
            <section id="collection">
              <p className="eyebrow">CURATED FOR YOU</p>
              <div className="section-title">
                <h2>Find your next upgrade</h2>
                <b>{catalog.length} phones currently available</b>
                <input
                  aria-label="Search phones"
                  placeholder="Search brand, model, storage…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="products">
                {catalog.filter(match).map((p) => (
                  <article className="product" key={p._id}>
                    <Picture p={p} />
                    <span className="tag">{p.condition}</span>
                    <h3>
                      {p.brand} {p.name}
                    </h3>
                    <p>
                      {p.storage} · {p.color}
                    </p>
                    <small>
                      {stockCounts[phoneStockKey(p)]}{" "}
                      {stockCounts[phoneStockKey(p)] === 1
                        ? "unit"
                        : "units"}{" "}
                      available in store
                    </small>
                    <strong>{cash(p.price)}</strong>
                    <p className="description">{p.description}</p>
                    <button
                      className="text-button"
                      onClick={() => setModal({ type: "product", phone: p })}
                    >
                      Photos & details
                    </button>
                    <button
                      className="light"
                      onClick={() => {
                        setSelected(p);
                        setQuote(null);
                        document
                          .getElementById("calculator")
                          .scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      View installment plans <ArrowRight size={15} />
                    </button>
                    <button
                      className="gold"
                      onClick={() =>
                        setModal({ type: "purchase-request", phone: p })
                      }
                    >
                      Request to buy in store
                    </button>
                  </article>
                ))}
              </div>
              {!catalog.length && (
                <div className="empty">
                  <Package />
                  <h3>Your collection starts here</h3>
                  <p>
                    Available phones appear here after the admin adds stock.
                  </p>
                </div>
              )}
            </section>
            <section id="calculator" className="calculator">
              <div>
                <p className="eyebrow">PLAN YOUR UPGRADE</p>
                <h2>
                  One phone.
                  <br />
                  Your payment plan.
                </h2>
                <p>
                  See your down payment and monthly payments before you
                  decide.
                </p>
                <p className="formula">
                  Financed balance = Cash price − Down payment
                  <br />
                  Monthly payments are based on the remaining balance and
                  selected duration.
                </p>
                <small>
                  Estimates only. Stock and final terms require shop
                  confirmation. Minimum down payment is PKR 5,000 and must be
                  less than the phone price.
                </small>
              </div>
              <form
                className="panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  run(async () => setQuote(await api("/quote", "POST", f)));
                }}
              >
                <h3>Installment calculator</h3>
                <Select
                  label="Choose phone"
                  name="phone"
                  required
                  value={selected?._id || ""}
                  onChange={(e) => {
                    setSelected(catalog.find((p) => p._id === e.target.value));
                    setQuote(null);
                  }}
                >
                  <option value="">Select an available phone</option>
                  {catalog.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.brand} {p.name} · {p.storage} · {cash(p.price)}
                    </option>
                  ))}
                </Select>
                <Field
                  label="Down payment (PKR)"
                  name="down"
                  type="number"
                  min={MIN_DOWN_PAYMENT}
                  step="0.01"
                  required
                  onChange={() => setQuote(null)}
                />
                <small className="hint">
                  Minimum PKR {MIN_DOWN_PAYMENT.toLocaleString("en-PK")}; it
                  must be less than the selected phone price (
                  {cash(selected?.price)}).
                </small>
                <Select
                  label="Plan duration"
                  name="months"
                  onChange={() => setQuote(null)}
                >
                  {plans
                    .filter((p) => p.enabled)
                    .map((p) => (
                      <option value={p.months} key={p.months}>
                        {p.months} months
                      </option>
                    ))}
                </Select>
                <button disabled={busy || !selected} className="gold">
                  Calculate plan
                </button>
                {quote && (
                  <div className="quote">
                    <strong>
                      {cash(quote.monthly)} <small>/ month</small>
                    </strong>
                    <p>Final installment: {cash(quote.final)}</p>
                    <p>
                      Financed: {cash(quote.financed)}
                    </p>
                    <p>
                      Total including down payment: <b>{cash(quote.total)}</b>
                    </p>
                  </div>
                )}
              </form>
            </section>
            <section id="contact" className="contact">
              <div>
                <p className="eyebrow">LET’S TALK</p>
                <h2>Need help choosing?</h2>
                <p>
                  {shop.name}
                  <br />
                  {shop.address}
                  <br />
                  {shop.phone}
                </p>
                <p>
                  Send your phone preference and payment questions to the shop.
                </p>
              </div>
              <form
                className="panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const b = Object.fromEntries(new FormData(form));
                  run(async () => {
                    await api("/inquiries", "POST", b);
                    form.reset();
                    notify(
                      "Inquiry sent. The shop can view it in the admin panel.",
                    );
                  });
                }}
              >
                <Field name="name" label="Your name" required />
                <Field
                  name="phone"
                  label="Phone number"
                  required
                  minLength={7}
                />
                <label>
                  Your message
                  <textarea name="message" required minLength={3} />
                </label>
                <button disabled={busy} className="gold">
                  Send inquiry
                </button>
              </form>
            </section>
          </main>
          <footer>
            {shop.name} <span>Cash & installment phone sales · PKR</span>
          </footer>
        </>
      ) : mode === "login" ? (
        <div className="login">
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                setUser(await api("/login", "POST", b));
                setMode("admin");
              });
            }}
          >
            <Smartphone className="gold-text" size={40} />
            <p className="eyebrow">{shop.name}</p>
            <h2>Welcome back</h2>
            <p>Sign in to manage your shop.</p>
            <Field
              label="Email address"
              name="email"
              type="email"
              required
              autoComplete="username"
            />
            <Field
              label="Password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            <button disabled={busy} className="gold">
              Sign in
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setMode("shop")}
            >
              Back to storefront
            </button>
            <small>
              Create your first admin using the terminal command in README.md.
            </small>
          </form>
        </div>
      ) : (
        <div className="admin">
          <aside>
            <div className="brand">
              <Smartphone />
              <span>
                RAMYAL MOBILE<small>SHOP MANAGEMENT</small>
              </span>
            </div>
            <div className="nav-items">
              {nav.map(([name, Icon]) => (
                <button
                  key={name}
                  className={page === name ? "active" : ""}
                  onClick={() => setPage(name)}
                >
                  <Icon size={19} />
                  {name}
                </button>
              ))}
            </div>
            <div className="sidebar-bottom">
              <small>
                {user?.name} · {user?.role}
              </small>
              <button onClick={() => setMode("shop")}>
                View storefront <ArrowRight size={15} />
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    await api("/logout", "POST");
                    setUser(null);
                    setMode("login");
                  })
                }
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </aside>
          <div className="workspace">
            <div className="topbar">
              <button
                className="back-storefront"
                onClick={() => setMode("shop")}
              >
                <ArrowLeft size={16} /> Back to storefront
              </button>
              <div>
                <span>
                  <span className="status-dot" /> Connected workspace
                </span>
                <span>{today()} · PKR</span>
                <button
                  className="admin-logout"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/logout", "POST");
                      setUser(null);
                      setMode("login");
                    })
                  }
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </div>
            <main className="admin-main">
              <p className="eyebrow">YOUR BUSINESS, AT A GLANCE</p>
              <div className="section-title">
                <h1>{page}</h1>
                <div className="actions">
                  {page === "Inventory" && user?.role === "admin" && (
                    <button
                      className="gold"
                      onClick={() =>
                        setModal({ type: "phone", value: blankPhone })
                      }
                    >
                      <Plus size={16} /> Add phones
                    </button>
                  )}
                  {page === "Customers" && (
                    <button
                      className="gold"
                      onClick={() => setModal({ type: "customer", value: {} })}
                    >
                      Add customer
                    </button>
                  )}
                  {page === "Sales" && (
                    <button
                      className="gold"
                      onClick={() => setModal({ type: "sale" })}
                    >
                      New sale
                    </button>
                  )}
                  {page === "Staff" && (
                    <button
                      className="gold"
                      onClick={() => setModal({ type: "staff" })}
                    >
                      Add staff
                    </button>
                  )}
                </div>
              </div>
              {page === "Dashboard" ? (
                <>
                  <div className="stats">
                    {[
                      [
                        "Available phones",
                        data.phones.filter((p) => p.status === "available")
                          .length,
                        Package,
                      ],
                      ["Net collected", cash(collected - refunded), Wallet],
                      ["Outstanding", cash(outstanding), Receipt],
                      ["Overdue", cash(overdue), ShieldCheck],
                    ].map(([label, v, Icon]) => (
                      <div className="stat" key={label}>
                        <Icon />
                        <small>{label}</small>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="panel">
                    <div className="section-title">
                      <h3>Recent sales</h3>
                      <button
                        className="text-button"
                        onClick={() => setPage("Sales")}
                      >
                        All sales →
                      </button>
                    </div>
                    <SalesTable
                      rows={data.sales.slice(0, 6)}
                      onOpen={(s) => setModal({ type: "detail", sale: s })}
                    />
                  </div>
                  <div className="panel">
                    <h3>Stock overview</h3>
                    <p>
                      {
                        data.phones.filter((p) => p.status === "available")
                          .length
                      }{" "}
                      available ·{" "}
                      {data.phones.filter((p) => p.status === "sold").length}{" "}
                      sold ·{" "}
                      {data.phones.filter((p) => p.status === "damaged").length}{" "}
                      awaiting inspection / damaged
                    </p>
                    {user?.role === "admin" && (
                      <p>
                        Available inventory cost:{" "}
                        <b>
                          {cash(
                            data.phones
                              .filter((p) => p.status === "available")
                              .reduce((n, p) => n + p.cost, 0),
                          )}
                        </b>
                      </p>
                    )}
                    <small>
                      Net collected = posted payments − recorded refunds. Refund
                      records track money you return; this system does not move
                      money automatically.
                    </small>
                  </div>
                </>
              ) : (
                <>
                  <div className="toolbar">
                    <div className="search">
                      <Search size={18} />
                      <input
                        aria-label={
                          page === "Buyer lookup"
                            ? "Search by IMEI, buyer name, or contact"
                            : "Search records"
                        }
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={
                          page === "Inventory"
                            ? "Search IMEI, brand, model…"
                            : page === "Buyer lookup"
                              ? "Search IMEI, buyer name, or contact…"
                              : "Search records…"
                        }
                      />
                    </div>
                    {["Inventory", "Installments"].includes(page) && (
                      <select
                        aria-label="Filter status"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        {(page === "Inventory"
                          ? ["all", "available", "sold", "damaged", "archived"]
                          : ["all", "outstanding", "overdue", "completed"]
                        ).map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    )}
                    <button className="light" onClick={() => run(load)}>
                      Refresh
                    </button>
                  </div>
                  {page === "Inventory" && (
                    <div className="panel stock-summary">
                      <b>{availablePhoneCount}</b>{" "}
                      {availablePhoneCount === 1 ? "phone" : "phones"} currently
                      available in store
                    </div>
                  )}
                  {page === "Buyer lookup" && user?.role === "admin" && (
                    <div className="panel">
                      <h3>Phone buyer lookup</h3>
                      <p>
                        Search sold-phone records by IMEI, buyer name, contact
                        number, phone model, or invoice. Select a result to view
                        the buyer profile, purchase history, payments, and
                        installment schedule.
                      </p>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Phone / IMEI</th>
                              <th>Buyer / Contact</th>
                              <th>Sale</th>
                              <th>Collected</th>
                              <th>Balance</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {buyerSales.map((sale) => (
                                <tr key={sale._id}>
                                  <td>
                                    <b>
                                      {sale.phone.brand} {sale.phone.name}
                                    </b>
                                    {(sale.phone.imeis || []).map((imei) => (
                                      <small key={imei}>IMEI: {imei}</small>
                                    ))}
                                  </td>
                                  <td>
                                    <b>{sale.customer.name}</b>
                                    <small>{sale.customer.phone}</small>
                                  </td>
                                  <td>
                                    {sale.invoice}
                                    <small>
                                      {sale.type} ·{" "}
                                      {new Date(
                                        sale.createdAt,
                                      ).toLocaleDateString()}
                                    </small>
                                  </td>
                                  <td>{cash(sale.paid)}</td>
                                  <td>{cash(sale.balance)}</td>
                                  <td>
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        setModal({
                                          type: "detail",
                                          sale,
                                        })
                                      }
                                    >
                                      View payments & schedule →
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {!buyerSales.length && (
                          <Empty text="No matching buyer or phone found." />
                        )}
                      </div>
                    </div>
                  )}
                  {page === "Inventory" && (
                    <div className="panel table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Phone</th>
                            <th>IMEI</th>
                            <th>Price</th>
                            {user?.role === "admin" && <th>Cost</th>}
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.phones
                            .filter(match)
                            .filter(
                              (p) => filter === "all" || p.status === filter,
                            )
                            .map((p) => (
                              <tr key={p._id}>
                                <td>
                                  <b>
                                    {p.brand} {p.name}
                                  </b>
                                  <small>
                                    {p.storage} · {p.color} · {p.condition}
                                  </small>
                                </td>
                                <td>
                                  {p.imeis.map((i) => (
                                    <small key={i}>{i}</small>
                                  ))}
                                </td>
                                <td>{cash(p.price)}</td>
                                {user?.role === "admin" && (
                                  <td>{cash(p.cost)}</td>
                                )}
                                <td>
                                  <span className={"badge " + p.status}>
                                    {p.status}
                                  </span>
                                </td>
                                <td>
                                  {p.status === "sold" ? (
                                    <button
                                      className="text-button"
                                      onClick={() => {
                                        const s = data.sales.find(
                                          (s) => String(s.phone._id) === p._id,
                                        );
                                        if (s)
                                          setModal({ type: "detail", sale: s });
                                      }}
                                    >
                                      View sale
                                    </button>
                                  ) : (
                                    user?.role === "admin" && (
                                      <>
                                        <button
                                          className="text-button"
                                          onClick={() =>
                                            setModal({
                                              type: "phone",
                                              id: p._id,
                                              value: {
                                                ...p,
                                                cost: p.cost / 100,
                                                price: p.price / 100,
                                                imei1: p.imeis[0],
                                                imei2: p.imeis[1] || "",
                                              },
                                            })
                                          }
                                        >
                                          Edit
                                        </button>
                                        <select
                                          aria-label="Unit status"
                                          value={p.status}
                                          onChange={(e) =>
                                            run(() =>
                                              save(
                                                "/phones/" + p._id + "/status",
                                                { status: e.target.value },
                                                "PATCH",
                                              ),
                                            )
                                          }
                                        >
                                          {[
                                            "available",
                                            "damaged",
                                            "archived",
                                          ].map((s) => (
                                            <option key={s}>{s}</option>
                                          ))}
                                        </select>
                                      </>
                                    )
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!data.phones.length && (
                        <Empty text="Add your first phone with its unique IMEI." />
                      )}
                    </div>
                  )}
                  {page === "Customers" && (
                    <div className="panel table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Contact</th>
                            <th>Purchases</th>
                            <th>Outstanding</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.customers.filter(match).map((c) => (
                            <tr key={c._id}>
                              <td>
                                <b>{c.name}</b>
                                <small>{c.address}</small>
                              </td>
                              <td>{c.phone}</td>
                              <td>
                                {
                                  data.sales.filter(
                                    (s) => s.customer._id === c._id,
                                  ).length
                                }
                              </td>
                              <td>
                                {cash(
                                  data.sales
                                    .filter((s) => s.customer._id === c._id)
                                    .reduce((n, s) => n + s.balance, 0),
                                )}
                              </td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setModal({
                                      type: "customer",
                                      id: c._id,
                                      value: c,
                                    })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setPage("Sales");
                                    setTimeout(() => setSearch(c.phone), 0);
                                  }}
                                >
                                  History
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {["Sales", "Installments"].includes(page) && (
                    <div className="panel">
                      <div className="section-title">
                        <h3>
                          {page === "Sales"
                            ? "Sales register"
                            : "Repayment agreements"}
                        </h3>
                        <button
                          className="light"
                          onClick={() =>
                            exportCSV(
                              data.sales.map((s) => ({
                                invoice: s.invoice,
                                customer: s.customer.name,
                                phone: s.phone.name,
                                type: s.type,
                                total:
                                  (s.type === "cash"
                                    ? s.price
                                    : s.quote.total) / 100,
                                collected: s.paid / 100,
                                balance: s.balance / 100,
                                status: s.status,
                              })),
                              "sales",
                            )
                          }
                        >
                          <Download size={16} /> Export CSV
                        </button>
                      </div>
                      <SalesTable
                        rows={data.sales
                          .filter(match)
                          .filter(
                            (s) => page === "Sales" || s.type === "installment",
                          )
                          .filter(
                            (s) =>
                              filter === "all" ||
                              (filter === "completed"
                                ? s.balance === 0
                                : filter === "outstanding"
                                  ? s.balance > 0
                                  : s.status !== "returned" &&
                                    s.schedule.some(
                                      (r) => r.due < today() && r.remaining > 0,
                                    )),
                          )}
                        onOpen={(s) => setModal({ type: "detail", sale: s })}
                        onRemoveBuyer={
                          page === "Sales" && user?.role === "admin"
                            ? (sale) =>
                                run(async () => {
                                  if (
                                    !window.confirm(
                                      `Remove personal details for ${sale.customer.name}? This clears the buyer's name, CNIC, phone and address from customer records, linked invoices and purchase requests. Sales, balances and payment history will remain.`,
                                    )
                                  )
                                    return;
                                  const result = await api(
                                    "/customers/" + sale.customer._id,
                                    "DELETE",
                                  );
                                  await load();
                                  notify(result.message);
                                })
                            : undefined
                        }
                      />
                    </div>
                  )}
                  {page === "Payments" && (
                    <div className="panel table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Receipt / Date</th>
                            <th>Invoice</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.payments.filter(match).map((p) => (
                            <tr key={p._id}>
                              <td>
                                <small>{p._id}</small>
                                {new Date(p.createdAt).toLocaleString()}
                              </td>
                              <td>
                                {
                                  data.sales.find((s) => s._id === p.sale)
                                    ?.invoice
                                }
                              </td>
                              <td>{cash(p.amount)}</td>
                              <td>{p.method}</td>
                              <td>
                                {p.reversed ? "Reversed" : "Posted"}
                                <small>{p.reason || p.note}</small>
                              </td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setModal({ type: "receipt", payment: p })
                                  }
                                >
                                  Receipt
                                </button>
                                {!p.reversed &&
                                  user?.role === "admin" &&
                                  p.kind !== "initial" && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        setModal({
                                          type: "reverse",
                                          payment: p,
                                        })
                                      }
                                    >
                                      Reverse
                                    </button>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {page === "Plans" && (
                    <form
                      className="panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        run(() =>
                          save(
                            "/plans",
                            data.plans.map((p) => ({
                              months: p.months,
                              rate: Number(f.get("rate" + p.months)),
                              enabled: f.get("on" + p.months) === "on",
                            })),
                            "PUT",
                          ),
                        );
                      }}
                    >
                      <h3>Installment terms</h3>
                      <p>
                        Set the total markup rate for each plan. The minimum
                        down payment is PKR 5,000 for every plan. Changes apply
                        to future sales only.
                      </p>
                      <div className="grid three">
                        {data.plans.map((p) => (
                          <div className="plan" key={p.months}>
                            <h2>{p.months} months</h2>
                            <Field
                              label="Total plan markup (%)"
                              name={"rate" + p.months}
                              type="number"
                              min="0"
                              max="1000"
                              step="0.01"
                              defaultValue={p.rate}
                              required
                            />
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                name={"on" + p.months}
                                defaultChecked={p.enabled}
                              />{" "}
                              Plan enabled
                            </label>
                          </div>
                        ))}
                      </div>
                      <button disabled={busy} className="gold">
                        Save plan settings
                      </button>
                    </form>
                  )}
                  {page === "Shop settings" && (
                    <form
                      className="panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const b = Object.fromEntries(
                          new FormData(e.currentTarget),
                        );
                        run(() => save("/shop", b, "PUT"));
                      }}
                    >
                      <h3>Business details</h3>
                      <Field
                        label="Shop name"
                        name="name"
                        defaultValue={shop.name}
                        required
                      />
                      <Field
                        label="Address"
                        name="address"
                        defaultValue={shop.address}
                      />
                      <Field
                        label="Contact phone"
                        name="phone"
                        defaultValue={shop.phone}
                      />
                      <button className="gold" disabled={busy}>
                        Save shop details
                      </button>
                    </form>
                  )}
                  {page === "Reports" && (
                    <div className="panel">
                      <h3>Financial summary</h3>
                      <p>
                        Gross posted collections: <b>{cash(collected)}</b>
                      </p>
                      <p>
                        Refunds recorded: <b>{cash(refunded)}</b>
                      </p>
                      <p>
                        Net collected: <b>{cash(collected - refunded)}</b>
                      </p>
                      <p>
                        Outstanding receivables: <b>{cash(outstanding)}</b>
                      </p>
                      <p>
                        Overdue receivables: <b>{cash(overdue)}</b>
                      </p>
                      <p>
                        Cash sale value (excluding returns):{" "}
                        <b>
                          {cash(
                            data.sales
                              .filter(
                                (s) =>
                                  s.type === "cash" && s.status !== "returned",
                              )
                              .reduce((n, s) => n + s.price, 0),
                          )}
                        </b>
                      </p>
                      <p>
                        Installment contract value (excluding returns):{" "}
                        <b>
                          {cash(
                            data.sales
                              .filter(
                                (s) =>
                                  s.type === "installment" &&
                                  s.status !== "returned",
                              )
                              .reduce((n, s) => n + s.quote.total, 0),
                          )}
                        </b>
                      </p>
                      <small>
                        Contract value is separate from cash collected. Profit
                        accounting is not included.
                      </small>
                      <div className="actions">
                        <button
                          className="light"
                          onClick={() =>
                            exportCSV(
                              data.payments.map((p) => ({
                                receipt: p._id,
                                date: p.createdAt,
                                amount: p.amount / 100,
                                method: p.method,
                                reversed: p.reversed,
                              })),
                              "payments",
                            )
                          }
                        >
                          Export payments
                        </button>
                        <button
                          className="light"
                          onClick={() =>
                            exportCSV(
                              data.sales.flatMap((s) =>
                                (s.refunds || []).map((r) => ({
                                  invoice: s.invoice,
                                  amount: r.amount / 100,
                                  date: r.createdAt,
                                  method: r.method,
                                  note: r.note,
                                })),
                              ),
                              "refunds",
                            )
                          }
                        >
                          Export refunds
                        </button>
                      </div>
                    </div>
                  )}
                  {page === "Staff" && (
                    <div className="panel table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extra.filter(match).map((u) => (
                            <tr key={u._id}>
                              <td>{u.name}</td>
                              <td>{u.email}</td>
                              <td>{u.role}</td>
                              <td>
                                <button
                                  className="light"
                                  onClick={() =>
                                    run(async () => {
                                      await api("/users/" + u._id, "PATCH", {
                                        active: !u.active,
                                      });
                                      setExtra(await api("/users"));
                                    })
                                  }
                                >
                                  {u.active
                                    ? "Active — disable"
                                    : "Disabled — enable"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {page === "Audit" && (
                    <div className="panel table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Actor</th>
                            <th>Action</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extra.filter(match).map((a) => (
                            <tr key={a._id}>
                              <td>{new Date(a.createdAt).toLocaleString()}</td>
                              <td>{a.actor}</td>
                              <td>{a.action}</td>
                              <td>
                                {a.details}
                                <small>{a.target}</small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {page === "Inquiries" && (
                    <div className="grid">
                      {extra.filter(match).map((i) => (
                        <article className="panel" key={i._id}>
                          {i.type === "purchase" ? (
                            <>
                              <p className="eyebrow">
                                Store purchase request · {i.status}
                              </p>
                              <h3>
                                {i.phone?.brand} {i.phone?.name}
                              </h3>
                              <p>
                                {i.phone?.storage} · {i.phone?.color} ·{" "}
                                {cash(i.phone?.price)}
                              </p>
                              <h4>Buyer details</h4>
                              <p>
                                <b>{i.name}</b>
                                <br />
                                Father’s name: {i.fatherName}
                                <br />
                                CNIC: {i.cnic || "Not provided"}
                                <br />
                                Contact: {i.phoneNumber}
                                <br />
                                Home address: {i.address}
                              </p>
                              <small>
                                Request received{" "}
                                {new Date(i.createdAt).toLocaleString()}. Contact
                                the buyer to confirm stock and complete payment
                                in person; the phone is not automatically sold
                                or reserved.
                              </small>
                            </>
                          ) : (
                            <>
                              <h3>{i.name}</h3>
                              <b>{i.phone}</b>
                              <p>{i.message}</p>
                              <small>
                                {new Date(i.createdAt).toLocaleString()}
                              </small>
                            </>
                          )}
                        </article>
                      ))}
                      {!extra.length && (
                        <Empty text="No inquiries or purchase requests yet." />
                      )}
                    </div>
                  )}
                  {page === "Clear data" && user?.role === "admin" && (
                    <form
                      className="panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const confirmation = new FormData(
                          e.currentTarget,
                        ).get("confirmation");
                        run(async () => {
                          const result = await api(
                            "/admin/clear-audit-and-inquiries",
                            "DELETE",
                            { confirmation },
                          );
                          setExtra([]);
                          notify(result.message);
                        });
                      }}
                    >
                      <h2>Clear non-financial data</h2>
                      <p>
                        This permanently clears audit history and all customer
                        inquiries and storefront purchase requests.
                      </p>
                      <p>
                        <b>This will keep:</b> all phone inventory, sold-phone
                        records, photos, customers, sales, invoices, installment
                        schedules, payments, refunds, staff accounts, and shop
                        settings.
                      </p>
                      <p>
                        A new audit entry recording this clear action will be
                        retained.
                      </p>
                      <Field
                        label={'Type "CLEAR LOGS AND REQUESTS" to confirm'}
                        name="confirmation"
                        autoComplete="off"
                        required
                        pattern="CLEAR LOGS AND REQUESTS"
                      />
                      <button className="danger" disabled={busy}>
                        <Trash2 size={16} /> Clear audit logs and requests
                      </button>
                    </form>
                  )}
                  {page === "Clear data" && user?.role === "admin" && (
                    <form
                      className="panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const confirmation = new FormData(
                          e.currentTarget,
                        ).get("confirmation");
                        if (
                          !window.confirm(
                            "Permanently remove all business records and uploaded phone photos? Only your current admin account and shop settings will remain.",
                          )
                        )
                          return;
                        run(async () => {
                          const result = await api(
                            "/admin/reset-business-data",
                            "DELETE",
                            { confirmation },
                          );
                          await load();
                          setExtra([]);
                          notify(result.message);
                        });
                      }}
                    >
                      <h2>Full business reset</h2>
                      <p>
                        Permanently remove all phones and their uploaded
                        photos, customers, sales, invoices, installment
                        schedules, payments, refunds, inquiries, audit history,
                        plan settings, and staff accounts.
                      </p>
                      <p>
                        <b>This will keep:</b> your currently signed-in admin
                        account and shop name, address, and contact details.
                        Financial and customer records cannot be recovered
                        except from a backup.
                      </p>
                      <p>
                        A new audit entry recording this reset will be retained.
                      </p>
                      <Field
                        label={'Type "DELETE ALL BUSINESS DATA" to confirm'}
                        name="confirmation"
                        autoComplete="off"
                        required
                        pattern="DELETE ALL BUSINESS DATA"
                      />
                      <button className="danger" disabled={busy}>
                        <Trash2 size={16} /> Remove all business data
                      </button>
                    </form>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={modal.type}
            className={
              "modal " +
              (["detail", "phone", "sale"].includes(modal.type) ? "wide" : "")
            }
          >
            <button
              className="close no-print"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              ×
            </button>
            {modal.type === "product" && (
              <div>
                <h2>
                  {modal.phone.brand} {modal.phone.name}
                </h2>
                <p>
                  {modal.phone.storage} · {modal.phone.color} ·{" "}
                  {modal.phone.condition}
                </p>
                <div className="gallery">
                  {modal.phone.photos?.length ? (
                    modal.phone.photos.map((src, i) => (
                      <img
                        key={src}
                        src={src}
                        alt={modal.phone.name + " photo " + (i + 1)}
                      />
                    ))
                  ) : (
                    <Picture p={modal.phone} />
                  )}
                </div>
                <p>{modal.phone.description}</p>
                <h3>{cash(modal.phone.price)}</h3>
                <button
                  className="gold"
                  onClick={() => {
                    setSelected(modal.phone);
                    setQuote(null);
                    setModal(null);
                    document
                      .getElementById("calculator")
                      .scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Calculate installments
                </button>
                <button
                  className="light"
                  onClick={() =>
                    setModal({
                      type: "purchase-request",
                      phone: modal.phone,
                    })
                  }
                >
                  Request to buy in store
                </button>
              </div>
            )}
            {modal.type === "purchase-request" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const values = Object.fromEntries(new FormData(form));
                  run(async () => {
                    await api("/purchase-requests", "POST", {
                      ...values,
                      phone: modal.phone._id,
                    });
                    setModal(null);
                    notify(
                      "Request sent. The shop will contact you to confirm the phone and complete the purchase in person.",
                    );
                  });
                }}
              >
                <h2>Request to buy in store</h2>
                <p>
                  {modal.phone.brand} {modal.phone.name} · {modal.phone.storage}{" "}
                  · {cash(modal.phone.price)}
                </p>
                <p>
                  This sends a request to the shop; it does not take payment or
                  reserve the phone. The shop will contact you to confirm and
                  complete the purchase in person.
                </p>
                <div className="grid two">
                  <Field
                    label="Buyer full name"
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                  <Field
                    label="Father's full name"
                    name="fatherName"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                  <Field
                    label="CNIC (13 digits, optional)"
                    name="cnic"
                    placeholder="12345-1234567-1"
                    inputMode="numeric"
                    pattern="[0-9]{5}-?[0-9]{7}-?[0-9]"
                    title="Enter 13 CNIC digits, with or without dashes"
                  />
                  <Field
                    label="Contact phone number"
                    name="contact"
                    type="tel"
                    autoComplete="tel"
                    required
                    minLength={7}
                    maxLength={30}
                  />
                </div>
                <label>
                  Home address
                  <textarea
                    name="address"
                    autoComplete="street-address"
                    minLength={5}
                    maxLength={500}
                    required
                  />
                </label>
                <label className="checkbox">
                  <input type="checkbox" required /> I agree that the details I
                  provide will be stored on this shop computer and visible to
                  the shop admin for this request.
                </label>
                <button className="gold" disabled={busy}>
                  Send purchase request
                </button>
              </form>
            )}
            {modal.type === "phone" && (
              <PhoneForm
                modal={modal}
                busy={busy}
                onSubmit={(b) =>
                  run(() =>
                    save(
                      "/phones" + (modal.id ? "/" + modal.id : ""),
                      b,
                      modal.id ? "PUT" : "POST",
                    ),
                  )
                }
              />
            )}
            {modal.type === "customer" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() =>
                    save(
                      "/customers" + (modal.id ? "/" + modal.id : ""),
                      Object.fromEntries(new FormData(e.currentTarget)),
                      modal.id ? "PUT" : "POST",
                    ),
                  );
                }}
              >
                <h2>{modal.id ? "Edit" : "Add"} customer</h2>
                <Field
                  label="Full name"
                  name="name"
                  defaultValue={modal.value.name}
                  required
                  minLength={2}
                />
                <Field
                  label="Phone number"
                  name="phone"
                  defaultValue={modal.value.phone}
                  required
                  minLength={7}
                />
                <Field
                  label="Address"
                  name="address"
                  defaultValue={modal.value.address || ""}
                />
                <label>
                  Notes
                  <textarea
                    name="notes"
                    defaultValue={modal.value.notes || ""}
                  />
                </label>
                <button className="gold" disabled={busy}>
                  Save customer
                </button>
              </form>
            )}
            {modal.type === "sale" && (
              <SaleForm
                data={data}
                busy={busy}
                submit={(b) => run(() => save("/sales", b))}
              />
            )}
            {modal.type === "staff" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const b = Object.fromEntries(new FormData(e.currentTarget));
                  run(async () => {
                    await save("/users", b);
                    setExtra(await api("/users"));
                  });
                }}
              >
                <h2>Create staff account</h2>
                <Field label="Name" name="name" required minLength={2} />
                <Field label="Email" name="email" type="email" required />
                <Field
                  label="Password (12+ characters)"
                  name="password"
                  type="password"
                  required
                  minLength={12}
                />
                <Select name="role" label="Role">
                  <option value="staff">Sales staff</option>
                  <option value="admin">Admin</option>
                </Select>
                <button className="gold" disabled={busy}>
                  Create account
                </button>
              </form>
            )}
            {modal.type === "detail" && (
              <SaleDetail
                sale={activeSale}
                buyer={activeBuyer}
                buyerHistory={buyerHistory}
                onOpenSale={(sale) => setModal({ type: "detail", sale })}
                busy={busy}
                shop={shop}
                refund={(b) =>
                  run(() => save("/sales/" + modal.sale._id + "/refunds", b))
                }
                admin={user?.role === "admin"}
                pay={(b) =>
                  run(() => save("/sales/" + modal.sale._id + "/payments", b))
                }
                onReturn={() => setModal({ type: "return", sale: modal.sale })}
              />
            )}
            {modal.type === "receipt" && (
              <div className="print-document">
                <p className="eyebrow">{shop.name}</p>
                <p>
                  {shop.address} {shop.phone}
                </p>
                <h2>Payment receipt</h2>
                <p>Receipt: {modal.payment._id}</p>
                <p>
                  Date: {new Date(modal.payment.createdAt).toLocaleString()}
                </p>
                <p>
                  Invoice:{" "}
                  {
                    data.sales.find((s) => s._id === modal.payment.sale)
                      ?.invoice
                  }
                </p>
                <p>
                  Customer:{" "}
                  {
                    data.sales.find((s) => s._id === modal.payment.sale)
                      ?.customer.name
                  }
                </p>
                <h2>{cash(modal.payment.amount)}</h2>
                <p>Method: {modal.payment.method}</p>
                <p>
                  {modal.payment.reversed
                    ? "REVERSED: " + modal.payment.reason
                    : modal.payment.note}
                </p>
                <button
                  className="gold no-print"
                  onClick={() => window.print()}
                >
                  <Printer size={16} /> Print receipt
                </button>
              </div>
            )}
            {["reverse", "return"].includes(modal.type) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = new FormData(e.currentTarget).get("reason");
                  run(() =>
                    save(
                      modal.type === "reverse"
                        ? "/payments/" + modal.payment._id + "/reverse"
                        : "/sales/" + modal.sale._id + "/return",
                      { reason },
                    ),
                  );
                }}
              >
                <h2>
                  {modal.type === "reverse"
                    ? "Reverse payment"
                    : "Return phone"}
                </h2>
                <p>
                  {modal.type === "return"
                    ? "The phone will be held for inspection. After confirming this return, record money refunded from its invoice screen."
                    : "The original payment remains in history and will no longer reduce the balance."}
                </p>
                <label>
                  Reason
                  <textarea name="reason" required minLength={5} />
                </label>
                <button className="gold" disabled={busy}>
                  Confirm {modal.type}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <Package />
      <p>{text}</p>
    </div>
  );
}
function SalesTable({ rows, onOpen, onRemoveBuyer }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice / Phone</th>
            <th>Customer</th>
            <th>Type</th>
            <th>Collected</th>
            <th>Balance</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s._id}>
              <td>
                <b>{s.invoice}</b>
                <small>
                  {s.phone.brand} {s.phone.name}
                </small>
              </td>
              <td>
                {s.customer.name}
                <small>{s.customer.phone}</small>
              </td>
              <td>{s.type}</td>
              <td>{cash(s.paid)}</td>
              <td>{cash(s.balance)}</td>
              <td>
                <span className="badge">
                  {s.status === "returned"
                    ? "Returned"
                    : s.balance === 0
                      ? "Completed"
                      : s.schedule.some(
                            (r) => r.due < today() && r.remaining > 0,
                          )
                        ? "Overdue"
                        : "Active"}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onOpen(s)}
                >
                  Open →
                </button>
                {onRemoveBuyer && s.customer.name !== "Deleted customer" && (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => onRemoveBuyer(s)}
                  >
                    Remove buyer data
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty text="No matching sales yet." />}
    </div>
  );
}
function PhoneForm({ modal, busy, onSubmit }) {
  const [photos, setPhotos] = useState(modal.value.photos || []),
    [uploading, setUploading] = useState(false),
    [imei, setImei] = useState(modal.value.imeis?.[0] || "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const { imei: enteredImei, ...b } = Object.fromEntries(
          new FormData(e.currentTarget),
        );
        onSubmit({
          ...b,
          photos,
          imeis: [
            enteredImei ||
              (modal.id ? modal.value.imeis?.[0] : undefined),
            ...(modal.id ? modal.value.imeis?.slice(1) || [] : []),
          ].filter(Boolean),
        });
      }}
    >
      <h2>{modal.id ? "Edit phone" : "Add phone to inventory"}</h2>
      <p>
        Add one phone at a time. You can enter its IMEI now or when recording
        the sale.
      </p>
      <div className="grid two">
        {[
          ["Brand", "brand"],
          ["Model", "name"],
          ["Storage", "storage"],
          ["Color", "color"],
          ["Purchase cost (PKR)", "cost"],
          ["Cash selling price (PKR)", "price"],
          ["Supplier (optional)", "supplier"],
          ["Purchase date (optional)", "purchaseDate"],
        ].map(([label, k]) => (
          <Field
            key={k}
            label={label}
            name={k}
            defaultValue={modal.value[k]}
            required={!["supplier", "purchaseDate"].includes(k)}
            type={
              k === "purchaseDate"
                ? "date"
                : ["cost", "price"].includes(k)
                  ? "number"
                  : "text"
            }
            min={["cost", "price"].includes(k) ? 0 : undefined}
            step={["cost", "price"].includes(k) ? "0.01" : undefined}
          />
        ))}
        <Select
          name="condition"
          label="Condition"
          defaultValue={modal.value.condition}
        >
          {["new", "used", "refurbished"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <Field
        label="IMEI (optional)"
        name="imei"
        value={imei}
        minLength={15}
        maxLength={15}
        inputMode="numeric"
        pattern="[0-9]{15}"
        title="Enter 15 digits, or leave blank and add it when recording the sale"
        onChange={(e) => setImei(e.target.value)}
      />
      <label>
        Description
        <textarea name="description" defaultValue={modal.value.description} />
      </label>
      <label className="upload">
        <Upload size={18} />{" "}
        {uploading ? "Uploading…" : "Upload photo (JPEG, PNG, WebP; max 5 MB)"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || photos.length >= 8}
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            setUploading(true);
            try {
              const b = new FormData();
              b.append("image", f);
              const r = await api("/upload", "POST", b);
              setPhotos((p) => [...p, r.url]);
            } catch (e) {
              onError(e.message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      <div className="photo-strip">
        {photos.map((url, i) => (
          <div key={url}>
            <img src={url} alt={"Photo " + (i + 1)} />
            <button
              type="button"
              onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button className="gold" disabled={busy || uploading}>
        Save phone
      </button>
    </form>
  );
}
function SaleForm({ data, busy, submit }) {
  const [type, setType] = useState("cash"),
    [phone, setPhone] = useState(""),
    [imei, setImei] = useState(""),
    [price, setPrice] = useState(""),
    [down, setDown] = useState(""),
    [months, setMonths] = useState(3);
  const plan = data.plans.find((p) => p.months === Number(months)),
    financed = Number(price) - Number(down),
    total = financed * (1 + (plan?.rate || 0) / 100);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        submit({
          ...values,
          buyer: {
            name: values.buyerName,
            fatherName: values.buyerFatherName,
            cnic: values.buyerCnic,
            phone: values.buyerPhone,
            address: values.buyerAddress,
            notes: "",
          },
          imei: values.imei,
          type,
          months: Number(months),
          down: type === "cash" ? Number(price) : Number(down),
        });
      }}
    >
      <h2>Record a sale</h2>
      <div className="grid two">
        <Select
          name="phone"
          label="Available phone"
          required
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            const selectedPhone = data.phones.find(
              (p) => p._id === e.target.value,
            );
            setPrice(selectedPhone?.price / 100 || "");
            setImei(selectedPhone?.imeis?.[0] || "");
          }}
        >
          <option value="">Choose phone</option>
          {data.phones
            .filter((p) => p.status === "available")
            .map((p) => (
              <option key={p._id} value={p._id}>
                {p.brand} {p.name} · {p.imeis?.[0] || "IMEI needed"}
              </option>
            ))}
        </Select>
        <Field
          label="Phone IMEI (15 digits)"
          name="imei"
          value={imei}
          onChange={(e) => setImei(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]{15}"
          minLength={15}
          maxLength={15}
          required
        />
        <Field
          label="Buyer full name"
          name="buyerName"
          autoComplete="name"
          required
          minLength={2}
          maxLength={100}
        />
        <Field
          label="Father's full name"
          name="buyerFatherName"
          required
          minLength={2}
          maxLength={100}
        />
        <Field
          label="CNIC (13 digits, optional)"
          name="buyerCnic"
          placeholder="12345-1234567-1"
          inputMode="numeric"
          pattern="[0-9]{5}-?[0-9]{7}-?[0-9]"
          title="Enter 13 CNIC digits, with or without dashes"
        />
        <Field
          label="Contact phone number"
          name="buyerPhone"
          type="tel"
          autoComplete="tel"
          required
          minLength={7}
          maxLength={30}
        />
        <label className="sale-customer-form">
          Home address
          <textarea
            name="buyerAddress"
            autoComplete="street-address"
            minLength={5}
            maxLength={500}
            required
          />
        </label>
        <Select
          label="Sale type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="cash">Cash / full payment</option>
          <option value="installment">Installment</option>
        </Select>
        <Select name="method" label="Payment method">
          {["cash", "bank", "easypaisa"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
        <Field
          label="Agreed cash price (PKR)"
          name="price"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        {type === "installment" && (
          <>
            <Field
              label="Down payment (PKR)"
              type="number"
              min={MIN_DOWN_PAYMENT}
              step="0.01"
              required
              value={down}
              onChange={(e) => setDown(e.target.value)}
            />
            <Select
              label="Duration"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            >
              {data.plans
                .filter((p) => p.enabled)
                .map((p) => (
                  <option key={p.months} value={p.months}>
                    {p.months} months
                  </option>
                ))}
            </Select>
            <Field
              label="First due date"
              type="date"
              name="first"
              required
              defaultValue={today()}
            />
          </>
        )}
      </div>
      {type === "cash" && <input type="hidden" name="first" value="" />}
      {type === "installment" && price && (
        <div className="quote">
          <p>
            Estimated installment:{" "}
            {cash(Math.round((total * 100) / Number(months)))}
          </p>
          <small>
            Minimum down payment is PKR 5,000 and must be less than the agreed
            price. Final terms are calculated when saved.
          </small>
        </div>
      )}
      <p className="hint">
        Cash sales record the full amount as collected. Confirm receipt before
        saving.
      </p>
      <button disabled={busy || !phone} className="gold">
        Confirm sale & update stock
      </button>
    </form>
  );
}
function SaleDetail({
  sale: s,
  buyer,
  buyerHistory,
  onOpenSale,
  busy,
  pay,
  admin,
  onReturn,
  refund,
  shop,
}) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <div className="print-document">
      <p className="eyebrow">{shop.name}</p>
      <p>
        {shop.address} {shop.phone}
      </p>
      <h2>Invoice {s.invoice}</h2>
      {admin && buyer && (
        <section className="quote">
          <h3>Buyer profile</h3>
          <p>
            <b>{buyer.name}</b>
            <br />
            Contact: {buyer.phone || "Not provided"}
            <br />
            Address: {buyer.address || "Not provided"}
          </p>
          {buyer.notes && <p>Notes: {buyer.notes}</p>}
          <h4>All purchases ({buyerHistory.length})</h4>
          {buyerHistory.map((sale) => (
            <p key={sale._id}>
              {sale.invoice} · {sale.phone.brand} {sale.phone.name} ·{" "}
              {new Date(sale.createdAt).toLocaleDateString()} · Balance:{" "}
              {cash(sale.balance)}{" "}
              {sale._id !== s._id && (
                <button
                  type="button"
                  className="text-button no-print"
                  onClick={() => onOpenSale(sale)}
                >
                  Open
                </button>
              )}
            </p>
          ))}
        </section>
      )}
      <div className="grid two">
        <div>
          <b>{s.customer.name}</b>
          <p>
            {s.customer.phone}
            <br />
            {s.customer.address}
          </p>
        </div>
        <div>
          <b>
            {s.phone.brand} {s.phone.name}
          </b>
          <p>
            {s.phone.storage} · {s.phone.color}
            <br />
            IMEI: {s.phone.imeis.join(" / ")}
          </p>
        </div>
      </div>
      <p>
        Date: {new Date(s.createdAt).toLocaleString()} · {s.type} · {s.status}
      </p>
      <div className="quote">
        <p>
          Base price: <b>{cash(s.price)}</b>
        </p>
        {s.quote && (
          <>
            <p>
              Down payment: {cash(s.down)} · Financed: {cash(s.quote.financed)}
            </p>
            <p>{s.quote.months} month installment plan</p>
          </>
        )}
        <p>
          Total payable: <b>{cash(s.quote?.total || s.price)}</b>
        </p>
        <p>Refunded: {cash(s.refunded)}</p>
        <p>
          Collected: {cash(s.paid)} · Outstanding: <b>{cash(s.balance)}</b>
        </p>
      </div>
      {s.schedule.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Due date</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {s.schedule.map((r) => (
              <tr key={r.number}>
                <td>{r.number}</td>
                <td>{r.due}</td>
                <td>{cash(r.amount)}</td>
                <td>{cash(r.paid)}</td>
                <td>
                  {cash(r.remaining)}{" "}
                  {r.remaining > 0 && r.due < today() ? "(overdue)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Posted payments</h3>
      {s.refunds?.map((r) => (
        <p key={r._id}>
          Refund: {cash(r.amount)} · {r.method} · {r.note}
        </p>
      ))}
      {s.payments.map((p) => (
        <p key={p._id}>
          {new Date(p.createdAt).toLocaleDateString()} · {cash(p.amount)} ·{" "}
          {p.method} · {p.note}
        </p>
      ))}
      <div className="actions no-print">
        <button className="light" onClick={() => window.print()}>
          <Printer size={16} /> Print invoice
        </button>
        {admin && s.status !== "returned" && (
          <button className="text-button danger" onClick={onReturn}>
            Return / inspect phone
          </button>
        )}
      </div>
      {admin && s.status === "returned" && s.paid > s.refunded && (
        <form
          className="payment-form no-print"
          onSubmit={(e) => {
            e.preventDefault();
            refund({
              ...Object.fromEntries(new FormData(e.currentTarget)),
              key,
            });
          }}
        >
          <h3>Record customer refund</h3>
          <p>
            Refundable balance: {cash(s.paid - s.refunded)}. Record only money
            actually returned to the customer.
          </p>
          <Field
            label="Amount (PKR)"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            max={(s.paid - s.refunded) / 100}
            required
          />
          <Select name="method" label="Refund method">
            {["cash", "bank", "easypaisa"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <Field
            name="note"
            label="Reason / reference"
            required
            minLength={5}
          />
          <button className="gold" disabled={busy}>
            Record refund
          </button>
        </form>
      )}
      {s.balance > 0 && s.status !== "returned" && (
        <form
          className="payment-form no-print"
          onSubmit={(e) => {
            e.preventDefault();
            pay({ ...Object.fromEntries(new FormData(e.currentTarget)), key });
          }}
        >
          <h3>Receive payment</h3>
          <div className="grid two">
            <Field
              label="Amount (PKR)"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              max={s.balance / 100}
              required
            />
            <Select name="method" label="Method">
              {["cash", "bank", "easypaisa"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </div>
          <Field
            name="note"
            label="Note / transfer reference"
            defaultValue=""
          />
          <button className="gold" disabled={busy}>
            Save payment
          </button>
          <small>Allocated to the oldest unpaid installment first.</small>
        </form>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
