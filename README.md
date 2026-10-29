# Ramyal Mobile Shop

A full-stack mobile-shop application with a navy, champagne-gold and cream storefront, an admin panel, and SQLite for local development or Neon PostgreSQL for hosted use. It manages phone stock and IMEIs, customers, cash and installment sales, payment schedules, receipts, refunds and plan settings.

## Requirements

- Node.js 22 or 24 and npm.
- VS Code is optional but recommended.
- Local development uses SQLite and needs no database server.
- Hosted deployments can use Neon PostgreSQL and Vercel Blob for product photos.

## Run it in VS Code

1. Extract the ZIP and open the **royal-mobile** folder in VS Code.
2. Open a terminal there and install packages:

   ```sh
   npm install
   ```

   On Windows, if PowerShell blocks `npm.ps1`, use the Command Prompt terminal or run `npm.cmd` instead of `npm`.

3. Copy `server/.env.example` to `server/.env`.

   Windows Command Prompt:

   ```bat
   copy server\.env.example server\.env
   ```

   Linux/macOS:

   ```sh
   cp server/.env.example server/.env
   ```

4. Open **server/.env**. `SQLITE_PATH=./data/royal_mobile.sqlite` is the local database file location. Relative paths are resolved from `server/`, even if a command is run from another folder. SQLite creates it automatically. Set a private JWT secret of at least 32 characters. Generate one in PowerShell with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

   Put the generated value after `JWT_SECRET=`. Keep `.env` private; it is excluded from Git.

5. Create the first admin:

   ```sh
   npm run create-admin
   ```

   Enter a name, email, and password of at least 12 characters. Password entry is visible in the terminal during this setup step, so use a private terminal.

6. Start the app:

   ```sh
   npm run dev
   ```

7. Open **http://localhost:5173** and click **Admin Login**.

The API runs on port 4000. The SQLite database will be created at `server/data/royal_mobile.sqlite`. The app stores real data locally; it does not provide fake demo records by default.

## Local SQLite storage and backup

SQLite is an embedded file database. Its use has no service or hosting fee. The backend uses `better-sqlite3` and wraps stock, sales, payment, and refund changes in SQLite transactions. The database file is created automatically; there is no separate database server to run.

To back up the shop, stop the app with **Ctrl+C** and copy `server/data/royal_mobile.sqlite` to a safe location. Also back up the `server/uploads` folder, which contains phone photos. Do not put database or customer backups in a public folder or Git repository. Restore by stopping the app and replacing the database file and uploads folder with the backup.

The database is on this computer only. Other computers will not automatically see its records. Do not put the SQLite file on a public file share for multi-device access.

## Deploy with Vercel and Neon

The Vercel deployment uses Neon PostgreSQL for shared shop records and Vercel Blob for persistent phone photos. The app still uses SQLite locally when `DATABASE_URL` is not set.

1. Create a Neon project and copy its **pooled** PostgreSQL connection string. Keep it private.
2. Back up the SQLite database and `server/uploads` folder.
3. In `server/.env`, set `DATABASE_URL` to the Neon connection string and `BLOB_READ_WRITE_TOKEN` to a Vercel Blob read/write token. Set a private `JWT_SECRET` of at least 32 characters. Do not commit `.env` or paste its values into chat.
4. Before deploying, migrate existing local records and any referenced photos into a **new, empty** Neon database:

   ```sh
   npm run migrate:neon
   ```

   The script does not modify the SQLite file. It stops if Neon already contains records. It requires the Blob token when the SQLite records reference local `/uploads/` photos.

5. If the SQLite database has no admin account, create one using `npm run create-admin` while `DATABASE_URL` points to Neon. If you migrated an existing database, its admin account is migrated too.
6. Push the project to a private GitHub repository. In Vercel, import the repository and set the project root to **royal-mobile**. Add `DATABASE_URL`, `JWT_SECRET`, and `BLOB_READ_WRITE_TOKEN` as Vercel environment variables; never put their values in the repository.
7. Deploy. Vercel serves the frontend and API; Neon is the database and Vercel Blob stores uploaded images. The API creates its PostgreSQL tables automatically on first connection.

Use Neon’s pooled connection string for Vercel serverless functions. Free plans have limits and can change; confirm the providers’ current terms and keep independent backups. Do not run the migration a second time against a database that already has live records.

### Reset a lost admin password

