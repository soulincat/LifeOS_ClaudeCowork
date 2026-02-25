# Changelog

All notable changes to LifeOS are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-02-24

### Added
- **Self-host infrastructure**: Config layer, BYOK Claude client, connector registry for extensible integrations
- **Onboarding wizard**: 6-step setup including profile, priorities, integrations, project, PA key, Telegram alerts
- **Personalized priorities**: Users set life areas, VIP contacts, urgency keywords, PA communication style
- **Update management system**: Version checking, one-click updates, automatic migrations, database backups
- **Inbox priority system**: Contact reputation (VIP/blocked/ignored), per-project keyword matching, tiered messaging
- **Project detail panel**: Phase stepper, milestone tracker, task dependencies, progress visualization
- **Connector base class**: Standardized interface for all integrations (Whoop, WhatsApp, Telegram, email, etc.)
- **Dashboard widget config**: Conditional rendering of projects, projections, social metrics, health, finance

### Changed
- **Directory structure**: Moved API routes to `core/api/`, integrations to `integrations/`, dashboard to `dashboard/`, onboarding to `onboarding/`
- **Server boot**: Registry-based connector loading replaces hardcoded startup
- **PA context**: Now includes user priorities (life focus, urgency keywords, communication style)
- **Telegram alerts**: Optional onboarding step, configurable chat ID for security

### Fixed
- Setup sections table creation (baseline migration)
- Widget config loading before rendering optional sections
- Claude client signature mismatch in Telegram integration

---

## [0.1.0] - 2026-01-15

### Initial Release
- Core LifeOS dashboard with tabs (Home, Dashboard, Projections, Wishlist)
- Inbox with email/WhatsApp/SMS unification
- Todos, upcoming items, calendar sync
- Finance tracker (revenue, spending, net worth)
- Projects with milestones and tasks
- Health integration (Whoop recovery/sleep/HRV)
- PA (executive assistant) chat powered by Claude
- Social metrics dashboard
- Contacts system with relationship tracking
- WhatsApp integration via MCP
- Telegram briefing bot
- Goals and decision triggers

---

## Unreleased

### Planned
- Mobile app (React Native)
- Real-time collaboration for shared projects
- Advanced reporting and insights
- Workflow automation (IFTTT-like triggers)
- AI-powered recommendations
- Dark mode (UI work complete, theme system ready)

