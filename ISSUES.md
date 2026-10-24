# Production readiness: local and hosted deployment boundaries

Status: open checklist included with the source; no external issue has been created.

## Summary

Local development uses SQLite. Hosted deployments use Neon PostgreSQL for shared shop records and Vercel Blob for persistent uploaded photos. Keep local database backups and hosted database/photo backups private.

## Acceptance checklist

- [ ] Run `npm install`, `npm test`, `npm run test:integration`, and `npm run build`.
- [ ] Verify the Neon PostgreSQL connection and Vercel Blob token using deployment environment variables.
- [ ] Migrate an existing SQLite database to an empty Neon database, including any referenced local photos, before deployment.
- [ ] Create the first admin and configure shop details and actual installment rates.
- [ ] Add sample phones with unique IMEIs and upload photos.
- [ ] Verify cash and installment sales update stock once.
- [ ] Verify partial payments, schedules, reversals, returns and refunds.
- [ ] Print a sample invoice and payment receipt.
- [ ] Stop local use, copy the SQLite database and uploads folder, then restore into a test copy.
- [ ] Ensure `server/.env`, `server/data`, and `server/uploads` are excluded from Git and protected on disk.

## Boundaries

Neon and Vercel Blob have provider-specific usage limits and backup needs. Keep deployment secrets out of Git and do not expose the local SQLite server to the internet. Automatic backups, accounting-grade reports, online payment processing, and multi-phone invoices are not included.
