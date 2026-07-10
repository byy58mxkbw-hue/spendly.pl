# Spendly - Food Cost Management System

Professional cost control and invoice analysis system for restaurants. Integrates with Polish KSeF tax system.

## 📁 Project Structure

```
spendly/
├── artifacts/              # Deployable applications
│   ├── api-server/        # Node.js Express backend (port 8080)
│   ├── ksef-monitor/      # React frontend dashboard (port 3000)
│   ├── spendly-mobile/    # React Native mobile app
│   └── mockup-sandbox/    # Component sandbox
├── lib/                   # Shared libraries
│   ├── api-spec/          # OpenAPI schema
│   ├── api-zod/           # Schema validation
│   ├── api-client-react/  # React API hooks
│   ├── db/                # Drizzle ORM database layer
│   ├── ksef-client/       # Polish tax system API client
│   └── integrations-openai-*/  # OpenAI integration
├── scripts/               # Utilities
│   ├── src/               # E2E tests, background jobs
│   └── migrations/        # Database migration scripts
├── docs/                  # Documentation & assets
│   ├── kod-do-oceny.md    # Code review notes
│   ├── seo_strategy.md    # SEO planning
│   ├── threat_model.md    # Security threat analysis
│   ├── assets/            # Screenshots & design references
│   └── *.txt              # Data exports
├── node_modules/          # Dependencies
├── package.json           # Workspace root config
├── pnpm-workspace.yaml    # pnpm monorepo config
└── tsconfig.json          # TypeScript config
```

## 🚀 Quick Start (Development)

### Prerequisites
- **Node.js 24+**
- **pnpm 11+** (package manager)
- **PostgreSQL** (via Neon - cloud provider)
- **Clerk** (authentication)

### Setup

1. **Install dependencies**
   ```bash
   cd C:\Users\nowys\spendly
   pnpm install
   ```

2. **Configure environment**
   - API Server: `.env` (already configured with DATABASE_URL, Clerk keys)
   - Frontend: `artifacts/ksef-monitor/.env.local` (already configured)

3. **Start local development**
   ```bash
   # Terminal 1: API Server (port 8080)
   cd artifacts/api-server
   pnpm dev

   # Terminal 2: Frontend (port 3000)
   cd artifacts/ksef-monitor
   pnpm dev
   ```

4. **Access application**
   - Frontend: http://localhost:3000
   - API: http://localhost:8080

### Login Credentials
- **Email**: Patryczek12@icloud.com (registered with iCloud SSO)
- **Production Data**: ~2,160 products, 436 invoices, 39 suppliers (loaded)

## 📊 Current Status

✅ **Working**
- Clerk authentication (OAuth via iCloud)
- API server with PostgreSQL (Neon)
- Frontend dashboard with product/invoice data
- Data loaded from production backup

⚠️ **Partially Implemented**
- KSeF integration (config saved, not yet activated)
- OpenAI ChatBot integration (framework in place)
- Mobile app (React Native - compilable)

## 🔧 Key Files

| File | Purpose |
|------|---------|
| `.env` | Database URL, Clerk API keys, encryption key |
| `artifacts/ksef-monitor/.env.local` | Frontend config (API base URL, Clerk key) |
| `pnpm-workspace.yaml` | Monorepo configuration, security policies |
| `lib/db/schema` | Drizzle ORM schema (database structure) |
| `scripts/migrations/` | Database setup and migration scripts |

## 📝 Database Setup

Database runs on PostgreSQL:

```bash
# Load production data (if needed)
cd C:\Users\nowys\Downloads
node C:\Users\nowys\spendly\scripts\migrations\load-backup-clean.js
```

## 📚 Documentation

See `docs/` folder:
- `kod-do-oceny.md` - Code review & architecture notes
- `seo_strategy.md` - SEO planning
- `threat_model.md` - Security threat analysis
- `assets/` - Screenshots and design references

## 🧪 Testing

Run dashboard locally and test:
- ✅ Login/logout
- ✅ View suppliers, products, invoices
- ✅ Product categorization
- ✅ Invoice filtering & search
- ✅ Dashboard statistics
- ⚠️ KSeF sync (requires NIP & token)
- ⚠️ OpenAI integration (requires API key)

## 🚢 Deployment

Frontend & API are ready for deployment. See deployment guides in `docs/`.

## 📞 Support

For detailed architecture and implementation notes, see `docs/kod-do-oceny.md`.

---

**Last Updated**: June 18, 2026
**Maintainer**: User (Patryczek12@icloud.com)
