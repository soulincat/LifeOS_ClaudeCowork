# TODO: What's Left to Do

## ✅ Completed
- [x] Database schema and setup (SQLite)
- [x] API route structure
- [x] Frontend API integration
- [x] Desktop notifications (weekly/monthly reminders)
- [x] Basic integrations structure (Whoop, GitHub, Stripe, Wise, Soulinsocial)
- [x] Todo list functionality
- [x] Health metrics display
- [x] Finance display
- [x] Projects display
- [x] Social metrics display
- [x] Scheduled posts display
- [x] Upcoming items display
- [x] AGENT chat integration (Claude API)

## 🔧 Optional Enhancements (Not Critical)

### 1. API Integrations (Optional - Only if you want automated data)
- [ ] **Stripe API** - Implement actual Stripe SDK integration for revenue/profit
  - Install: `npm install stripe`
  - Add `STRIPE_SECRET_KEY` to `.env`
  - Currently: Placeholder only
  
- [ ] **Wise API** - Implement Wise API for spending transactions
  - Add `WISE_API_TOKEN` to `.env`
  - Currently: Placeholder only
  
- [ ] **Whoop API** - Test and verify Whoop integration
  - Add `WHOOP_API_TOKEN` to `.env`
  - Currently: Structure ready, needs API token and testing
  
- [ ] **GitHub API** - Test GitHub integration for project commit dates
  - Add `GITHUB_TOKEN` to `.env`
  - Currently: Structure ready, needs token

### 2. Auto-Load on Laptop Open
- [ ] **macOS Auto-Launch** - Set up LaunchAgent to auto-start server and open browser
  - Create LaunchAgent plist to run `npm start` on login
  - Auto-open browser to `http://localhost:3000`
  - Currently: Manual start required

### 3. Email Integration
- [ ] **Email API** - Connect to Gmail/email provider
  - Gmail API or IMAP integration
  - Fetch important emails
  - Currently: Static placeholder data

### 4. Data Sync Automation
- [ ] **Scheduled Sync Jobs** - Set up cron/LaunchAgent for daily/weekly syncs
  - Daily: Whoop health metrics
  - Weekly: Stripe revenue, social metrics
  - Monthly: Finance aggregation
  - Currently: Manual sync only

### 5. Soulinsocial Integration
- [ ] **Complete Integration** - Full integration with local soulinsocial project
  - Read from actual soulinsocial database/file structure
  - Sync scheduled posts automatically
  - Sync social metrics
  - Currently: Basic structure, needs soulinsocial project structure

### 6. UI/UX Improvements
- [ ] **Loading States** - Show loading indicators while fetching data
- [ ] **Error Handling** - Better error messages for failed API calls
- [ ] **Empty States** - Show helpful messages when no data available
- [ ] **Refresh Button** - Manual refresh button for data
- [ ] **Dark Mode** - Toggle dark/light theme

### 7. Features
- [ ] **Historical Charts** - Visualize health/finance trends over time
- [ ] **Add Todo** - UI to add new todos (currently only via API)
- [ ] **Edit Todos** - Inline editing for todos
- [ ] **Add Upcoming Items** - UI to add deadlines/meetings
- [ ] **Finance Input Form** - UI for manual finance entry
- [ ] **Health Input Form** - UI for manual health metrics entry

### 8. Testing & Quality
- [ ] **Unit Tests** - Test API routes
- [ ] **Integration Tests** - Test database operations
- [ ] **E2E Tests** - Test frontend interactions
- [ ] **Error Logging** - Better error logging and monitoring

## 🚀 Quick Wins (Easy to Implement)

1. **Add Todo Button** - Quick UI addition to create todos
2. **Refresh Button** - Simple button to reload all data
3. **Auto-Launch Setup** - Create LaunchAgent for auto-start
4. **Loading Spinners** - Add loading states to API calls
5. **Error Toasts** - Show error messages in UI

## 📝 Documentation
- [x] Basic README
- [x] API endpoints documented
- [ ] API integration guide (how to set up each API)
- [ ] Troubleshooting guide
- [ ] Development guide

## 🎯 Priority Recommendations

**High Priority:**
1. Auto-launch setup (so dashboard opens automatically)
2. Add Todo button (improve UX)
3. Loading states (better UX)

**Medium Priority:**
4. Email integration (if you use email a lot)
5. Historical charts (visualize trends)
6. Finance input form (easier manual entry)

**Low Priority:**
7. Stripe/Wise integration (only if you want automated finance)
8. Dark mode (nice to have)
9. Testing (if you plan to expand)

---

**Current Status:** The dashboard is fully functional with manual data entry and API-ready structure. All core features work. Optional enhancements can be added as needed.