From the project root, run `npm run reset-admin-password`. The command updates the password for an existing admin account; it does not create another account. To reset the hosted account, first set `DATABASE_URL` in `server/.env` to the same Neon database used by Vercel. Confirm that the command reports PostgreSQL before continuing. Without `DATABASE_URL`, it will only change the local SQLite account. Use a private terminal because password input is visible.

## Features

- Public catalog with search, product photos and installment quote calculator.
- Storefront in-store purchase requests; buyers can submit contact and identity details for admin follow-up, with no online payment or automatic reservation.
- Purchase-request CNIC is optional. Any provided CNIC, father name and home address are only available in the authenticated admin inquiry page.
- Inquiry form and private inquiry list.
- Admin and sales-staff accounts with backend role checks.
- Admin-only buyer lookup by phone IMEI, customer name/contact, phone model or invoice, with buyer profiles, purchase history and installment details.
- Admins can remove customer personal data from customer records, linked sale snapshots and purchase requests while retaining invoice, payment and balance records.
- Admin-only data clearing removes audit history and inquiries/purchase requests while retaining inventory, customers and all financial records; the clear operation itself is logged for accountability.
- Admins can perform a separate full business reset that removes business records, staff accounts and uploaded phone photos while preserving the current admin account and shop settings; the reset itself is logged.
- Add one phone at a time to inventory, with an optional IMEI. Enter its unique 15-digit IMEI during inventory entry or when recording the sale; each phone is stored as its own unit with supplier, cost, status and selling price.
- Customer management and purchase lookup.
- Cash and installment sales.
- Admin-configurable 3, 6, 9 and 12-month installment plans with flat markup rates and a PKR 5,000 minimum down payment.
- Historical agreement snapshots; future plan edits do not alter existing agreements.
- Partial and early payments, oldest-first installment allocation and overpayment rejection.
- Idempotent payment/refund requests, admin payment reversals, phone returns and refund tracking.
- Printable invoices and receipts, CSV exports, financial summaries and audit history.
- Local JPEG, PNG and WebP image uploads (5 MB per image).

## Installment formula

Money is stored as integer paisa; prices shown in the app are PKR.

```text
Financed balance = Agreed base price - Down payment
Markup = round(Financed balance * Admin-set plan rate / 100)
Installment balance = Financed balance + Markup
Regular installment = floor(Installment balance / Months)
Final installment = Installment balance - Regular installment * (Months - 1)
Total customer payment = Down payment + Installment balance
```

Default total plan rates are 6%, 12%, 18% and 24% for 3, 6, 9 and 12 months. Admins can change these rates; the rates and calculation formula are not shown in the customer-facing calculator. The down payment must be at least PKR 5,000 and less than the agreed base price. The app records payments and refunds, but it does not transfer money through bank or Easypaisa.

## Production build

```sh
npm run build
npm start
```

Then open **http://localhost:4000**. Local mode uses SQLite. For remote or multiple-device use, deploy with Neon and Vercel as described above; do not expose the local SQLite server to the internet as-is.

## Tests

```sh
npm test
npm run test:integration
npm run build
```

The integration suite creates a temporary SQLite database and removes it after the test. It checks authentication, role permissions, IMEI uniqueness, privacy, concurrent stock sales, payment idempotency, reversals, historical plan terms, returns and refunds.

See `TEST_RESULTS.md` for the latest verification results.

## Project structure

```text
royal-mobile/
  client/                 React storefront and admin panel
  api/                    Vercel serverless API entry point
  server/
    .env.example          Local SQLite and hosted PostgreSQL configuration template
    data/                 Local SQLite database created at runtime
    uploads/              Local phone images created at runtime
    db.js                 SQLite/PostgreSQL persistence and transaction layer
    migrate-sqlite-to-neon.js  Local SQLite and photo migration utility
    app.js                API, permissions and shop workflows
    finance.js            Installment calculation and schedule logic
    admin.js              First-admin setup
    test/                 Finance and API integration tests
  ISSUES.md               Readiness checklist and known boundaries
```

## Current boundaries

The first version supports one phone per sale, not multi-phone invoices. It stores phone units individually rather than grouping them in a separate model/variant catalog. Tables load records client-side; pagination and advanced date-filtered reports are follow-up improvements. Accounting profit, taxes, late fees, automated reminders, online payment gateways, reservations, password recovery, and MFA are not included. Database backups are manual. Neon and Vercel Blob are separate hosted services with separate limits and backup needs.
