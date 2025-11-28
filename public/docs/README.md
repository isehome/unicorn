# Unicorn Documentation

## 📚 Documentation Index

This folder contains all documentation for the Unicorn project management application.

---

## Quick Start

| I want to... | Read this |
|--------------|-----------|
| Understand the whole system | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| Deploy the application | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Fix a problem | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| Work on wire drops | [WIRE_DROPS.md](WIRE_DROPS.md) |
| Work on procurement | [PROCUREMENT.md](PROCUREMENT.md) |
| Work on integrations | [INTEGRATIONS.md](INTEGRATIONS.md) |

---

## Documentation Files

### Core Documentation

| File | Description |
|------|-------------|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Complete system overview, tech stack, architecture |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Environment setup, Vercel deployment, configuration |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and solutions |
| [AUTHENTICATION.md](AUTHENTICATION.md) | MSAL auth flow, RLS policies, security |

### Feature Documentation

| File | Description |
|------|-------------|
| [WIRE_DROPS.md](WIRE_DROPS.md) | Wire drop system architecture and workflows |
| [EQUIPMENT.md](EQUIPMENT.md) | Equipment management, CSV import, parts catalog |
| [PROCUREMENT.md](PROCUREMENT.md) | Purchase orders, vendors, receiving workflow |
| [MILESTONES.md](MILESTONES.md) | Progress gauges, milestone calculations |

### Integration Documentation

| File | Description |
|------|-------------|
| [INTEGRATIONS.md](INTEGRATIONS.md) | Overview of all third-party integrations |
| [UNIFI_INTEGRATION.md](UNIFI_INTEGRATION.md) | UniFi Network API setup and usage |
| [SHAREPOINT.md](SHAREPOINT.md) | SharePoint/OneDrive photo storage |

### Reference

| File | Description |
|------|-------------|
| [CODE_ANALYSIS.md](CODE_ANALYSIS.md) | Codebase analysis, cleanup opportunities |
| [ROADMAP.md](ROADMAP.md) | Future features and enhancements |

---

## Key Concepts

### User Roles
- **Technician**: Field worker - completes wire drops, receives parts, logs issues
- **Project Manager (PM)**: Oversees projects, manages equipment, generates POs

### Three-Stage Wire Drop Workflow
1. **Prewire** - Initial cable run (photo required)
2. **Trim-Out** - Device mounting (photo + equipment required)
3. **Commissioning** - Testing, head-end connection (photo required)

### Three-Tier Equipment System
1. **Global Parts** - Master catalog (reusable across projects)
2. **Project Equipment** - Instances for specific project (from CSV import)
3. **Wire Drop Links** - Which equipment at which drop location

---

## Updating Documentation

When making changes to the codebase:

1. **New feature?** → Update relevant feature doc + PROJECT_OVERVIEW.md
2. **Bug fix?** → Add to TROUBLESHOOTING.md if it's a common issue
3. **New integration?** → Add to INTEGRATIONS.md + create detailed doc if complex
4. **Database change?** → Update relevant feature doc + add migration to database/

See [../CLAUDE.md](../CLAUDE.md) for complete guidelines on maintaining documentation.

---

*Last Updated: November 2025*