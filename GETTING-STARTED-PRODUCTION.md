# Getting Started — Production Deployment

## Quick Overview

This guide covers deploying the audited PIM application to production with all optimizations and security enhancements enabled.

## Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (production)
- Sentry account (optional but recommended)
- SMTP server for email notifications (for 2FA)
- SharePoint/Microsoft Graph credentials
- Monday.com API token

## 1. Environment Setup

Copy `.env.local.example` to `.env.local` and configure:

```bash
cp .env.local.example .env.local
```

**Critical variables (must set before deployment):**

```bash
# Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/pim

# Security
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=$(openssl rand -base64 32)  # Generate random secret
OTP_2FA_ENABLED=true                        # Enable 2FA

# Error tracking
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project

# Email notifications (required for OTP 2FA)
SMTP_HOST=smtp.gmail.com                    # or your SMTP provider
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@your-domain.com

# Integrations
MONDAY_API_TOKEN=your-token
SHAREPOINT_TENANT_ID=...
SHAREPOINT_CLIENT_ID=...
SHAREPOINT_CLIENT_SECRET=...
SHAREPOINT_SITE_URL=https://...
SHAREPOINT_SITE_ID=...

# Logging
LOG_LEVEL=info                              # info|warn|error|debug
NODE_ENV=production
```

## 2. Initialize Database

Create the admin user:

```bash
npm run seed:admin
```

Seed vendors and test users (optional):

```bash
SEED_DOMAIN=yourdomain.com npm run seed
```

## 3. Build for Production

```bash
npm run build
```

Verify build succeeds with:
- ✓ TypeScript compilation
- ✓ ESLint (0 errors/warnings)
- ✓ Next.js static generation
- ✓ No warnings

## 4. Run Tests

```bash
npm test
```

All 18+ tests should pass.

## 5. Start Application

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

Or with PM2 (recommended):
```bash
pm2 start "npm start" --name "pim-app" --env production
```

## 6. Monitoring Setup

### Sentry
1. Go to sentry.io and create a project
2. Copy DSN into `SENTRY_DSN`
3. Configure alerts for critical errors
4. Monitor dashboard: `sentry.io/<org>/<project>`

### Logging
Logs are written to:
- Console: Real-time visibility
- Files (production only):
  - `/var/log/pim/error.log` — Errors only
  - `/var/log/pim/combined.log` — All logs
  - Rotated at 10MB, keeping 5-10 files

### Database
Monitor MongoDB connection pool:
```javascript
// In production logs, look for connection warnings
```

## 7. Verify Deployment

### Health Check
```bash
curl https://your-domain.com/api/health
# Should return: { "status": "ok" }
```

### Login Flow
1. Navigate to https://your-domain.com/login
2. Use admin credentials from seed
3. If OTP enabled: verify email receives code
4. Confirm successful login and 2FA

### Dashboard
1. Check /dashboard loads quickly (<2s)
2. Verify all charts render
3. Monitor Sentry for errors

### API Tests
```bash
# Test pagination
curl "https://your-domain.com/api/items?limit=50&skip=0"

# Should return:
# { items: [...], pagination: { skip, limit, total } }
```

## 8. Performance Optimization

### Monitor Performance
- Install New Relic, Datadog, or CloudWatch
- Track:
  - API response times (should be <200ms for list endpoints)
  - Database query times
  - Error rates
  - 2FA email delivery time

### Scale Considerations
- **<1000 items:** Current setup fine
- **1000-10k items:** Monitor dashboard load; may need caching
- **10k+ items:** Implement Redis for rate limiting; add query caching
- **100k+ items:** Consider database sharding; implement cursor pagination

## 9. Security Hardening

### Before First Production Deploy
- [ ] HTTPS enforced (HSTS header enabled in production)
- [ ] NEXTAUTH_SECRET set to strong random value
- [ ] OTP_2FA_ENABLED=true
- [ ] SENTRY_DSN configured
- [ ] Database backups enabled in MongoDB Atlas
- [ ] IP whitelist for database (if applicable)
- [ ] Secrets not in version control

### Ongoing
- [ ] Monitor Sentry for security-related errors
- [ ] Review auth logs weekly for suspicious activity
- [ ] Rotate secrets quarterly
- [ ] Keep dependencies updated: `npm audit fix`

## 10. Backup & Recovery

### MongoDB Atlas
1. Enable automated backups in cluster settings
2. Set retention to 30+ days
3. Test restore procedure monthly

### Environment Variables
Store secrets securely (not in Git):
- Use environment manager (Vercel, Heroku, etc.)
- Or deploy-time secret injection
- Or dedicated secrets store (HashiCorp Vault, AWS Secrets Manager)

### Database
```bash
# Manual backup (if needed)
mongodump --uri="$MONGODB_URI" --out=backup-$(date +%Y%m%d)
```

## Deployment Timeline

| Step | Time | Command |
|------|------|---------|
| Setup | 10 min | Configure .env.local |
| Init DB | 5 min | npm run seed:admin |
| Build | 15 min | npm run build |
| Test | 2 min | npm test |
| Deploy | 5 min | Deploy to server |
| Verify | 5 min | Health checks |
| Monitor | Ongoing | Sentry + logs |

**Total:** ~45 minutes for initial deployment

## Troubleshooting

### Build Fails
```bash
npm run typecheck          # Find TS errors
npm run lint               # Find lint errors
npm run build -- --debug   # Verbose build output
```

### Tests Fail
```bash
npm test -- --verbose     # Show test output
npm test -- --watch       # Debug individual tests
```

### Database Connection Error
```bash
# Check MONGODB_URI is correct
# Test connection manually:
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('OK'))"
```

### 2FA Emails Not Sending
```bash
# Verify SMTP settings
# Check logs: tail -f /var/log/pim/combined.log
# Look for SMTP errors
```

### High Dashboard Load Time
```bash
# Check database indexes are created
# Verify aggregation pipeline executing in MongoDB
# Monitor database logs for slow queries
```

## Support

- **Audit History & Implementation Details:** See AUDIT-HISTORY.md
- **Environment Setup:** See .env.local.example
- **Logs:** /var/log/pim/ (production)
- **Errors:** Sentry dashboard (production)

## Security Reminders

🔒 **Do NOT:**
- Commit .env.local to Git
- Share NEXTAUTH_SECRET
- Use default passwords
- Disable 2FA (`OTP_2FA_ENABLED=false`)
- Ignore Sentry errors
- Run with `NODE_ENV=development` in production

✅ **Do:**
- Rotate secrets regularly
- Monitor logs and Sentry daily
- Keep Node/npm updated
- Test in staging before production
- Enable database backups
- Document your deployment process

---

**Ready to deploy?** Follow the steps above and monitor closely for the first 24 hours.
