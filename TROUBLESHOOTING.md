# Troubleshooting: Finance Values Not Showing

## Quick Fix

**1. Restart the server** (MOST IMPORTANT):
```bash
# Stop current server
pkill -f "node server.js"

# Restart
npm start
```

**2. Hard refresh browser**:
- Mac: `Cmd + Shift + R`
- Windows: `Ctrl + Shift + R`
- Or: Open DevTools (F12) → Right-click refresh → "Empty Cache and Hard Reload"

**3. Check browser console** (F12 → Console):
You should see logs like:
```
🔄 Loading dashboard data...
📊 Fetching finance data...
✅ Finance data received: {monthly: {...}, constants: {...}}
📋 Found 7 finance rows
✅ Updated Revenue: "$18.2k" → "$0"
✅ Finance display updated
```

## Common Issues

### Issue 1: Server Running Old Code
**Symptom**: API returns summed values instead of latest entries
**Fix**: Restart server (see above)

### Issue 2: Browser Cache
**Symptom**: Old JavaScript code running
**Fix**: Hard refresh browser (see above)

### Issue 3: Finance Section Not Found
**Symptom**: Console shows "Finance section not found!"
**Fix**: Check that `id="financeSection"` exists in HTML

### Issue 4: API Returns Wrong Data
**Test**: `curl http://localhost:3000/api/finance`
**Expected**: Latest entry per type (not sum)
**Fix**: Restart server to load new code

## Manual Test

Open browser console and run:
```javascript
// Force refresh finance data
fetch('/api/finance')
  .then(r => r.json())
  .then(data => {
    console.log('API Response:', data);
    // Manually update display
    document.querySelectorAll('#financeSection .info-row').forEach(row => {
      const label = row.querySelector('.info-label')?.textContent?.trim();
      const valueEl = row.querySelector('.info-value');
      if (label === 'Revenue' && data.monthly?.revenue !== undefined) {
        valueEl.textContent = '$' + (data.monthly.revenue / 1000).toFixed(1) + 'k';
        console.log('Updated Revenue to:', valueEl.textContent);
      }
      // Repeat for other fields...
    });
  });
```

## Expected Behavior

After restart, finance should show:
- **Latest entry per type** (not sum of all entries)
- **Month-to-date totals** (from 1st to today)
- **All values update** when you add new entries

## Still Not Working?

1. Check server logs for errors
2. Verify database has entries: `node -e "const db=require('./db/database'); console.log(db.prepare('SELECT * FROM finance_entries LIMIT 5').all())"`
3. Check browser Network tab - is `/api/finance` returning 200?
4. Check browser Console - any JavaScript errors?
